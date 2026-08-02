/**
 * Every error response this API sends has the same shape: `{ error: { code, message } }`.
 * This is the one place that decides the HTTP status and `code` for each failure kind,
 * so route handlers just funnel whatever they catch through `handleUpstreamError`.
 */

import type { FastifyReply } from 'fastify';
import { isAbsError, type AbsErrorCode } from '@auralis/abs-client';
import { NoCredentialsError, NotConfiguredError } from './absUpstream.js';

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
  not_found: 404,
  upstream_error: 502,
  bad_request: 400,
  schema_mismatch: 502,
};

const ABS_ERROR_API_CODE: Record<AbsErrorCode, string> = {
  network: 'upstream_unreachable',
  timeout: 'upstream_timeout',
  auth: 'upstream_auth_expired',
  not_found: 'not_found',
  upstream_error: 'upstream_error',
  bad_request: 'upstream_rejected',
  schema_mismatch: 'upstream_schema_mismatch',
};

/**
 * Maps an `AbsError` (or the two "not wired up yet" errors from absUpstream.ts) to a
 * structured response. Anything else is rethrown for Fastify's own error handler,
 * which logs it and returns a generic 500 — we never want an unrecognised error
 * silently swallowed here.
 */
export function handleUpstreamError(reply: FastifyReply, err: unknown): void {
  if (isAbsError(err)) {
    sendError(reply, ABS_ERROR_STATUS[err.code], ABS_ERROR_API_CODE[err.code], err.message);
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
  throw err;
}
