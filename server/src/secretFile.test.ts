import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSecretFile } from './secretFile.js';

let dir: string | undefined;
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});
function file(text: string): string {
  dir = mkdtempSync(join(tmpdir(), 'auralis-secret-file-'));
  const path = join(dir, 'keys');
  writeFileSync(path, text);
  return path;
}

describe('[M0.sso/c] reading an upstream key from its file', () => {
  it('takes the named line of a shared keys file', () => {
    const path = file('ABS_API_KEY=listen\nABS_PROVISION_KEY=mint\n');
    expect(readSecretFile(path, 'ABS_PROVISION_KEY')).toBe('mint');
  });

  it('takes a file holding only the value', () => {
    expect(readSecretFile(file('  only-the-key\n'), 'JELLYFIN_API_KEY')).toBe('only-the-key');
  });

  it('refuses a keys file without the named line, rather than using another key', () => {
    expect(() => readSecretFile(file('ABS_API_KEY=listen\n'), 'ABS_PROVISION_KEY')).toThrow(
      /no ABS_PROVISION_KEY/,
    );
  });
});
