import { resolveCliBuild, stageCandidateCli, cliBuildArgs, cliImageLabels } from './cli-build.mjs';
import {
  cacheFromArgsForExistingRefs,
  configureBuildResources,
  ensureSharedBuilder,
  ghcrLogin,
  logGhcrImageContext,
  registryRefExists,
  requireGhToken,
  run,
  setupGhcrImageContext,
} from './lib.mjs';

const cliBuild = resolveCliBuild();
stageCandidateCli(cliBuild);
const fibeCliVersion = cliBuild.version;
console.log(`--> Pinned Fibe CLI ${cliBuild.candidate ? 'candidate' : 'release'}: ${fibeCliVersion}`);

console.log('--> Preparing shared Docker build cache');

const context = setupGhcrImageContext();
logGhcrImageContext(context);
requireGhToken('warm Docker build cache and push images');
await ghcrLogin(context);

const runtimeCacheRef = `${context.cacheImage}:runtime-base${cliBuild.cacheSuffix}`;
const builderCacheRef = `${context.cacheImage}:builder${cliBuild.cacheSuffix}`;
const legacyRuntimeCacheRef = `${context.image}:buildcache-runtime-base`;
const legacyBuilderCacheRef = `${context.image}:buildcache-builder`;
const buildConfig = await configureBuildResources();

await ensureSharedBuilder(context, buildConfig, { recreateOnMissingPlatform: true });

const commonCacheRefs = [
  runtimeCacheRef,
  builderCacheRef,
  legacyRuntimeCacheRef,
  legacyBuilderCacheRef,
];
const cacheExportMode = process.env.CI_COMMON_CACHE_EXPORT || 'auto';

async function shouldExportCache(ref, label) {
  if (cacheExportMode === 'true') {
    return true;
  }

  if (cacheExportMode === 'false') {
    console.log(`--> Skipping ${label} cache export because CI_COMMON_CACHE_EXPORT=false`);
    return false;
  }

  if (cacheExportMode !== 'auto') {
    throw new Error('CI_COMMON_CACHE_EXPORT must be auto, true, or false');
  }

  const exists = await registryRefExists(ref);
  if (exists) {
    console.log(`--> ${label} cache already exists at ${ref}; skipping export`);
  }
  return !exists;
}

async function warmRuntimeBaseCache() {
  if (!(await shouldExportCache(runtimeCacheRef, 'runtime-base'))) {
    return;
  }

  console.log('=========================================');
  console.log(`--> Warming runtime-base cache (${cliBuild.platforms.join(' + ')})`);
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
    cliBuild.platforms.join(','),
    '--target',
    'runtime-base',
    '--build-arg',
    `FIBE_CLI_VERSION=${fibeCliVersion}`,
    ...cliBuildArgs(cliBuild),
    ...cliImageLabels(cliBuild),
    '--label',
    `gg.fibe.cli.version=${fibeCliVersion}`,
    '--build-arg',
    `NPM_CONFIG_JOBS=${buildConfig.npmJobs}`,
    ...(await cacheFromArgsForExistingRefs(commonCacheRefs)),
    '--cache-to',
    `type=registry,ref=${runtimeCacheRef},mode=max`,
  ]);
}

async function warmBuilderCache() {
  if (!(await shouldExportCache(builderCacheRef, 'builder'))) {
    return;
  }

  console.log('=========================================');
  console.log(`--> Warming builder cache (${cliBuild.platforms.join(' + ')})`);
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
    cliBuild.platforms.join(','),
    '--target',
    'builder',
    '--build-arg',
    `NPM_CONFIG_JOBS=${buildConfig.npmJobs}`,
    '--build-arg',
    `NX_PARALLEL=${buildConfig.nxParallel}`,
    ...(await cacheFromArgsForExistingRefs(commonCacheRefs)),
    '--cache-to',
    `type=registry,ref=${builderCacheRef},mode=max`,
  ]);
}

if (process.env.CI_COMMON_CACHE_WARM_PARALLEL === 'true') {
  await Promise.all([warmRuntimeBaseCache(), warmBuilderCache()]);
} else {
  await warmRuntimeBaseCache();
  await warmBuilderCache();
}
