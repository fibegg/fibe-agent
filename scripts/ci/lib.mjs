import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function isBlank(value) {
  return value == null || value === '' || value === '""' || value === "''";
}

export function cpuCount() {
  return String(os.availableParallelism?.() || os.cpus().length || 4);
}

export function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    if (options.input != null) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} ${args.join(' ')} failed with ${suffix}`));
    });
  });
}

export function captureText(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve(stdout.trimEnd());
        return;
      }

      const suffix = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} ${args.join(' ')} failed with ${suffix}\n${stderr.trimEnd()}`));
    });
  });
}

export async function tryCaptureText(command, args = [], fallback = '') {
  try {
    return await captureText(command, args);
  } catch {
    return fallback;
  }
}

export async function registryRefExists(ref) {
  return captureText('docker', ['buildx', 'imagetools', 'inspect', ref])
    .then(() => true)
    .catch(() => false);
}

export async function cacheFromArgsForExistingRefs(refs, { logMissing = true } = {}) {
  const args = [];
  const existingRefs = await Promise.all(
    refs.map(async (ref) => ({
      ref,
      exists: await registryRefExists(ref),
    })),
  );

  for (const { ref, exists } of existingRefs) {
    if (exists) {
      console.log(`--> Using cache source ${ref}`);
      args.push('--cache-from', `type=registry,ref=${ref}`);
    } else if (logMissing) {
      console.log(`--> Skipping missing cache source ${ref}`);
    }
  }

  return args;
}

function repositoryOwnerFromUrl(repositoryUrl) {
  if (!repositoryUrl) {
    return '';
  }

  const match = repositoryUrl.match(/github\.com[:/]([^/]+)\/[^/]+?(?:\.git)?$/);
  return match?.[1] || '';
}

export function setupGhcrImageContext() {
  const ghUsername = process.env.GH_USERNAME || 'fibegg';
  const imageOwner =
    process.env.FIBE_REPOSITORY_OWNER ||
    repositoryOwnerFromUrl(process.env.FIBE_REPOSITORY_URL) ||
    ghUsername ||
    'fibegg';
  const lowerOwner = imageOwner.toLowerCase();

  return {
    ghUsername,
    imageOwner,
    lowerOwner,
    image: `ghcr.io/${lowerOwner}/fibe-agent`,
    cacheImage: `ghcr.io/${lowerOwner}/fibe-agent-buildcache`,
    builderName: process.env.BUILDX_BUILDER_NAME || 'fibe-agent-ci',
  };
}

export function logGhcrImageContext(context) {
  console.log(`--> GHCR login user: ${context.ghUsername}`);
  console.log(`--> GHCR image owner: ${context.imageOwner}`);
  console.log(`--> Image repository: ${context.image}`);
  console.log(`--> Build cache repository: ${context.cacheImage}`);
}

export function requireGhToken(purpose) {
  if (isBlank(process.env.GH_TOKEN)) {
    throw new Error(`GH_TOKEN is required to ${purpose}`);
  }
}

export async function ghcrLogin({ ghUsername }) {
  const dockerConfigDir = process.env.DOCKER_CONFIG || '/root/.docker';
  const auth = Buffer.from(`${ghUsername}:${process.env.GH_TOKEN}`).toString('base64');

  await mkdir(dockerConfigDir, { recursive: true });
  await writeFile(
    path.join(dockerConfigDir, 'config.json'),
    `${JSON.stringify({ auths: { 'ghcr.io': { auth } } })}\n`,
    { mode: 0o600 },
  );

  console.log('--> Configured ghcr.io credentials for this CI step');
}

