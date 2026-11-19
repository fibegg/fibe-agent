import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Agent tools load AGENTS.md into every session, some only up to a fixed byte
// budget. Keep it to the rules an agent needs; reference material belongs in
// docs/.
export const maxAgentsMdBytes = 16 * 1024;

export function checkAgentsMdSize(file, limit = maxAgentsMdBytes) {
  const size = statSync(file).size;
  return {
    ok: size <= limit,
    size,
    limit,
    message:
      size <= limit
        ? `${path.basename(file)} is ${size} bytes (limit ${limit}).`
        : `${path.basename(file)} is ${size} bytes, above the ${limit}-byte limit. Move reference material to docs/ and link it.`,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(repoRoot, 'AGENTS.md');
  const result = checkAgentsMdSize(file);
  (result.ok ? console.log : console.error)(`--> ${result.message}`);
  process.exitCode = result.ok ? 0 : 1;
}
