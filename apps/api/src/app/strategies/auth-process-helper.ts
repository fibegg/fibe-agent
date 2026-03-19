import { spawn, type ChildProcess } from 'node:child_process';

export interface RunAuthProcessOptions {
  env?: NodeJS.ProcessEnv;
  onData?: (data: string) => void;
  onClose?: (code: number | null) => void;
  onError?: (err: Error) => void;
}

export function runAuthProcess(
  command: string,
  args: string[],
  options: RunAuthProcessOptions = {}
): { process: ChildProcess; cancel: () => void } {
  const { env = process.env, onData, onClose, onError } = options;
  const proc = spawn(command, args, { env, shell: false });

  const handleData = (data: Buffer | string) => {
    onData?.(data.toString());
  };

  proc.stdout?.on('data', handleData);
  proc.stderr?.on('data', handleData);

  proc.on('close', (code) => {
    onClose?.(code);
  });

  proc.on('error', (err) => {
    onError?.(err);
  });

  const cancel = () => {
    proc.kill();
  };

  return { process: proc, cancel };
}
