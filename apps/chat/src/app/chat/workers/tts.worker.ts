/* eslint-disable no-restricted-globals */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

class TextToSpeechPipeline {
  static task = 'text-to-speech' as const;
  static model = 'Xenova/speecht5_tts';
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
  const { text, speaker_embeddings, id } = event.data;

  try {
    const synthesizer = await TextToSpeechPipeline.getInstance((x: any) => {
      (self as any).postMessage({ type: 'progress', progress: x });
    });

    // speecht5_tts requires speaker embeddings.
    // In @huggingface/transformers, typically we can omit it if not strict or we can fetch a default embedding.
    // The Xenova/speecht5_tts model usually requires a speaker embedding tensor (1, 512).
    // Let's rely on the pipeline defaults, or fetch a default tensor if it requires it.
    
    // For safety, let's fetch default speaker embeddings if none are provided.
    const default_speaker_embeddings = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
    
    const result = await synthesizer(text, {
      speaker_embeddings: speaker_embeddings || default_speaker_embeddings,
    });
    
    // result.audio is Float32Array PCM data. result.sampling_rate is usually 16000.
    
    (self as any).postMessage({
      type: 'complete',
      id,
      audio: result.audio,
      sampling_rate: result.sampling_rate,
    });
    
  } catch (error) {
    (self as any).postMessage({ type: 'error', id, error: String(error) });
  }
});
