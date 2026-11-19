import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ios = process.argv[2];
if (!ios) throw new Error('Usage: node scripts/check-generative-chat-contract.mjs /path/to/fibe-ios');
const contract = fileURLToPath(new URL('../contracts/generative-chat/', import.meta.url));
for (const [source, bundled] of [
  ['schema.json', 'generative-chat-schema.json'],
  ['example.json', 'generative-chat-example.json'],
  ['text-example.json', 'generative-chat-text-example.json'],
]) {
  if (!readFileSync(resolve(contract, source)).equals(readFileSync(resolve(ios, 'Fibe/GenerativeChat/Resources', bundled)))) {
    throw new Error(`Generative chat contract differs: ${source}`);
  }
}
console.log('Generative chat schema and examples match the iOS bundle.');
