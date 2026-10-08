import type { PostInitStateFile } from '../../post-init-runner';

export type InitStatusState = 'pending' | 'running' | 'succeeded' | 'failed';

export interface InitStatusResponse {
  state: InitStatusState;
  output?: string;
  error?: string;
  finishedAt?: string;
  systemPrompt?: string;
  runId?: string;
  scriptDigest?: string;
  noSetupRequired?: boolean;
}

export function buildInitStatusResponse(
  script: string | undefined,
  systemPrompt: string | undefined,
  stateFile: PostInitStateFile | null
): InitStatusResponse {
  if (!stateFile && !script) {
    return {
      state: 'succeeded',
      noSetupRequired: true,
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
    ...(stateFile.runId !== undefined && { runId: stateFile.runId }),
    ...(stateFile.scriptDigest !== undefined && { scriptDigest: stateFile.scriptDigest }),
    ...(stateFile.noSetupRequired !== undefined && { noSetupRequired: stateFile.noSetupRequired }),
    ...(stateFile.output !== undefined && { output: stateFile.output }),
    ...(stateFile.error !== undefined && { error: stateFile.error }),
    ...(stateFile.finishedAt !== undefined && { finishedAt: stateFile.finishedAt }),
    ...(systemPrompt !== undefined && { systemPrompt }),
  };
}
