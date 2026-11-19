#!/usr/bin/env node
// Read-only report of the provider CLI pins: pinned version, latest published
// version and how long the pin has been in place. It never edits a file.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { npmProviders } from './install-provider.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The Agent SDK runs Claude Code in process, so it is bumped with the CLI. The
// API runtime installs its own copy from apps/api/package.json, so both pins
// are reported.
const companionPackages = {
  'claude-code': [
    ['@anthropic-ai/claude-agent-sdk', 'package.json'],
    ['@anthropic-ai/claude-agent-sdk', 'apps/api/package.json'],
  ],
};

function readDependencies(root, file) {
  const fullPath = resolve(root, file);
  if (file !== 'package.json' && !existsSync(fullPath)) return {};
  return JSON.parse(readFileSync(fullPath, 'utf8')).dependencies ?? {};
}

const manifestProviders = {
  cursor: { source: (versions) => versions.cursor?.source },
  antigravity: { source: (versions) => versions.antigravity?.source },
};

export function usage() {
  return [
    'Usage: node scripts/provider-pins-report.mjs [--offline] [--json] [--root <dir>]',
    '',
    'Prints each provider CLI pin from package.json and scripts/provider-versions.json,',
    'the latest version published on npm and the age of the pin from git history.',
    'Read-only: it never edits a file.',
    '',
    '  --offline     skip the npm registry lookup (npm view <package> version)',
    '  --json        print the rows as JSON',
    '  --root <dir>  repository root to read (default: this repository)',
  ].join('\n');
}

export function parseArgs(argv) {
  const options = { offline: false, json: false, root: defaultRoot, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--offline') options.offline = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--root needs a directory');
      options.root = resolve(value);
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function collectPins(root) {
  const dependencies = new Map();
  const dependenciesOf = (file) => {
    if (!dependencies.has(file)) dependencies.set(file, readDependencies(root, file));
    return dependencies.get(file);
  };
  const versions = JSON.parse(readFileSync(resolve(root, 'scripts/provider-versions.json'), 'utf8'));
  const pins = [];
  for (const [provider, [packageName]] of Object.entries(npmProviders)) {
    for (const [name, file] of [[packageName, 'package.json'], ...(companionPackages[provider] ?? [])]) {
      const version = dependenciesOf(file)[name] ?? null;
      pins.push({
        provider,
        package: name,
        pinned: version,
        file,
        needle: version ? `"${name}": "${version}"` : null,
        registry: 'npm',
      });
    }
  }
  for (const [provider, manifest] of Object.entries(manifestProviders)) {
    const version = versions[provider]?.version ?? null;
    pins.push({
      provider,
      package: manifest.source(versions) ?? provider,
      pinned: version,
      file: 'scripts/provider-versions.json',
      needle: version ? `"version": "${version}"` : null,
      registry: null,
    });
  }
  return pins;
}

// The newest commit that changed how often the pinned line occurs is the one
// that introduced the current pin.
export function gitPinDate(root, file, needle) {
  if (!needle) return null;
  // A shallow clone's boundary commit adds every file, which would look like a
  // recent pin.
  const shallow = spawnSync('git', ['-C', root, 'rev-parse', '--is-shallow-repository'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (shallow.error || shallow.status !== 0 || shallow.stdout.trim() !== 'false') return null;
  const result = spawnSync('git', ['-C', root, 'log', '-1', '--format=%cI', `-S${needle}`, '--', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error || result.status !== 0) return null;
  const date = result.stdout.trim();
  return date || null;
}

export function npmLatest(packageName) {
  const result = spawnSync('npm', ['view', packageName, 'version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 30_000,
  });
  if (result.error || result.status !== 0) return null;
  const version = result.stdout.trim();
  return version || null;
}

// Semver order: the release parts compare numerically, and a prerelease
// (1.0.0-beta) sorts before its release (1.0.0).
export function compareVersions(left, right) {
  const split = (version) => {
    const [core, ...rest] = version.split('+')[0].split('-');
    return { core: core.split('.').map(Number), pre: rest.length ? rest.join('-').split('.') : [] };
  };
  const compareParts = (a, b) => {
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if (index >= a.length) return -1;
      if (index >= b.length) return 1;
      const x = /^\d+$/.test(a[index]) ? Number(a[index]) : a[index];
      const y = /^\d+$/.test(b[index]) ? Number(b[index]) : b[index];
      if (x === y) continue;
      if (typeof x === typeof y) return x < y ? -1 : 1;
      return typeof x === 'number' ? -1 : 1;
    }
    return 0;
  };
  const a = split(left);
  const b = split(right);
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index += 1) {
    const x = a.core[index] ?? 0;
    const y = b.core[index] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === b.pre.length ? 0 : a.pre.length === 0 ? 1 : -1;
  return compareParts(a.pre, b.pre);
}

function status(pin, latest, offline) {
  if (!pin.pinned) return 'missing pin';
  if (!pin.registry) return 'check installer';
  if (offline) return 'not checked';
  if (!latest) return 'unknown';
  const order = compareVersions(pin.pinned, latest);
  if (order === 0) return 'current';
  return order < 0 ? 'behind' : 'ahead';
}

export function buildReport({ root = defaultRoot, offline = false, now = new Date(), lookupLatest = npmLatest, pinDate = gitPinDate } = {}) {
  const latestByPackage = new Map();
  const latestOf = (name) => {
    if (!latestByPackage.has(name)) latestByPackage.set(name, lookupLatest(name));
    return latestByPackage.get(name);
  };
  return collectPins(root).map((pin) => {
    const latest = pin.registry && pin.pinned && !offline ? latestOf(pin.package) : null;
    const since = pinDate(root, pin.file, pin.needle);
    const ageDays = since ? Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY_MS)) : null;
    return {
      provider: pin.provider,
      package: pin.package,
      pinned: pin.pinned,
      latest,
      status: status(pin, latest, offline),
      pinnedSince: since ? since.slice(0, 10) : null,
      ageDays,
      file: pin.file,
    };
  });
}

export function formatReport(rows) {
  const header = ['Provider', 'Package', 'Pinned', 'Latest', 'Status', 'Pinned since', 'Age (days)', 'Pin file'];
  const lines = rows.map((row) => [
    row.provider,
    row.package,
    row.pinned ?? '-',
    row.latest ?? '-',
    row.status,
    row.pinnedSince ?? 'unknown',
    row.ageDays === null ? '-' : String(row.ageDays),
    row.file,
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...lines.map((line) => line[column].length)));
  const render = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd();
  return [render(header), render(widths.map((width) => '-'.repeat(width))), ...lines.map(render)].join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const rows = buildReport({ root: options.root, offline: options.offline });
  console.log(options.json ? JSON.stringify(rows, null, 2) : formatReport(rows));
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
  }
}
