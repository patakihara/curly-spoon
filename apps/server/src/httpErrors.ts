/**
 * Every error response this API sends has the same shape: `{ error: { code, message } }`.
 * This is the one place that decides the HTTP status and `code` for each failure kind,
 * so route handlers just funnel whatever they catch through `handleUpstreamError`.
 */

import type { FastifyReply } from 'fastify';
import { isAbsError, type AbsErrorCode } from '@auralis/abs-client';
import { isJellyfinError, type JellyfinErrorCode } from '@auralis/jellyfin-client';
import { NoCredentialsError, NotConfiguredError } from './absUpstream.js';
import { JellyfinNoCredentialsError, JellyfinNotConfiguredError } from './jellyfinUpstream.js';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): void {
  reply.code(status).send({ error: { code, message } } satisfies ApiErrorBody);
}

const ABS_ERROR_STATUS: Record<AbsErrorCode, number> = {
  network: 502,
  timeout: 504,
  auth: 401,
  forbidden: 403,
  not_found: 404,
  upstream_error: 502,
  bad_request: 400,
  schema_mismatch: 502,
};

const ABS_ERROR_API_CODE: Record<AbsErrorCode, string> = {
  network: 'upstream_unreachable',
  timeout: 'upstream_timeout',
  auth: 'upstream_auth_expired',
  forbidden: 'upstream_forbidden',
  not_found: 'not_found',
  upstream_error: 'upstream_error',
  bad_request: 'upstream_rejected',
  schema_mismatch: 'upstream_schema_mismatch',
};

// Mirrors ABS_ERROR_STATUS/ABS_ERROR_API_CODE above field-for-field — both media
// clients (`@auralis/abs-client`, `@auralis/jellyfin-client`) define the same error
// `code` union by design (see jellyfin-client's errors.ts file comment), so the two
// maps stay structurally identical on purpose, not by coincidence.
const JELLYFIN_ERROR_STATUS: Record<JellyfinErrorCode, number> = {
  network: 502,
  timeout: 504,
  auth: 401,
  forbidden: 403,
  not_found: 404,
  upstream_error: 502,
  bad_request: 400,
  schema_mismatch: 502,
};

const JELLYFIN_ERROR_API_CODE: Record<JellyfinErrorCode, string> = {
  network: 'jellyfin_unreachable',
  timeout: 'jellyfin_timeout',
  auth: 'jellyfin_auth_expired',
  forbidden: 'jellyfin_forbidden',
  not_found: 'not_found',
  upstream_error: 'jellyfin_upstream_error',
  bad_request: 'jellyfin_rejected',
  schema_mismatch: 'jellyfin_schema_mismatch',
};

/**
 * Maps an `AbsError`/`JellyfinError` (or the "not wired up yet" errors from
 * absUpstream.ts/jellyfinUpstream.ts) to a structured response. Anything else is
 * rethrown for Fastify's own error handler, which logs it and returns a generic 500 —
 * we never want an unrecognised error silently swallowed here.
 */
export function handleUpstreamError(reply: FastifyReply, err: unknown): void {
  if (isAbsError(err)) {
    sendError(reply, ABS_ERROR_STATUS[err.code], ABS_ERROR_API_CODE[err.code], err.message);
    return;
  }
  if (isJellyfinError(err)) {
    sendError(
      reply,
      JELLYFIN_ERROR_STATUS[err.code],
      JELLYFIN_ERROR_API_CODE[err.code],
      err.message,
    );
    return;
  }
  if (err instanceof NotConfiguredError) {
    sendError(reply, 409, 'not_configured', err.message);
    return;
  }
  if (err instanceof NoCredentialsError) {
    sendError(reply, 401, 'unauthenticated', err.message);
    return;
  }
  if (err instanceof JellyfinNotConfiguredError) {
    sendError(reply, 409, 'jellyfin_not_configured', err.message);
    return;
  }
  if (err instanceof JellyfinNoCredentialsError) {
    sendError(reply, 401, 'jellyfin_unauthenticated', err.message);
    return;
  }
  throw err;
}
