import { relative } from 'node:path';

// Prune these before opening directory watches, rather than merely dropping
// notifications after recursively subscribing to thousands of generated files.
const GENERATED_NAMES = new Set([
  'node_modules',
  '.git',
  'build',
  '.gradle',
  '.expo',
  '.next',
  'dist',
  '.cache',
  'cache',
  'caches',
  '.turbo',
  '.parcel-cache',
  'coverage',
]);

export function isGeneratedWorkspacePath(root: string, path: string): boolean {
  return relative(root, path)
    .split(/[\\/]/)
    .some((part) => GENERATED_NAMES.has(part));
}
