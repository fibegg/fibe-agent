import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface LocalSttProgress {
  status: string;
  name: string;
  progress?: number;
  file?: string;
  loaded?: number;
  total?: number;
}

export function useLocalStt() {
  const [isReady, setIsReady] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState<LocalSttProgress[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Create the worker
    workerRef.current = new Worker(new URL('./workers/stt.worker.ts', import.meta.url), {
      type: 'module',
    });

    const onMessageReceived = (e: MessageEvent) => {
      switch (e.data.type) {
        case 'progress': {
          const { status, name } = e.data.progress;
          if (status === 'ready') {
            setIsReady(true);
          }
          if (status === 'progress' || status === 'init' || status === 'download') {
            setProgress((prev) => {
              const existingIndex = prev.findIndex((p) => p.file === e.data.progress.file && p.name === name);
              if (existingIndex !== -1) {
                const next = [...prev];
                next[existingIndex] = e.data.progress;
                return next;
              }
              return [...prev, e.data.progress];
            });
          }
          break;
        }
      }
    };

    workerRef.current.addEventListener('message', onMessageReceived);

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const transcribe = useCallback((audioUrlOrBlob: string | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      setIsTranscribing(true);
      const id = Date.now().toString();

      const onMessage = (e: MessageEvent) => {
        if (e.data.id === id) {
          if (e.data.type === 'complete') {
            workerRef.current?.removeEventListener('message', onMessage);
            setIsTranscribing(false);
            resolve(e.data.text);
          } else if (e.data.type === 'error') {
            workerRef.current?.removeEventListener('message', onMessage);
            setIsTranscribing(false);
            reject(new Error(e.data.error));
          }
        }
      };

      workerRef.current.addEventListener('message', onMessage);

      const processAudio = async () => {
        try {
          let arrayBuffer: ArrayBuffer;
          if (typeof audioUrlOrBlob === 'string') {
            const res = await fetch(audioUrlOrBlob);
            arrayBuffer = await res.arrayBuffer();
          } else {
            arrayBuffer = await audioUrlOrBlob.arrayBuffer();
          }

        // Decode audio to PCM at 16kHz
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
        });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const float32Data = audioBuffer.getChannelData(0);

        workerRef.current?.postMessage({
          type: 'transcribe',
          id,
          audio: float32Data,
        });
        } catch (err) {
          workerRef.current?.removeEventListener('message', onMessage);
          setIsTranscribing(false);
          reject(err);
        }
      };
      
      processAudio();
    });
  }, []);

  return {
    isReady,
    isTranscribing,
    progress,
    transcribe,
  };
}
