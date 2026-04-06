import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface LocalTtsProgress {
  status: string;
  name: string;
  progress?: number;
  file?: string;
  loaded?: number;
  total?: number;
}

export function useLocalTts() {
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [progress, setProgress] = useState<LocalTtsProgress[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/tts.worker.ts', import.meta.url), {
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
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!text.trim()) {
        resolve();
        return;
      }
      if (!workerRef.current) {
        reject(new Error('TTS Worker not initialized'));
        return;
      }

      setIsSpeaking(true);
      const id = Date.now().toString();

      const onMessage = async (e: MessageEvent) => {
        if (e.data.id === id) {
          if (e.data.type === 'complete') {
            workerRef.current?.removeEventListener('message', onMessage);
            
            try {
              if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                const AC = window.AudioContext || window.webkitAudioContext;
                audioContextRef.current = new AC({ sampleRate: e.data.sampling_rate });
              }

              const audioContext = audioContextRef.current;
              if (audioContext.state === 'suspended') {
                await audioContext.resume();
              }
              
              // Create an empty, mono audio buffer
              const audioBuffer = audioContext.createBuffer(
                1,
                e.data.audio.length,
                e.data.sampling_rate
              );
              
              audioBuffer.copyToChannel(e.data.audio, 0);

              if (currentSourceRef.current) {
                currentSourceRef.current.stop();
              }

              const source = audioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContext.destination);
              
              source.onended = () => {
                if (currentSourceRef.current === source) {
                  setIsSpeaking(false);
                }
                resolve();
              };

              currentSourceRef.current = source;
              source.start();
              
            } catch (err) {
              setIsSpeaking(false);
              reject(err);
            }
          } else if (e.data.type === 'error') {
            workerRef.current?.removeEventListener('message', onMessage);
            setIsSpeaking(false);
            reject(new Error(e.data.error));
          }
        }
      };

      workerRef.current.addEventListener('message', onMessage);

      workerRef.current.postMessage({
        type: 'speak',
        id,
        text,
      });
    });
  }, []);

  return {
    isReady,
    isSpeaking,
    progress,
    speak,
    stop,
  };
}
