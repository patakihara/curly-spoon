/**
 * The one-time code that claims the admin role. The store keeps only its hash; the code itself
 * goes to a file only the server's user can read, and both go once the code is used.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { Db } from './connection.js';

function hashCode(code: string): Buffer {
  return createHash('sha256').update(code).digest();
}

/** Issues a fresh code, replacing any earlier one, and returns it. */
export function issueSetupCode(db: Db, file: string): string {
  const code = randomBytes(32).toString('base64url');
  db.prepare(
    `INSERT INTO setup_code (only, code_hash, created_at) VALUES (1, ?, ?)
     ON CONFLICT (only) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at`,
  ).run(hashCode(code).toString('hex'), Date.now());
  writeFileSync(file, `${code}\n`, { mode: 0o600 });
  // `mode` applies only when the file is created; an earlier code's file keeps its own.
  chmodSync(file, 0o600);
  return code;
}

const CodeRow = z.object({ code_hash: z.string().regex(/^[0-9a-f]{64}$/) });

/** Constant-time: compares the hashes, which are always the same length. */
export function verifySetupCode(db: Db, code: string): boolean {
  const raw = db.prepare('SELECT code_hash FROM setup_code WHERE only = 1').get();
  if (raw === undefined) return false;
  const stored = Buffer.from(CodeRow.parse(raw).code_hash, 'hex');
  return timingSafeEqual(stored, hashCode(code));
}

export function consumeSetupCode(db: Db, file: string | null): void {
  db.prepare('DELETE FROM setup_code').run();
  if (file !== null) rmSync(file, { force: true });
}
