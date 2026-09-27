/**
 * A sign-in in flight, and the one-time code an app swaps for its bearer token. Only hashes of
 * the state and the code are stored, and each is taken exactly once: the row is deleted in the
 * same transaction that reads it, so a replay finds nothing.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './connection.js';
import { DeviceKind } from './devices.js';

export const LOGIN_TTL_MS = 10 * 60 * 1000;
export const APP_CODE_TTL_MS = 60 * 1000;

/** Random bytes; injected so a test can replay a recorded sign-in. */
export type Random = (bytes: number) => Buffer;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** PKCE S256: base64url(sha256(verifier)). */
export function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export interface LoginRequest {
  state: string;
  nonce: string;
  verifier: string;
  client: DeviceKind;
  returnTo: string;
  appChallenge: string | null;
  deviceId: string | null;
}

/** Makes the state, nonce and PKCE verifier, 32 bytes each, and stores the request. */
export function startLogin(
  db: Db,
  params: Pick<LoginRequest, 'client' | 'returnTo' | 'appChallenge' | 'deviceId'>,
  random: Random,
  now: number,
): LoginRequest {
  const request: LoginRequest = {
    state: random(32).toString('base64url'),
    nonce: random(32).toString('base64url'),
    verifier: random(32).toString('base64url'),
    ...params,
  };
  db.prepare(
    `INSERT INTO login_requests (state_hash, nonce, verifier, client, return_to, app_challenge,
       device_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sha256(request.state),
    request.nonce,
    request.verifier,
    request.client,
    request.returnTo,
    request.appChallenge,
    request.deviceId,
    now + LOGIN_TTL_MS,
  );
  return request;
}

const LoginRow = z.object({
  nonce: z.string(),
  verifier: z.string(),
  client: DeviceKind,
  return_to: z.string(),
  app_challenge: z.string().nullable(),
  device_id: z.string().nullable(),
  expires_at: z.number(),
});

/** The request this state started, once; `null` when unknown, already used or expired. */
export function takeLogin(db: Db, state: string, now: number): LoginRequest | null {
  return db.transaction(() => {
    const hash = sha256(state);
    const raw = db.prepare('SELECT * FROM login_requests WHERE state_hash = ?').get(hash);
    if (raw === undefined) return null;
    db.prepare('DELETE FROM login_requests WHERE state_hash = ?').run(hash);
    const row = LoginRow.parse(raw);
    if (row.expires_at <= now) return null;
    return {
      state,
      nonce: row.nonce,
      verifier: row.verifier,
      client: row.client,
      returnTo: row.return_to,
      appChallenge: row.app_challenge,
      deviceId: row.device_id,
    };
  })();
}

export function issueAppCode(
  db: Db,
  params: { userId: string; deviceId: string; appChallenge: string },
  random: Random,
  now: number,
): string {
  const code = random(32).toString('base64url');
  db.prepare(
    `INSERT INTO app_codes (code_hash, user_id, device_id, app_challenge, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sha256(code), params.userId, params.deviceId, params.appChallenge, now + APP_CODE_TTL_MS);
  return code;
}

const AppCodeRow = z.object({
  user_id: z.string(),
  device_id: z.string(),
  app_challenge: z.string(),
  expires_at: z.number(),
});

/**
 * Who the code signs in, once, and only for the app that holds the verifier behind the challenge
 * it sent at login. A wrong verifier burns the code too.
 */
export function takeAppCode(
  db: Db,
  code: string,
  verifier: string,
  now: number,
): { userId: string; deviceId: string } | null {
  return db.transaction(() => {
    const hash = sha256(code);
    const raw = db.prepare('SELECT * FROM app_codes WHERE code_hash = ?').get(hash);
    if (raw === undefined) return null;
    db.prepare('DELETE FROM app_codes WHERE code_hash = ?').run(hash);
    const row = AppCodeRow.parse(raw);
    if (row.expires_at <= now || s256(verifier) !== row.app_challenge) return null;
    return { userId: row.user_id, deviceId: row.device_id };
  })();
}
