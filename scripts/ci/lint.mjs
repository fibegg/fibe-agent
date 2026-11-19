import { cpuCount, run } from './lib.mjs';

const nxParallel = process.env.NX_PARALLEL || cpuCount();

console.log('--> Checking AGENTS.md size and Dockerfile COPY sources against .dockerignore');
await run('node', ['scripts/ci/check-agents-md-size.mjs']);
await run('node', ['scripts/ci/check-dockerignore.mjs']);

console.log(`--> Running lint/build/typecheck with NX_PARALLEL=${nxParallel}`);
await run('bun', ['run', 'ci:notest', '--', `--parallel=${nxParallel}`]);
