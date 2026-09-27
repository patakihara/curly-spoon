/**
 * AES-256-GCM at rest for each person's upstream tokens: one base64 blob, iv ‖ tag ‖ ciphertext.
 * The row it belongs to (`user_id|service`) is bound in as additional data, so a ciphertext
 * copied to another row fails to decrypt. The key is 32 random bytes of its own, from the
 * environment or from a 0600 file under the data folder, made at first boot.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/** Raised when a ciphertext can't be decrypted: wrong key, wrong row, or tampered with. */
export class DecryptionError extends Error {
  constructor(cause: unknown) {
    super('Failed to decrypt a stored secret: wrong key, wrong row or corrupted data');
    this.name = 'DecryptionError';
    this.cause = cause;
  }
}

export function encryptSecret(plaintext: string, key: Buffer, aad: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptSecret(blob: string, key: Buffer, aad: string): string {
  const raw = Buffer.from(blob, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (cause) {
    throw new DecryptionError(cause);
  }
}

function decodeKey(text: string, where: string): Buffer {
  const key = Buffer.from(text.trim(), 'base64');
  if (key.length !== KEY_LENGTH) throw new Error(`${where} must be base64 of 32 bytes`);
  return key;
}

/** The environment's key when given, else the file's, made 0600 when it does not exist yet. */
export function loadSecretKey(options: { file: string; env?: string | undefined }): Buffer {
  if (options.env !== undefined && options.env !== '') return decodeKey(options.env, 'SECRET_KEY');
  const { file } = options;
  if (!existsSync(file)) {
    writeFileSync(file, `${randomBytes(KEY_LENGTH).toString('base64')}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
  }
  if ((statSync(file).mode & 0o077) !== 0) {
    throw new Error(`${file} may be read by others; make it 0600`);
  }
  return decodeKey(readFileSync(file, 'utf8'), file);
}
