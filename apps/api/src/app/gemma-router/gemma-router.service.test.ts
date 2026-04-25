import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GemmaRouterService } from './gemma-router.service';
import type { ConfigService } from '../config/config.service';

function makeConfig(overrides: Partial<{
  enabled: boolean;
  url: string;
  model: string;
  timeoutMs: number;
  threshold: number;
}> = {}): ConfigService {
  return {
    isGemmaRouterEnabled: () => overrides.enabled ?? true,
    getGemmaUrl: () => overrides.url ?? 'http://localhost:11434',
    getGemmaModel: () => overrides.model ?? 'gemma3:4b',
    getGemmaTimeoutMs: () => overrides.timeoutMs ?? 3000,
    getGemmaConfidenceThreshold: () => overrides.threshold ?? 0.80,
  } as unknown as ConfigService;
}

function makeService(config: ConfigService): GemmaRouterService {
  return new GemmaRouterService(config);
}

describe('GemmaRouterService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('when disabled via config', () => {
    it('returns skipped result without calling Ollama', async () => {
      const service = makeService(makeConfig({ enabled: false }));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await service.analyze('what is my email?', ['fibe_me']);
      expect(result.skipped).toBe(true);
      expect(result.tools).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('when no MCP tools are provided', () => {
    it('returns skipped result', async () => {
      const service = makeService(makeConfig({ enabled: true }));
      // Simulate Ollama available
      (service as unknown as { isAvailable: boolean }).isAvailable = true;
      const result = await service.analyze('hello', []);
      expect(result.skipped).toBe(true);
    });
  });

  describe('when Ollama is available', () => {
    let service: GemmaRouterService;

    beforeEach(() => {
      service = makeService(makeConfig());
      (service as unknown as { isAvailable: boolean }).isAvailable = true;
    });

    it('returns tools and confidence on valid JSON response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '{"tools":["fibe_me"],"confidence":0.92}' }),
      } as Response);

      const result = await service.analyze('what is my email?', ['fibe_me', 'fibe_playgrounds_get']);
      expect(result.skipped).toBe(false);
      expect(result.tools).toEqual(['fibe_me']);
      expect(result.confidence).toBeCloseTo(0.92);
    });

    it('handles markdown-wrapped JSON from Ollama', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '```json\n{"tools":["fibe_me"],"confidence":0.85}\n```' }),
      } as Response);

      const result = await service.analyze('show my profile', ['fibe_me']);
      expect(result.skipped).toBe(false);
      expect(result.tools).toEqual(['fibe_me']);
    });

    it('returns skipped on HTTP error from Ollama', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      const result = await service.analyze('hello', ['fibe_me']);
      expect(result.skipped).toBe(true);
    });

    it('returns skipped when Ollama fetch throws (e.g. timeout)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('AbortError'));
      const result = await service.analyze('hello', ['fibe_me']);
      expect(result.skipped).toBe(true);
    });

    it('returns skipped when Gemma returns invalid JSON', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Sure! I can help with that.' }),
      } as Response);

      const result = await service.analyze('hello', ['fibe_me']);
      expect(result.skipped).toBe(true);
    });

    it('clamps confidence to [0, 1]', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '{"tools":[],"confidence":1.5}' }),
      } as Response);

      const result = await service.analyze('hello', ['fibe_me']);
      expect(result.confidence).toBe(1);
    });

    it('ignores non-string entries in tools array', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '{"tools":["fibe_me",42,null],"confidence":0.9}' }),
      } as Response);

      const result = await service.analyze('hello', ['fibe_me']);
      expect(result.tools).toEqual(['fibe_me']);
    });
  });

  describe('probe on module init', () => {
    it('sets isAvailable=true when Ollama responds ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response);
      const service = makeService(makeConfig());
      await service.onModuleInit();
      expect((service as unknown as { isAvailable: boolean }).isAvailable).toBe(true);
    });

    it('sets isAvailable=false when Ollama is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const service = makeService(makeConfig());
      await service.onModuleInit();
      expect((service as unknown as { isAvailable: boolean }).isAvailable).toBe(false);
    });

    it('skips probe entirely when disabled', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const service = makeService(makeConfig({ enabled: false }));
      await service.onModuleInit();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
