/**
 * AES-256-GCM at rest for the `secrets` table (upstream credentials).
 *
 * The key is derived from `SESSION_SECRET` with SHA-256 rather than stored
 * separately — `SESSION_SECRET` is already required to be high-entropy
 * (config.ts enforces a 32-character floor), so a second secret to manage
 * would add operational risk without adding real security.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(sessionSecret: string): Buffer {
  return createHash('sha256').update(sessionSecret, 'utf8').digest();
}

/** Raised when a ciphertext can't be decrypted — wrong key, or the payload has been tampered with. */
export class DecryptionError extends Error {
  constructor(cause: unknown) {
    super('Failed to decrypt stored secret — wrong key or corrupted data');
    this.name = 'DecryptionError';
    this.cause = cause;
  }
}

/** Encrypt `plaintext`, returning a single self-contained base64 blob (iv ‖ authTag ‖ ciphertext). */
export function encryptSecret(plaintext: string, sessionSecret: string): string {
  const key = deriveKey(sessionSecret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Reverse of `encryptSecret`. Throws `DecryptionError` on a wrong key or tampered payload. */
export function decryptSecret(blob: string, sessionSecret: string): string {
  const key = deriveKey(sessionSecret);
  const raw = Buffer.from(blob, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (cause) {
    throw new DecryptionError(cause);
  }
}
