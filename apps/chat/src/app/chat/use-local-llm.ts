import { useCallback, useEffect, useRef, useState } from 'react';
import { CreateWebWorkerMLCEngine, InitProgressReport, MLCEngineInterface, ChatCompletionMessageParam } from '@mlc-ai/web-llm';

export interface LocalLlmProgress {
  status: string;
  name: string;
  progress?: number;
  file?: string;
  loaded?: number;
  total?: number;
}

export function useLocalLlm() {
  const [isReady, setIsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<LocalLlmProgress[]>([]);
  
  // Keep track of the engine interface returned by WebLLM
  const engineRef = useRef<MLCEngineInterface | null>(null);

  useEffect(() => {
    let active = true;

    const initializeEngine = async () => {
      // Create the raw worker pointing to our clean handler
      const worker = new Worker(new URL('./workers/llm.worker.ts', import.meta.url), {
        type: 'module',
      });

      // Llama-3 8B or Phi-3 are both excellent for holding large 5000+ token context
      const selectedModel = 'Phi-3-mini-4k-instruct-q4f16_1-MLC';

      try {
        const engine = await CreateWebWorkerMLCEngine(
          worker,
          selectedModel,
          {
            initProgressCallback: (info: InitProgressReport) => {
              if (!active) return;
              // Map WebLLM progress events to match our internal array format for the UI
              setProgress((prev) => {
                const updated = [...prev];
                updated[0] = {
                  status: 'download',
                  name: selectedModel,
                  progress: info.progress * 100,
                  file: info.text,
                };
                return updated;
              });
            },
          }
        );

        if (active) {
          engineRef.current = engine;
          setIsReady(true);
        }
      } catch (err) {
        console.error('Failed to load WebLLM Engine:', err);
      }
    };

    initializeEngine();

    return () => {
      active = false;
      if (engineRef.current) {
        engineRef.current.unload().catch(console.error);
        engineRef.current = null;
      }
    };
  }, []);

  const generate = useCallback(async (messages: ChatCompletionMessageParam[]): Promise<string> => {
    if (!engineRef.current) {
      throw new Error('LLM Engine not initialized');
    }

    setIsGenerating(true);
    let finalOutput = '';

    try {
      // Use OpenAI-alike Chat Completions API
      const reply = await engineRef.current.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      });

      finalOutput = reply.choices[0]?.message?.content || '';
    } catch (err) {
      console.error('LLM Generation Error:', err);
      throw err;
    } finally {
      setIsGenerating(false);
    }

    return finalOutput;
  }, []);

  return {
    isReady,
    isGenerating,
    progress,
    generate,
  };
}
