/** @vitest-environment jsdom */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocalLlm } from './use-local-llm';
import * as webllm from '@mlc-ai/web-llm';

vi.mock('@mlc-ai/web-llm', () => {
  return {
    CreateWebWorkerMLCEngine: vi.fn(),
  };
});

describe('useLocalLlm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes the engine and sets isReady to true', async () => {
    const mockEngine = {
      unload: vi.fn().mockResolvedValue(undefined),
      chat: {
        completions: {
          create: vi.fn(),
        }
      }
    };
    
    (webllm.CreateWebWorkerMLCEngine as any).mockResolvedValue(mockEngine as any);

    const { result } = renderHook(() => useLocalLlm());

    expect(result.current.isReady).toBe(false);

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  it('handles generation correctly', async () => {
    const mockEngine = {
      unload: vi.fn().mockResolvedValue(undefined),
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }]
          }),
        }
      }
    };
    
    (webllm.CreateWebWorkerMLCEngine as any).mockResolvedValue(mockEngine as any);

    const { result } = renderHook(() => useLocalLlm());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    let output = '';
    await act(async () => {
      output = await result.current.generate([{ role: 'user', content: 'hello' }]);
    });

    expect(output).toBe('test response');
    expect(mockEngine.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: 'hello' }]
    }));
  });

  it('updates progress via initProgressCallback', async () => {
      let capturedCallback: any = null;
      (webllm.CreateWebWorkerMLCEngine as any).mockImplementation(async (worker: any, model: any, opts: any) => {
          if (opts?.initProgressCallback) {
              capturedCallback = opts.initProgressCallback;
          }
          return { unload: vi.fn().mockResolvedValue(undefined) } as any;
      });

      const { result } = renderHook(() => useLocalLlm());
      
      // Wait for the initialization promise to kick off the effect and capture the callback
      await waitFor(() => {
          expect(capturedCallback).not.toBeNull();
      });

      act(() => {
          capturedCallback({ progress: 0.5, text: 'loading weights' });
      });

      expect(result.current.progress.length).toBe(1);
      expect(result.current.progress[0].progress).toBe(50);
      expect(result.current.progress[0].file).toBe('loading weights');
  });
});
