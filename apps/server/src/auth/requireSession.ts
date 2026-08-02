/**
 * Fastify preHandler guarding every authenticated route: reads the session cookie,
 * validates it against the DB, and — since sessions rotate near expiry — re-issues
 * the cookie transparently when that happens. `request.userId` is the only thing
 * downstream route handlers need to read.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/connection.js';
import { sendError } from '../httpErrors.js';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from './cookies.js';
import { resolveSession } from './sessionService.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export function createRequireSession(db: Db, cookieSecure: boolean) {
  return async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      sendError(reply, 401, 'unauthenticated', 'Sign in required');
      return;
    }

    const resolved = resolveSession(db, token);
    if (!resolved) {
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      sendError(reply, 401, 'unauthenticated', 'Session expired — sign in again');
      return;
    }

    if (resolved.rotated) {
      reply.setCookie(
        SESSION_COOKIE_NAME,
        resolved.rotated.token,
        sessionCookieOptions(cookieSecure, resolved.rotated.expiresAt - Date.now()),
      );
    }

    request.userId = resolved.userId;
  };
}
