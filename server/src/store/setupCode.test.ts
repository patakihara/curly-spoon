import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { consumeSetupCode, issueSetupCode, verifySetupCode } from './setupCode.js';

describe('the one-time setup code', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function fresh() {
    dir = mkdtempSync(join(tmpdir(), 'auralis-setup-'));
    return { db: openDatabase(':memory:'), file: join(dir, 'setup-code') };
  }

  it('writes the code to a file only its owner can read, and stores only its hash', () => {
    const { db, file } = fresh();
    const code = issueSetupCode(db, file);

    expect(readFileSync(file, 'utf8').trim()).toBe(code);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const stored = JSON.stringify(db.prepare('SELECT * FROM setup_code').all());
    expect(stored).not.toContain(code);
  });

  it('accepts only the code it issued', () => {
    const { db, file } = fresh();
    const code = issueSetupCode(db, file);
    expect(verifySetupCode(db, code)).toBe(true);
    expect(verifySetupCode(db, `${code}x`)).toBe(false);
    expect(verifySetupCode(db, '')).toBe(false);
  });

  it('replaces an earlier code when issued again', () => {
    const { db, file } = fresh();
    const first = issueSetupCode(db, file);
    const second = issueSetupCode(db, file);
    expect(verifySetupCode(db, first)).toBe(false);
    expect(verifySetupCode(db, second)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('once consumed, is gone from the store and the disk', () => {
    const { db, file } = fresh();
    const code = issueSetupCode(db, file);
    consumeSetupCode(db, file);
    expect(verifySetupCode(db, code)).toBe(false);
    expect(existsSync(file)).toBe(false);
  });
});
