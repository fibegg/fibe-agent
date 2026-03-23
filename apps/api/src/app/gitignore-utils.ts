import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Minimal gitignore-aware filter.
 * Supports: plain names, glob wildcards (*), directory patterns (ending in /),
 * path patterns (containing /), comments (#), and negation (!).
 */
export interface GitignoreFilter {
  ignores(relativePath: string): boolean;
}

interface Rule {
  pattern: RegExp;
  negated: boolean;
  dirOnly: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string): RegExp {
  const parts = pattern.split('*');
  const regexStr = parts.map(escapeRegExp).join('[^/]*');
  return new RegExp(`^${regexStr}$`);
}

function parseGitignoreLine(line: string): Rule | null {
  let trimmed = line.trimEnd();
  if (!trimmed || trimmed.startsWith('#')) return null;

  let negated = false;
  if (trimmed.startsWith('!')) {
    negated = true;
    trimmed = trimmed.slice(1);
  }

  trimmed = trimmed.replace(/^\s+/, '');
  if (!trimmed) return null;

  const dirOnly = trimmed.endsWith('/');
  if (dirOnly) trimmed = trimmed.slice(0, -1);

  const hasSlash = trimmed.includes('/');
  const anchored = trimmed.startsWith('/');
  if (anchored) trimmed = trimmed.slice(1);

  if (hasSlash || anchored) {
    const parts = trimmed.split('**');
    const regexStr = parts.map((part) => {
      const subParts = part.split('*');
      return subParts.map(escapeRegExp).join('[^/]*');
    }).join('.*');
    return { pattern: new RegExp(`^${regexStr}(/|$)`), negated, dirOnly };
  }

  const baseRegex = patternToRegex(trimmed);
  return {
    pattern: new RegExp(`(^|/)${baseRegex.source.slice(1, -1)}(/|$)`),
    negated,
    dirOnly,
  };
}

class GitignoreFilterImpl implements GitignoreFilter {
  private rules: Rule[];

  constructor(rules: Rule[]) {
    this.rules = rules;
  }

  ignores(relativePath: string): boolean {
    let ignored = false;
    for (const rule of this.rules) {
      if (rule.pattern.test(relativePath)) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  }
}

function parseGitignoreContent(content: string): Rule[] {
  return content
    .split('\n')
    .map(parseGitignoreLine)
    .filter((r): r is Rule => r !== null);
}

const EMPTY_FILTER: GitignoreFilter = { ignores: () => false };

/**
 * Load .gitignore from a directory and optionally merge with a parent filter.
 * This supports nested .gitignore files — each directory can contribute rules.
 */
export async function loadGitignore(dir: string, parent?: GitignoreFilter): Promise<GitignoreFilter> {
  try {
    const content = await readFile(join(dir, '.gitignore'), 'utf-8');
    const localRules = parseGitignoreContent(content);
    if (parent && parent !== EMPTY_FILTER) {
      // Combine: parent rules check first, then local rules
      return {
        ignores(relativePath: string) {
          if (parent.ignores(relativePath)) return true;
          return new GitignoreFilterImpl(localRules).ignores(relativePath);
        },
      };
    }
    return new GitignoreFilterImpl(localRules);
  } catch {
    return parent ?? EMPTY_FILTER;
  }
}
