import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// .dockerignore is an allowlist: `*` excludes everything and `!path` lines
// re-include what the image needs. A COPY of a path that is still excluded
// fails only in the image build ("not found"), late in CI. This check reads
// every COPY/ADD source from the build context and evaluates it with Docker's
// .dockerignore rules (last matching line wins, a match on a parent directory
// counts).

export function parseDockerignore(text) {
  const patterns = [];
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (rawLine.startsWith('#')) {
      continue;
    }
    let line = rawLine.trim();
    if (line === '') {
      continue;
    }
    const exclusion = line.startsWith('!');
    if (exclusion) {
      line = line.slice(1).trim();
    }
    if (line === '') {
      continue;
    }
    let cleaned = path.posix.normalize(line);
    if (cleaned.length > 1 && cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }
    if (cleaned.length > 1 && cleaned.startsWith('/')) {
      cleaned = cleaned.slice(1);
    }
    patterns.push({ text: rawLine.trim(), exclusion, regex: patternToRegExp(cleaned) });
  }
  return patterns;
}

function patternToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
        }
        source += index + 1 >= pattern.length ? '.*' : '(.*/)?';
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '\\' && index + 1 < pattern.length) {
      index += 1;
      source += escapeRegExp(pattern[index]);
    } else if (char === '[' && pattern.indexOf(']', index + 2) !== -1) {
      // Character class: copied as is ([a-z], [^a-z]).
      const end = pattern.indexOf(']', index + 2);
      source += pattern.slice(index, end + 1);
      index = end;
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`);
}

function escapeRegExp(char) {
  return /[.+()|{}$^*?\\[\]/]/.test(char) ? `\\${char}` : char;
}

export function isIncluded(patterns, file) {
  const parts = file.split('/');
  let excluded = false;
  for (const pattern of patterns) {
    // Last match wins: an exclusion only matters once something excluded the
    // path, a plain pattern only while it is still included.
    if (pattern.exclusion !== excluded) {
      continue;
    }
    let match = pattern.regex.test(file);
    for (let depth = 1; !match && depth < parts.length; depth += 1) {
      match = pattern.regex.test(parts.slice(0, depth).join('/'));
    }
    if (match) {
      excluded = !pattern.exclusion;
    }
  }
  return !excluded;
}

function logicalLines(text) {
  const lines = [];
  let current = null;
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (current && trimmed.startsWith('#')) {
      return;
    }
    const continues = /\\\s*$/.test(rawLine);
    const content = continues ? rawLine.replace(/\\\s*$/, '') : rawLine;
    if (current) {
      current.text += ` ${content.trim()}`;
    } else {
      current = { line: index + 1, text: content };
    }
    if (!continues) {
      lines.push(current);
      current = null;
    }
  });
  if (current) {
    lines.push(current);
  }
  return lines;
}

function splitArguments(rest) {
  const trimmed = rest.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
        return parsed;
      }
    } catch {
      // Not exec form after all; fall back to whitespace splitting.
    }
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

// Returns the build-context sources of every COPY/ADD instruction. Copies from
// another stage or image (--from), remote URLs, heredocs and sources built from
// variables are skipped.
export function copySources(dockerfileText) {
  const sources = [];
  for (const { line, text } of logicalLines(dockerfileText)) {
    const instruction = /^\s*(COPY|ADD)\s+(.*)$/i.exec(text);
    if (!instruction) {
      continue;
    }
    const tokens = splitArguments(instruction[2]);
    const flags = [];
    while (tokens.length > 0 && tokens[0].startsWith('--')) {
      flags.push(tokens.shift());
    }
    if (flags.some((flag) => flag === '--from' || flag.startsWith('--from='))) {
      continue;
    }
    for (const source of tokens.slice(0, -1)) {
      if (source.startsWith('<<') || source.includes('://') || source.startsWith('git@') || source.includes('$')) {
        continue;
      }
      const normalized = path.posix.normalize(source).replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
      if (normalized === '' || normalized === '.') {
        continue;
      }
      sources.push({ line, instruction: instruction[1].toUpperCase(), source: normalized });
    }
  }
  return sources;
}

function defaultDockerfiles(root) {
  return readdirSync(root)
    .filter((name) => /^Dockerfile(\..+)?$/.test(name) && !name.endsWith('.dockerignore'))
    .sort();
}

export function checkDockerignore(root, dockerfiles = defaultDockerfiles(root)) {
  const problems = [];
  let checked = 0;
  for (const dockerfile of dockerfiles) {
    const dockerfilePath = path.resolve(root, dockerfile);
    // BuildKit prefers <Dockerfile>.dockerignore next to the Dockerfile.
    const specificIgnore = `${dockerfilePath}.dockerignore`;
    const ignoreFile = existsSync(specificIgnore) ? specificIgnore : path.join(root, '.dockerignore');
    const patterns = existsSync(ignoreFile) ? parseDockerignore(readFileSync(ignoreFile, 'utf8')) : [];
    for (const { line, instruction, source } of copySources(readFileSync(dockerfilePath, 'utf8'))) {
      checked += 1;
      if (!isIncluded(patterns, source)) {
        problems.push(
          `${path.relative(root, dockerfilePath)}:${line}: ${instruction} source ${source} is excluded by ${path.relative(root, ignoreFile)}; add the allow line "!${source}"`,
        );
      }
    }
  }
  return { ok: problems.length === 0, checked, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const dockerfiles = process.argv.slice(2);
  const result = checkDockerignore(root, dockerfiles.length > 0 ? dockerfiles : undefined);
  if (result.ok) {
    console.log(`--> .dockerignore allows all ${result.checked} COPY/ADD sources`);
  } else {
    for (const problem of result.problems) {
      console.error(problem);
    }
    process.exitCode = 1;
  }
}
