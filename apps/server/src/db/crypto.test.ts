import { describe, expect, it } from 'vitest';
import { decryptSecret, DecryptionError, encryptSecret } from './crypto.js';

const secret = 'a'.repeat(32);

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext value', () => {
    const ciphertext = encryptSecret('upstream-token-abc123', secret);
    expect(decryptSecret(ciphertext, secret)).toBe('upstream-token-abc123');
  });

  it('never stores the plaintext inside the ciphertext blob', () => {
    const ciphertext = encryptSecret('super-secret-token', secret);
    expect(ciphertext).not.toContain('super-secret-token');
  });

  it('produces a different ciphertext each time (random IV) even for the same input', () => {
    const a = encryptSecret('same-token', secret);
    const b = encryptSecret('same-token', secret);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, secret)).toBe('same-token');
    expect(decryptSecret(b, secret)).toBe('same-token');
  });

  it('refuses to decrypt with the wrong key', () => {
    const ciphertext = encryptSecret('token', secret);
    expect(() => decryptSecret(ciphertext, 'b'.repeat(32))).toThrow(DecryptionError);
  });

  it('refuses to decrypt a tampered payload', () => {
    const ciphertext = encryptSecret('token', secret);
    const raw = Buffer.from(ciphertext, 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1]! + 1) % 256;
    expect(() => decryptSecret(raw.toString('base64'), secret)).toThrow(DecryptionError);
  });
});
