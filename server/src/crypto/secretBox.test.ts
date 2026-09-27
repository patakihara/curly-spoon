import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DecryptionError, decryptSecret, encryptSecret, loadSecretKey } from './secretBox.js';

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 8);

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-secret-'));
  dirs.push(dir);
  return dir;
}

describe('[M0.sso/c] an upstream token at rest', () => {
  it('decrypts back to the token under the same key and the same row', () => {
    const blob = encryptSecret('abs-token-1', KEY, 'user-1|abs');
    expect(blob).not.toContain('abs-token-1');
    expect(decryptSecret(blob, KEY, 'user-1|abs')).toBe('abs-token-1');
  });

  it('fails to decrypt when moved to another row', () => {
    const blob = encryptSecret('abs-token-1', KEY, 'user-1|abs');
    expect(() => decryptSecret(blob, KEY, 'user-2|abs')).toThrow(DecryptionError);
    expect(() => decryptSecret(blob, KEY, 'user-1|jellyfin')).toThrow(DecryptionError);
  });

  it('fails to decrypt under another key, or once a byte is changed', () => {
    const blob = encryptSecret('abs-token-1', KEY, 'user-1|abs');
    expect(() => decryptSecret(blob, OTHER_KEY, 'user-1|abs')).toThrow(DecryptionError);
    const raw = Buffer.from(blob, 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] as number) ^ 1;
    expect(() => decryptSecret(raw.toString('base64'), KEY, 'user-1|abs')).toThrow(DecryptionError);
  });

  it('never encrypts the same token to the same bytes twice', () => {
    expect(encryptSecret('t', KEY, 'a')).not.toBe(encryptSecret('t', KEY, 'a'));
  });
});

describe('[M0.sso/c] the key that encrypts upstream tokens', () => {
  it('is made at first boot as 32 random bytes in a file only the server may read', () => {
    const file = join(tempDir(), 'secret.key');
    const key = loadSecretKey({ file });
    expect(key).toHaveLength(32);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(loadSecretKey({ file })).toEqual(key);
    expect(readFileSync(file, 'utf8')).not.toBe('');
  });

  it('comes from the environment when one is given, as base64 of 32 bytes', () => {
    const file = join(tempDir(), 'secret.key');
    expect(loadSecretKey({ file, env: KEY.toString('base64') })).toEqual(KEY);
    expect(() => loadSecretKey({ file, env: Buffer.alloc(16).toString('base64') })).toThrow(
      /32 bytes/,
    );
  });

  it('is refused from a file others may read', () => {
    const file = join(tempDir(), 'secret.key');
    writeFileSync(file, KEY.toString('base64'));
    chmodSync(file, 0o644);
    expect(() => loadSecretKey({ file })).toThrow(/0600/);
  });
});
