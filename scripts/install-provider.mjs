#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, chmodSync, copyFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const npmProviders = {
  gemini: ['@google/gemini-cli', 'gemini'],
  'claude-code': ['@anthropic-ai/claude-code', 'claude'],
  'openai-codex': ['@openai/codex', 'codex'],
  opencode: ['opencode-ai', 'opencode'],
};

// Shared by production and development images. Missing pins never become "latest".
export function installationPlan(provider, arch, dependencies, versions) {
  provider = provider.replaceAll('_', '-');
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported architecture: ${arch}`);
  if (npmProviders[provider]) {
    const [name, binary] = npmProviders[provider];
    const version = dependencies[name];
    if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`Pin ${name} to an exact stable version in package.json`);
    return { provider, binary, npm: `${name}@${version}` };
  }
  if (provider === 'cursor') {
    const version = versions.cursor.version;
    if (!/^\d{4}\.\d{2}\.\d{2}-[a-f0-9]+$/.test(version)) throw new Error('Invalid Cursor version');
    return { provider, binary: 'cursor-agent', version, url: `https://downloads.cursor.com/lab/${version}/linux/${arch}/agent-cli-package.tar.gz` };
  }
  if (provider === 'antigravity') {
    const release = versions.antigravity.linux[arch];
    if (!/^https:\/\//.test(release.url) || !/^[a-f0-9]{128}$/.test(release.sha512)) throw new Error('Invalid Antigravity release');
    return { provider, binary: 'agy', version: versions.antigravity.version, ...release };
  }
  if (provider === 'mock') return { provider };
  throw new Error(`Unsupported provider: ${provider}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

export function installProvider(provider) {
  if (process.platform !== 'linux') throw new Error('Provider image installer requires Linux');
  const dependencies = JSON.parse(readFileSync('package.json', 'utf8')).dependencies;
  const versions = JSON.parse(readFileSync(new URL('./provider-versions.json', import.meta.url), 'utf8'));
  const plan = installationPlan(provider, process.arch, dependencies, versions);
  if (!plan.binary) return;
  if (plan.npm) run('npm', ['install', '-g', plan.npm]);
  else {
    const staging = mkdtempSync(join(tmpdir(), 'fibe-provider-'));
    try {
      const archive = join(staging, 'provider.tar.gz');
      run('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '3', '--output', archive, plan.url]);
      if (plan.sha512) {
        const actual = createHash('sha512').update(readFileSync(archive)).digest('hex');
        if (actual !== plan.sha512) throw new Error('Antigravity archive checksum mismatch');
      }
      if (plan.provider === 'cursor') {
        const destination = `/usr/local/share/cursor-agent/versions/${plan.version}`;
        mkdirSync(destination, { recursive: true });
        run('tar', ['--strip-components=1', '-xzf', archive, '-C', destination]);
        for (const binary of ['cursor-agent', 'agent']) {
          rmSync(`/usr/local/bin/${binary}`, { force: true });
          symlinkSync(`${destination}/cursor-agent`, `/usr/local/bin/${binary}`);
        }
      } else {
        run('tar', ['-xzf', archive, '-C', staging, 'antigravity']);
        copyFileSync(join(staging, 'antigravity'), '/usr/local/bin/agy');
        chmodSync('/usr/local/bin/agy', 0o755);
      }
    } finally { rmSync(staging, { recursive: true, force: true }); }
  }
  run(plan.binary, ['--version']);
  run(plan.binary, ['--help']);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  installProvider(process.argv[2] ?? process.env.AGENT_PROVIDER ?? 'gemini');
}
