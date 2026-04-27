import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  cacheFromArgsForExistingRefs,
  captureText,
  configureBuildResources,
  ghcrLogin,
  logGhcrImageContext,
  providerDisplayName,
  requireGhToken,
  run,
  setupGhcrImageContext,
  tryCaptureText,
} from './lib.mjs';

console.log('--> Preparing for Docker Build & Push');
await run('git', ['config', '--global', '--add', 'safe.directory', '/app']);

const gitSha = await tryCaptureText('git', ['rev-parse', 'HEAD'], 'unknown');
const context = setupGhcrImageContext();
logGhcrImageContext(context);
const sourceBranch = process.env.FIBE_BRANCH || 'main';
const tagName = process.env.TAG_NAME;
const provider = process.env.PROVIDER;
let latestTag = 'latest';

if (!tagName || !provider) {
  throw new Error('PROVIDER and TAG_NAME are required for provider image builds');
}

if (sourceBranch !== 'main' && sourceBranch !== 'master') {
  latestTag = `latest-${sourceBranch.replace(/[/:@ ]/g, '-')}`;
}

const providerName = providerDisplayName(provider);
const imageSource = process.env.FIBE_REPOSITORY_URL || 'https://github.com/fibegg/fibe-agent';
const imageTitle = `Fibe Agent (${providerName})`;
const imageDescription = `Fibe Agent runtime image with ${providerName} for Fibe playgrounds and CI jobs.`;
const imageVersion = `${tagName}-${gitSha}`;
const imageCreated = await tryCaptureText('git', ['show', '-s', '--format=%cI', 'HEAD'], new Date().toISOString());
const resultsDir = process.env.CI_RESULTS_DIR || '/results';
const imageResultFile = path.join(resultsDir, 'images', `${process.env.CI_STEP_NAME || tagName}.txt`);

await mkdir(path.dirname(imageResultFile), { recursive: true });
requireGhToken(`build, push, and verify ${context.image}:${tagName}-${gitSha}`);
await ghcrLogin(context);

const cacheRef = `${context.cacheImage}:${tagName}`;
const runtimeCacheRef = `${context.cacheImage}:runtime-base`;
const builderCacheRef = `${context.cacheImage}:builder`;
const legacyCacheRef = `${context.image}:buildcache-${tagName}`;
const legacyRuntimeCacheRef = `${context.image}:buildcache-runtime-base`;
const legacyBuilderCacheRef = `${context.image}:buildcache-builder`;
const buildConfig = await configureBuildResources();
const cacheFromArgs = await cacheFromArgsForExistingRefs([
  runtimeCacheRef,
  builderCacheRef,
  cacheRef,
  legacyRuntimeCacheRef,
  legacyBuilderCacheRef,
  legacyCacheRef,
  `${context.image}:${tagName}-${latestTag}`,
], { logMissing: false });
const exportProviderCache = process.env.CI_PROVIDER_CACHE_EXPORT === 'true';
const cacheExportArgs = exportProviderCache
  ? ['--cache-to', `type=registry,ref=${cacheRef},mode=max`]
  : [];

if (exportProviderCache) {
  console.log(`--> Exporting provider cache to ${cacheRef}`);
} else {
  console.log('--> Skipping provider cache export (set CI_PROVIDER_CACHE_EXPORT=true to enable)');
}

console.log('=========================================');
console.log(`--> Building ${provider} (linux/amd64 + linux/arm64)`);
console.log('=========================================');

await run('docker', [
  'buildx',
  'build',
  '.',
  '--builder',
  context.builderName,
  '--progress',
  buildConfig.progress,
  '--platform',
  'linux/amd64,linux/arm64',
  '-t',
  `${context.image}:${tagName}-${latestTag}`,
  '-t',
  `${context.image}:${tagName}-${gitSha}`,
  '--build-arg',
  `AGENT_PROVIDER=${provider}`,
  '--build-arg',
  `GIT_SHA=${gitSha}`,
  '--build-arg',
  `NPM_CONFIG_JOBS=${buildConfig.npmJobs}`,
  '--build-arg',
  `NX_PARALLEL=${buildConfig.nxParallel}`,
  `--provenance=${buildConfig.provenance}`,
  `--sbom=${buildConfig.sbom}`,
  '--label',
  `org.opencontainers.image.title=${imageTitle}`,
  '--label',
  `org.opencontainers.image.description=${imageDescription}`,
  '--label',
  `org.opencontainers.image.source=${imageSource}`,
  '--label',
  `org.opencontainers.image.url=${imageSource}`,
  '--label',
  `org.opencontainers.image.documentation=${imageSource}`,
  '--label',
  `org.opencontainers.image.revision=${gitSha}`,
  '--label',
  `org.opencontainers.image.version=${imageVersion}`,
  '--label',
  `org.opencontainers.image.created=${imageCreated}`,
  '--label',
  'org.opencontainers.image.licenses=MIT',
  '--label',
  'org.opencontainers.image.vendor=fibegg',
  '--annotation',
  `index:org.opencontainers.image.title=${imageTitle}`,
  '--annotation',
  `index:org.opencontainers.image.description=${imageDescription}`,
  '--annotation',
  `index:org.opencontainers.image.source=${imageSource}`,
  '--annotation',
  `index:org.opencontainers.image.revision=${gitSha}`,
  '--annotation',
  `index:org.opencontainers.image.version=${imageVersion}`,
  '--annotation',
  `index:org.opencontainers.image.created=${imageCreated}`,
  '--annotation',
  'index:org.opencontainers.image.licenses=MIT',
  ...cacheFromArgs,
  ...cacheExportArgs,
  '--push',
]);

console.log('--> Verifying multi-arch manifests');
await Promise.all([`${tagName}-${latestTag}`, `${tagName}-${gitSha}`].map(async (tag) => {
  const manifestInfo = await captureText('docker', ['buildx', 'imagetools', 'inspect', `${context.image}:${tag}`]);
  const platforms = [...manifestInfo.matchAll(/Platform:\s+([^\n]+)/g)].map((match) => match[1].trim());

  for (const platform of ['linux/amd64', 'linux/arm64']) {
    if (!platforms.includes(platform)) {
      throw new Error(`${context.image}:${tag} is missing ${platform}`);
    }
  }

  console.log(`--> Verified ${context.image}:${tag}: ${platforms.join(', ')}`);
}));

await writeFile(imageResultFile, `${context.image}:${tagName}-${gitSha}\n`);
