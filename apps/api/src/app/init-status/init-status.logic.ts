import type { PostInitStateFile } from '../../post-init-runner';

export type InitStatusState = 'disabled' | 'pending' | 'running' | 'done' | 'failed';

export interface InitStatusResponse {
  state: InitStatusState;
  output?: string;
  error?: string;
  finishedAt?: string;
  systemPrompt?: string;
}

export function buildInitStatusResponse(
  script: string | undefined,
  systemPrompt: string | undefined,
  stateFile: PostInitStateFile | null
): InitStatusResponse {
  if (!script) {
    return {
      state: 'disabled',
      ...(systemPrompt !== undefined && { systemPrompt }) 
    };
  }
  if (!stateFile) {
    return {
      state: 'pending',
      ...(systemPrompt !== undefined && { systemPrompt })
    };
  }
  return {
    state: stateFile.state,
    ...(stateFile.output !== undefined && { output: stateFile.output }),
    ...(stateFile.error !== undefined && { error: stateFile.error }),
    ...(stateFile.finishedAt !== undefined && { finishedAt: stateFile.finishedAt }),
    ...(systemPrompt !== undefined && { systemPrompt }),
  };
}
