import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { loadFibeSettings, type FibeSettings } from './fibe-settings';
import { DEFAULT_EFFORT, normalizeEffort, resolveEffort, type EffortValue } from '@shared/effort.constants';

function sanitizeConversationId(id: string): string {
  const sanitized = id
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized || 'default';
}

@Injectable()
export class ConfigService {
  private readonly settings: Readonly<FibeSettings>;

  constructor() {
    this.settings = Object.freeze(loadFibeSettings());
  }

  getAgentPassword(): string | undefined {
    return this.settings.agentPassword;
  }

  getModelOptions(): string[] {
    const raw = this.settings.modelOptions ?? '';
    const str = Array.isArray(raw) ? raw.join(',') : raw;
    return str.split(',').map((s: string) => s.trim()).filter(Boolean);
  }

  getDefaultModel(): string {
    const fromSettings = this.settings.defaultModel?.trim();
    if (fromSettings) return fromSettings;
    const options = this.getModelOptions();
    return options.length > 0 ? options[0] : '';
  }

  getDefaultEffort(): EffortValue {
    const fromSettings = normalizeEffort(this.settings.claudeEffort);
    if (fromSettings) return fromSettings;
    return resolveEffort(process.env.CLAUDE_EFFORT, DEFAULT_EFFORT);
  }

  getDataDir(): string {
    return this.settings.dataDir ?? join(process.cwd(), 'data');
  }

  getConversationId(): string {
    const raw =
      process.env.FIBE_AGENT_ID?.trim() ??
      process.env.CONVERSATION_ID?.trim() ??
      'default';
    return raw || 'default';
  }

  getConversationDataDir(): string {
    return join(this.getDataDir(), sanitizeConversationId(this.getConversationId()));
  }

  getSystemPrompt(): string | undefined {
    return this.settings.systemPrompt;
  }

  getPlaygroundsDir(): string {
    return process.env.PLAYGROUNDS_DIR ?? join(process.cwd(), 'playground');
  }

  getMarqueeRoot(): string {
    return this.settings.marqueeRoot ?? '/opt/fibe';
  }

  // Go SDK vars — from process.env (shared with CLI binary)
  getFibeApiKey(): string | undefined {
    return process.env.FIBE_API_KEY;
  }

  // Derived from FIBE_DOMAIN — no more FIBE_API_URL env var
  getFibeApiUrl(): string | undefined {
    const domain = process.env.FIBE_DOMAIN;
    if (!domain) return undefined;
    const host = domain.replace(/:\d+$/, '');
    const protocol = host.includes('localhost') || host.endsWith('.test') ? 'http' : 'https';
    return `${protocol}://${domain}`;
  }

  getFibeAgentId(): string | undefined {
    return process.env.FIBE_AGENT_ID;
  }

  isFibeSyncEnabled(): boolean {
    return this.settings.fibeSyncEnabled === true || process.env.FIBE_SYNC_ENABLED === 'true';
  }

  getPostInitScript(): string | undefined {
    return this.settings.postInitScript?.trim() || undefined;
  }

  getEncryptionKey(): string | undefined {
    return this.settings.encryptionKey;
  }

  getSessionDir(): string | undefined {
    return this.settings.sessionDir;
  }

  getMarqueeRootDomain(): string | undefined {
    return this.settings.marqueeRootDomain;
  }

  getMcpConfig(): { mcpServers: Record<string, unknown> } | undefined {
    return this.settings.mcpConfig;
  }

  getProviderArgs(): Record<string, unknown> | undefined {
    return this.settings.providerArgs;
  }

  getCliVersion(): string | undefined {
    return this.settings.cliVersion;
  }

  getSkillToggles(): Record<string, unknown> | undefined {
    return this.settings.skillToggles;
  }

  isSyscheckEnabled(): boolean {
    return this.settings.syscheckEnabled !== false;
  }

  // ─── Gemma Router (local LLM pre-processor via Ollama) ───────────

  isGemmaRouterEnabled(): boolean {
    return this.settings.gemmaRouterEnabled === true || process.env.GEMMA_ROUTER_ENABLED === 'true';
  }

  getGemmaUrl(): string {
    return this.settings.ollamaUrl?.trim() || process.env.OLLAMA_URL?.trim() || 'http://localhost:11434';
  }

  getGemmaModel(): string {
    return this.settings.gemmaModel?.trim() || process.env.GEMMA_MODEL?.trim() || 'gemma3:4b';
  }

  getGemmaConfidenceThreshold(): number {
    const val = this.settings.gemmaConfidenceThreshold ?? parseFloat(process.env.GEMMA_CONFIDENCE_THRESHOLD ?? '');
    return isNaN(val) ? 0.8 : Math.max(0, Math.min(1, val));
  }

  getGemmaTimeoutMs(): number {
    const val = this.settings.gemmaTimeoutMs ?? parseInt(process.env.GEMMA_TIMEOUT_MS ?? '', 10);
    return isNaN(val) ? 30000 : Math.max(500, val);
  }
}
