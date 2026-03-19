import type { PostInitStateFile } from '../../post-init-runner';

export type InitStatusState = 'disabled' | 'pending' | 'running' | 'done' | 'failed';

export interface InitStatusResponse {
  state: InitStatusState;
  output?: string;
  error?: string;
  finishedAt?: string;
}

export function buildInitStatusResponse(
  script: string | undefined,
  stateFile: PostInitStateFile | null
): InitStatusResponse {
  if (!script) {
    return { state: 'disabled' };
  }
  if (!stateFile) {
    return { state: 'pending' };
  }
  return {
    state: stateFile.state,
    ...(stateFile.output !== undefined && { output: stateFile.output }),
    ...(stateFile.error !== undefined && { error: stateFile.error }),
    ...(stateFile.finishedAt !== undefined && { finishedAt: stateFile.finishedAt }),
  };
}
