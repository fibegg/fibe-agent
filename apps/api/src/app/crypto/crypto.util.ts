import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function deriveKey(keyString: string): Buffer {
  return createHash('sha256').update(keyString).digest();
}

/** Encrypts as `ENC:<iv>:<tag>:<ciphertext>` with AES-256-GCM, or passes through without a key. */
export function encryptData(text: string, keyString?: string): string {
  if (!keyString) return text;

  const key = deriveKey(keyString);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `ENC:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/** Decrypts `encryptData` output and passes through unencrypted text. */
export function decryptData(cipherText: string, keyString?: string): string {
  if (!cipherText.startsWith('ENC:')) return cipherText;

  if (!keyString) {
    throw new Error('Missing ENCRYPTION_KEY but store is encrypted.');
  }

  const parts = cipherText.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted format.');
  }

  const key = deriveKey(keyString);
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const encrypted = Buffer.from(parts[3], 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
