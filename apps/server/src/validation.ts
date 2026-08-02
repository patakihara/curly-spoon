/**
 * The zod-validated request boundary: params/query/body are parsed with zod before a
 * route handler ever sees them, and a failure short-circuits straight to a structured
 * 400 — the handler itself can then assume its input is already the right shape.
 */

import type { FastifyReply } from 'fastify';
import type { z, ZodTypeAny } from 'zod';
import { sendError } from './httpErrors.js';

/** Validates `value` against `schema`; on failure, sends a 400 and returns `undefined`. */
export function parseInput<T extends ZodTypeAny>(
  reply: FastifyReply,
  schema: T,
  value: unknown,
): z.infer<T> | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  sendError(reply, 400, 'invalid_request', detail);
  return undefined;
}