export async function configureBuildResources() {
  const maxParallelism = process.env.BUILDKIT_MAX_PARALLELISM || cpuCount();
  const stepLogMaxSize = process.env.BUILDKIT_STEP_LOG_MAX_SIZE || '10485760';
  const stepLogMaxSpeed = process.env.BUILDKIT_STEP_LOG_MAX_SPEED || '10485760';
  const progress = process.env.BUILDX_PROGRESS || 'plain';
  const recreate = process.env.BUILDX_BUILDER_RECREATE || 'false';
  const provenance = process.env.BUILDX_PROVENANCE || 'false';
  const sbom = process.env.BUILDX_SBOM || 'false';
  const npmJobs = process.env.NPM_CONFIG_JOBS || cpuCount();
  const nxParallel = process.env.NX_PARALLEL || cpuCount();
  const configFile = '/tmp/buildkitd.toml';

  process.env.BUILDKIT_MAX_PARALLELISM = maxParallelism;
  process.env.BUILDKIT_STEP_LOG_MAX_SIZE = stepLogMaxSize;
  process.env.BUILDKIT_STEP_LOG_MAX_SPEED = stepLogMaxSpeed;
  process.env.BUILDX_PROGRESS = progress;
  process.env.BUILDX_BUILDER_RECREATE = recreate;
  process.env.BUILDX_PROVENANCE = provenance;
  process.env.BUILDX_SBOM = sbom;
  process.env.NPM_CONFIG_JOBS = npmJobs;
  process.env.npm_config_jobs = npmJobs;
  process.env.NX_PARALLEL = nxParallel;

  await writeFile(
    configFile,
    `[worker.oci]\n  max-parallelism = ${maxParallelism}\n\n[worker.containerd]\n  max-parallelism = ${maxParallelism}\n`,
  );

  console.log(`--> Build resources: BUILDKIT_MAX_PARALLELISM=${maxParallelism}, BUILDX_PROGRESS=${progress}`);

  return {
    configFile,
    progress,
    provenance,
    recreate,
    sbom,
    stepLogMaxSize,
    stepLogMaxSpeed,
    npmJobs,
    nxParallel,
  };
}

export async function createSharedBuilder(context, config) {
  await run('docker', [
    'buildx',
    'create',
    '--name',
    context.builderName,
    '--driver',
    'docker-container',
    '--config',
    config.configFile,
    '--driver-opt',
    'network=host',
    '--driver-opt',
    `env.BUILDKIT_STEP_LOG_MAX_SIZE=${config.stepLogMaxSize}`,
    '--driver-opt',
    `env.BUILDKIT_STEP_LOG_MAX_SPEED=${config.stepLogMaxSpeed}`,
  ]);
}

export async function installBinfmt() {
  console.log('--> Installing binfmt emulators for amd64/arm64');
  await run('docker', ['run', '--privileged', '--rm', 'tonistiigi/binfmt', '--install', 'amd64,arm64']);
}

function logBuilderSummary(builderName, builderInfo) {
  const platformsLine = builderInfo
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('Platforms:'));
  console.log(`--> Buildx builder ${builderName}: ${platformsLine || 'platforms unknown'}`);
}

export async function ensureSharedBuilder(context, config, { recreateOnMissingPlatform = false } = {}) {
  if (config.recreate === 'true') {
    console.log(`--> Recreating shared buildx builder ${context.builderName} because BUILDX_BUILDER_RECREATE=true`);
    await run('docker', ['buildx', 'rm', context.builderName]).catch(() => {});
  }

  const builderExists = await captureText('docker', ['buildx', 'inspect', context.builderName])
    .then(() => true)
    .catch(() => false);

  if (!builderExists) {
    console.log(`--> Creating shared buildx builder ${context.builderName}`);
    await installBinfmt();
    await createSharedBuilder(context, config);
  }

  let builderInfo = await captureText('docker', ['buildx', 'inspect', context.builderName, '--bootstrap']);
  logBuilderSummary(context.builderName, builderInfo);

  for (const platform of ['linux/amd64', 'linux/arm64']) {
    if (builderInfo.includes(platform)) {
      continue;
    }

    if (recreateOnMissingPlatform) {
      console.log(`--> Recreating ${context.builderName} to restore ${platform} support`);
      await run('docker', ['buildx', 'rm', context.builderName]).catch(() => {});
      await installBinfmt();
      await createSharedBuilder(context, config);
      builderInfo = await captureText('docker', ['buildx', 'inspect', context.builderName, '--bootstrap']);
      logBuilderSummary(context.builderName, builderInfo);
    }

    if (!builderInfo.includes(platform)) {
      throw new Error(`buildx builder ${context.builderName} is missing ${platform}`);
    }
  }
}

export function providerDisplayName(provider) {
  return {
    gemini: 'Gemini CLI',
    claude_code: 'Claude Code',
    openai_codex: 'OpenAI Codex',
    opencode: 'OpenCode',
    cursor: 'Cursor Agent',
  }[provider] || provider;
}
