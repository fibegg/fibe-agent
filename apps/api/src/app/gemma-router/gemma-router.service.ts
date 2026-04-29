import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import type { GemmaRouterResult } from './gemma-router.types';

const UNAVAILABLE_RESULT: GemmaRouterResult = { skipped: true };
/**
 * GemmaRouterService
 *
 * Calls a local Ollama instance to classify a user message and suggest
 * which MCP tools might be relevant before the main agent strategy runs.
 *
 * Gracefully degrades: if Ollama is not running, not yet loaded, or times out,
 * it returns a "skipped" result so the caller can proceed unchanged.
 *
 * Optimizations:
 * - Lazy re-probe: if Ollama was down at startup, re-checks before each request.
 * - Model warm-up: after a successful probe, fires a tiny dummy inference so the
 *   model is loaded into VRAM before the first real user message arrives.
 */
@Injectable()
export class GemmaRouterService implements OnModuleInit {
  private readonly logger = new Logger(GemmaRouterService.name);
  private isAvailable = false;
  /** Prevents multiple concurrent warm-up calls */
  private warmUpDone = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.isGemmaRouterEnabled()) {
      this.logger.log('GemmaRouter disabled (GEMMA_ROUTER_ENABLED is not set to true)');
      return;
    }
    await this.probe();
    if (this.isAvailable) {
      // Warm up the model in the background — don't block server startup
      void this.warmUpModel();
    }
  }

  /**
   * Probes Ollama availability.
   * Called once at startup, and lazily before each request if isAvailable=false.
   */
  private async probe(): Promise<void> {
    try {
      const url = this.config.getGemmaUrl();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        this.isAvailable = true;
        this.logger.log(`Ollama available at ${url} — GemmaRouter ready (model: ${this.config.getGemmaModel()})`);
      } else {
        this.logger.warn(`Ollama responded with status ${res.status} — GemmaRouter will be skipped`);
      }
    } catch {
      this.logger.warn('Ollama not reachable at startup — GemmaRouter will be skipped until next restart');
    }
  }

  /**
   * Fires a minimal dummy inference to force Ollama to load the model into VRAM.
   * This eliminates the 10-30s cold-start latency on the first real user request.
   * Runs non-blocking; failures are silently ignored.
   */
  private async warmUpModel(): Promise<void> {
    if (this.warmUpDone) return;
    this.warmUpDone = true;
    try {
      const url = this.config.getGemmaUrl();
      const model = this.config.getGemmaModel();
      const controller = new AbortController();
      // Give warm-up up to 60s — model load can take a while on first pull
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
        this.logger.log(`[GemmaRouter] Model warm-up complete — ${model} is ready`);
      }
    } catch {
      // Warm-up failure is non-fatal; the first real request will pay the latency cost instead
      this.logger.debug('[GemmaRouter] Model warm-up timed out or failed (non-fatal)');
    }
  }

  /**
   * Analyzes a user message and returns suggested MCP tool names with confidence.
   *
   * @param userText - The raw user message text.
   * @param mcpTools - Available MCP tools. Can be simple names or name+description pairs.
   * @returns A GemmaRouterResult. If skipped=true, the caller should not modify the prompt.
   */
  async analyze(
    userText: string,
    mcpTools: string[] | Array<{ name: string; description: string }>,
  ): Promise<GemmaRouterResult> {
    if (!this.config.isGemmaRouterEnabled()) {
      return UNAVAILABLE_RESULT;
    }

    // Lazy re-probe: if Ollama was down at startup, retry before giving up
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
      // Mark unavailable so next request re-probes rather than immediately failing
      this.isAvailable = false;
      return UNAVAILABLE_RESULT;
    }
  }

  private buildClassificationPrompt(
    userText: string,
    mcpTools: string[] | Array<{ name: string; description: string }>,
  ): string {
    // Format tool list — include descriptions when available for better accuracy
    const toolList = mcpTools
      .map((t) =>
        typeof t === 'string' ? t : `${t.name} (${t.description})`
      )
      .join(', ');

    const toolNames = mcpTools
      .map((t) => (typeof t === 'string' ? t : t.name))
      .join(', ');

    return `You are an intent router for a coding assistant. Given a user message and a list of available MCP tool names, you must decide how to handle the request.

Output ONLY a single valid JSON object with no extra text, no markdown, no explanation.

Decision 1: Direct CLI Command
If the user's intent is simple and can be answered immediately by running a fibe CLI command (like checking playgrounds), output:
{"type": "EXECUTE_CLI", "command": "fibe playgrounds list"}

Decision 2: Delegate to Heavy Agent
If the user wants to write code, build an app, or requires complex reasoning, delegate the task and suggest tools:
{"type": "DELEGATE_TO_AGENT", "tools": ["tool_name_1"], "confidence": 0.8}

Rules for DELEGATE_TO_AGENT:
- "tools" must be a subset of these exact tool names: ${toolNames}
- "confidence" is a float between 0.0 and 1.0 reflecting how sure you are those tools are needed.
- If the message is general chat or coding work that doesn't need any specific tool, return {"type": "DELEGATE_TO_AGENT", "tools": [], "confidence": 0.0}.

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

    const body = await res.json() as { response?: string };
    const raw = body.response?.trim() ?? '';

    return this.parseResponse(raw);
  }

  private parseResponse(raw: string): GemmaRouterResult {
    try {
      // Ollama sometimes wraps in markdown code fences even with format:json
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      if (parsed.type === 'EXECUTE_CLI') {
        return {
          action: {
            type: 'EXECUTE_CLI',
            command: typeof parsed.command === 'string' ? parsed.command : '',
            reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
          },
          skipped: false,
        };
      }

      const tools = Array.isArray(parsed.tools)
        ? (parsed.tools as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];

      const confidence = typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;

      return {
        action: { type: 'DELEGATE_TO_AGENT', tools, confidence },
        skipped: false,
      };
    } catch {
      this.logger.debug(`Could not parse Gemma response as JSON: ${raw.slice(0, 120)}`);
      return UNAVAILABLE_RESULT;
    }
  }
}
