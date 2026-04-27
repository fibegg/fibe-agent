import { cpuCount, run } from './lib.mjs';

const nxParallel = process.env.NX_PARALLEL || cpuCount();

console.log(`--> Running lint/build/typecheck with NX_PARALLEL=${nxParallel}`);
await run('bun', ['run', 'ci:notest', '--', `--parallel=${nxParallel}`]);
