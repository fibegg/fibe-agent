/* eslint-disable no-restricted-globals */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers';

// Skip local model check during browser execution since they must be fetched
env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineSingleton {
  static task = 'automatic-speech-recognition' as const;
  static model = 'Xenova/whisper-tiny.en';
  static instance: any = null;

  static async getInstance(progress_callback?: any) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, { 
        progress_callback 
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  const { audio, id } = event.data;

  try {
    const transcriber = await PipelineSingleton.getInstance((x: any) => {
      (self as any).postMessage({ type: 'progress', progress: x });
    });

    const result = await transcriber(audio);
    
    (self as any).postMessage({
      type: 'complete',
      id,
      text: result.text.trim(),
    });
  } catch (error) {
    (self as any).postMessage({ type: 'error', id, error: String(error) });
  }
});
