/** The one cookie the server issues: an opaque, HttpOnly pointer to a row in `sessions`. */

import { SESSION_COOKIE } from '@auralis/schema';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CookieSecure } from '../config.js';

/**
 * `SameSite=Lax` is sent on top-level navigation, so a reload keeps you signed in, and withheld on
 * cross-site subrequests. `auto` marks it `Secure` exactly when the request came in over HTTPS,
 * which is only believed from a trusted proxy, so plain LAN HTTP still signs in.
 */
function options(request: FastifyRequest, secure: CookieSecure) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secure === 'auto' ? request.protocol === 'https' : secure,
    path: '/',
  };
}

export function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  secure: CookieSecure,
  token: string,
  expiresAt: number,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    ...options(request, secure),
    maxAge: Math.max(0, Math.round((expiresAt - Date.now()) / 1000)),
  });
}

export function clearSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  secure: CookieSecure,
): void {
  reply.clearCookie(SESSION_COOKIE, options(request, secure));
}
