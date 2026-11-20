import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

const stable = /^\d+\.\d+\.\d+$/;
const prerelease = /^\d+\.\d+\.\d+-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

export async function resolveCliBuild(env = process.env, fetchRelease = fetch) {
  if (env.FIBE_CANDIDATE_BUILD && !['0', '1'].includes(env.FIBE_CANDIDATE_BUILD)) {
    throw new Error('FIBE_CANDIDATE_BUILD must be 0 or 1');
  }
  const candidate = env.FIBE_CANDIDATE_BUILD === '1';
  const version = (env.FIBE_CLI_VERSION || 'latest').replace(/^v/, '');
  if (!candidate) {
    if (version !== 'latest' && !stable.test(version)) throw new Error('FIBE_CLI_VERSION must be latest or an exact stable version');
    const api = 'https://api.github.com/repos/fibegg/sdk';
    const token = env.GH_TOKEN;
    if (!token) throw new Error('Configure a GitHub App or OAuth token before resolving the SDK release');
    async function request(url, accept = 'application/vnd.github+json') {
      let response;
      try {
        response = await fetchRelease(url, {
          headers: { Accept: accept, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000),
        });
      }
      catch { throw new Error('Could not fetch Fibe SDK release metadata or checksums'); }
      if (!response.ok) throw new Error(`Fibe SDK release request failed (HTTP ${response.status})`);
      return response;
    }
    const release = await (await request(`${api}/releases/${version === 'latest' ? 'latest' : `tags/v${version}`}`)).json();
    const resolved = release.tag_name?.replace(/^v/, '');
    if (!stable.test(resolved || '') || release.tag_name !== `v${resolved}` || release.draft || release.prerelease || (version !== 'latest' && resolved !== version)) {
      throw new Error('Fibe SDK release must match the requested stable version');
    }
    const assets = release.assets || [];
    function assetId(name) {
      const id = assets.find(asset => asset.name === name)?.id;
      if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Fibe SDK release is missing ${name}`);
      return id;
    }
    const checksums = await (await request(`${api}/releases/assets/${assetId('checksums.txt')}`, 'application/octet-stream')).text();
    const archiveChecksums = {}, assetIds = {};
    for (const arch of ['amd64', 'arm64']) {
      const name = `fibe_${resolved}_linux_${arch}.tar.gz`;
      assetIds[arch] = assetId(name);
      const matches = checksums.split(/\r?\n/).map(line => line.trim().split(/\s+\*?/)).filter(parts => parts[1] === name);
      if (matches.length !== 1 || !/^[0-9a-f]{64}$/.test(matches[0][0])) throw new Error(`Missing or invalid Fibe SDK checksum for ${name}`);
      archiveChecksums[arch] = matches[0][0];
    }
    // target_commitish can be a branch; resolve the release tag itself to a commit.
    const commit = await (await request(`${api}/commits/${encodeURIComponent(release.tag_name)}`)).json();
    if (!/^[0-9a-f]{40}$/.test(commit.sha || '')) throw new Error('Fibe SDK release tag has no exact source commit');
    return { candidate, version: resolved, sdkSha: commit.sha, archiveChecksums, assetIds, platforms: ['linux/amd64', 'linux/arm64'], cacheSuffix: '' };
  }
  if (!prerelease.test(version)) throw new Error('Candidate FIBE_CLI_VERSION must be an exact prerelease version');
  const sdkSha = env.FIBE_SDK_SHA;
  if (!/^[0-9a-f]{40}$/.test(sdkSha || '')) throw new Error('Candidate FIBE_SDK_SHA must be the full SDK commit SHA');
  if (!version.endsWith(`+${sdkSha.slice(0, 7)}`)) throw new Error('Candidate CLI version build metadata must match FIBE_SDK_SHA');
  const checksum = env.FIBE_CLI_BINARY_SHA256;
  if (!/^[0-9a-f]{64}$/.test(checksum || '')) throw new Error('Candidate FIBE_CLI_BINARY_SHA256 must be an exact SHA-256');
  if (!env.FIBE_CLI_BINARY_PATH) throw new Error('Candidate FIBE_CLI_BINARY_PATH is required');
  const platform = env.FIBE_CANDIDATE_PLATFORM || 'linux/amd64';
  if (!['linux/amd64', 'linux/arm64'].includes(platform)) throw new Error('Candidate platform must be linux/amd64 or linux/arm64');
  const arch = platform.split('/')[1];
  return { candidate, version, sdkSha, checksum, binaryPath: path.resolve(env.FIBE_CLI_BINARY_PATH), platforms: [platform], arch, cacheSuffix: `-cand-${sdkSha.slice(0, 7)}-${arch}` };
}

export function stageCandidateCli(build, root = process.cwd()) {
  if (!build.candidate) return;
  const bytes = readFileSync(build.binaryPath);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (checksum !== build.checksum) throw new Error('Candidate CLI binary SHA-256 mismatch');
  if (bytes.length < 20 || bytes.subarray(0, 4).toString('hex') !== '7f454c46' || bytes[4] !== 2 || bytes[5] !== 1) {
    throw new Error('Candidate CLI must be a 64-bit little-endian Linux ELF binary');
  }
  if (bytes.readUInt16LE(18) !== (build.arch === 'amd64' ? 62 : 183)) throw new Error('Candidate CLI architecture does not match FIBE_CANDIDATE_PLATFORM');
  const directory = path.join(root, '.candidate-cli');
  const staged = path.join(directory, 'fibe');
  mkdirSync(directory, { recursive: true });
  if (existsSync(staged)) {
    if (createHash('sha256').update(readFileSync(staged)).digest('hex') !== checksum) {
      throw new Error('A different candidate CLI is already staged; preserve it before selecting another build');
    }
  } else {
    writeFileSync(staged, bytes, { flag: 'wx', mode: 0o755 });
  }
  chmodSync(staged, 0o755);
}

export function cliBuildArgs(build) {
  return ['--secret', 'id=gh_token,env=GH_TOKEN', '--build-arg', `FIBE_CANDIDATE_BUILD=${build.candidate ? '1' : '0'}`,
    '--build-arg', `FIBE_SDK_SHA=${build.sdkSha}`,
    ...(build.candidate ? ['--build-arg', `FIBE_CLI_BINARY_SHA256=${build.checksum}`] :
      Object.entries(build.archiveChecksums).flatMap(([arch, checksum]) => ['--build-arg', `FIBE_CLI_ARCHIVE_SHA256_${arch.toUpperCase()}=${checksum}`, '--build-arg', `FIBE_CLI_ASSET_ID_${arch.toUpperCase()}=${build.assetIds[arch]}`]))];
}

export function cliImageLabels(build) {
  return ['--label', `gg.fibe.cli.sdk.sha=${build.sdkSha}`,
    ...(build.candidate ? ['--label', `gg.fibe.cli.binary.sha256=${build.checksum}`] :
      Object.entries(build.archiveChecksums).flatMap(([arch, checksum]) => ['--label', `gg.fibe.cli.archive.${arch}.sha256=${checksum}`]))];
}

export function providerImageTags({ provider, tagName, sourceBranch, gitSha }, build) {
  if (!provider || !tagName) throw new Error('PROVIDER and TAG_NAME are required for provider image builds');
  if (build.candidate) {
    const canonical = { openai: 'openai-codex', opencodex: 'opencode' }[provider] || provider.replaceAll('_', '-');
    if (tagName !== canonical || !/^[a-z0-9][a-z0-9-]*$/.test(tagName)) throw new Error('Candidate TAG_NAME must identify its provider');
    if (!/^[0-9a-f]{40}$/.test(gitSha)) throw new Error('Candidate images require an exact agent source SHA');
    return [`${tagName}-cand-${build.version.replaceAll('+', '-')}-${gitSha.slice(0, 7)}-${build.arch}`];
  }
  const channel = ['main', 'master'].includes(sourceBranch) ? 'latest' : `latest-${sourceBranch.replace(/[/:@ ]/g, '-')}`;
  return [`${tagName}-${channel}`, `${tagName}-${gitSha}`];
}
