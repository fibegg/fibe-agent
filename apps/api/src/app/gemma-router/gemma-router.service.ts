import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import type { GemmaRouterResult } from './gemma-router.types';

const UNAVAILABLE_RESULT: GemmaRouterResult = { skipped: true };
/** Suggests MCP tools through local Ollama and skips cleanly when unavailable. */
@Injectable()
export class GemmaRouterService implements OnModuleInit {
  private readonly logger = new Logger(GemmaRouterService.name);
  private isAvailable = false;
  /** Prevents duplicate warm-up calls. */
  private warmUpDone = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.isGemmaRouterEnabled()) {
      this.logger.log(
        'GemmaRouter disabled (GEMMA_ROUTER_ENABLED is not set to true)',
      );
      return;
    }
    await this.probe();
    if (this.isAvailable) {
      void this.warmUpModel();
    }
  }

  /** Probes Ollama at startup and again after failures. */
  private async probe(): Promise<void> {
    try {
      const url = this.config.getGemmaUrl();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        this.isAvailable = true;
        this.logger.log(
          `Ollama available at ${url}: GemmaRouter ready (model: ${this.config.getGemmaModel()})`,
        );
      } else {
        this.logger.warn(
          `Ollama responded with status ${res.status}: GemmaRouter will be skipped`,
        );
      }
    } catch {
      this.logger.warn(
        'Ollama not reachable at startup: GemmaRouter will be skipped until next restart',
      );
    }
  }

  /** Warms the model without blocking startup. */
  private async warmUpModel(): Promise<void> {
    if (this.warmUpDone) return;
    this.warmUpDone = true;
    try {
      const url = this.config.getGemmaUrl();
      const model = this.config.getGemmaModel();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: 'hi',
          stream: false,
          format: 'json',
          options: { temperature: 0, num_predict: 1 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        this.logger.log(
          `[GemmaRouter] Model warm-up complete: ${model} is ready`,
        );
      }
    } catch {
      this.logger.debug(
        '[GemmaRouter] Model warm-up timed out or failed (non-fatal)',
      );
    }
  }

  /** Suggests relevant tools and confidence, or returns skipped. */
  async analyze(
    userText: string,
    mcpTools: string[] | Array<{ name: string; description: string }>,
  ): Promise<GemmaRouterResult> {
    if (!this.config.isGemmaRouterEnabled()) {
      return UNAVAILABLE_RESULT;
    }

    if (!this.isAvailable) {
      await this.probe();
      if (this.isAvailable && !this.warmUpDone) {
        void this.warmUpModel();
      }
      if (!this.isAvailable) {
        return UNAVAILABLE_RESULT;
      }
    }

    if (!mcpTools.length) {
      return UNAVAILABLE_RESULT;
    }

    const prompt = this.buildClassificationPrompt(userText, mcpTools);

    try {
      return await this.callOllama(prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`GemmaRouter call failed (will skip): ${msg}`);
      this.isAvailable = false;
      return UNAVAILABLE_RESULT;
    }
  }

  private buildClassificationPrompt(
    userText: string,
    mcpTools: string[] | Array<{ name: string; description: string }>,
  ): string {
    const toolList = mcpTools
      .map((t) => (typeof t === 'string' ? t : `${t.name} (${t.description})`))
      .join(', ');

    const toolNames = mcpTools
      .map((t) => (typeof t === 'string' ? t : t.name))
      .join(', ');

    return `Route this request for a coding assistant. Return one JSON object with no markdown or explanation.

For a simple request that a Fibe CLI command can answer immediately:
{"type": "EXECUTE_CLI", "command": "fibe playgrounds list"}

For coding, app building, complex reasoning, or general chat:
{"type": "DELEGATE_TO_AGENT", "tools": ["tool_name_1"], "confidence": 0.8}

Use only these exact tool names: ${toolNames}
Set confidence from 0.0 to 1.0. Use an empty tools list and 0.0 when no tool is needed.

Available MCP tools:
${toolList}

User message: "${userText}"

JSON:`;
  }

  private async callOllama(prompt: string): Promise<GemmaRouterResult> {
    const url = this.config.getGemmaUrl();
    const model = this.config.getGemmaModel();
    const timeoutMs = this.config.getGemmaTimeoutMs();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0.1, num_predict: 128 },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      this.logger.debug(`Ollama returned HTTP ${res.status}`);
      return UNAVAILABLE_RESULT;
    }

    const body = (await res.json()) as { response?: string };
    const raw = body.response?.trim() ?? '';

    return this.parseResponse(raw);
  }

  private parseResponse(raw: string): GemmaRouterResult {
    try {
      // Ollama sometimes wraps in markdown code fences even with format:json
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      if (parsed.type === 'EXECUTE_CLI') {
        return {
          action: {
            type: 'EXECUTE_CLI',
            command: typeof parsed.command === 'string' ? parsed.command : '',
            reason:
              typeof parsed.reason === 'string' ? parsed.reason : undefined,
          },
          skipped: false,
        };
      }

      const tools = Array.isArray(parsed.tools)
        ? (parsed.tools as unknown[]).filter(
            (t): t is string => typeof t === 'string',
          )
        : [];

      const confidence =
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0;

      return {
        action: { type: 'DELEGATE_TO_AGENT', tools, confidence },
        skipped: false,
      };
    } catch {
      this.logger.debug(
        `Could not parse Gemma response as JSON: ${raw.slice(0, 120)}`,
      );
      return UNAVAILABLE_RESULT;
    }
  }
}
