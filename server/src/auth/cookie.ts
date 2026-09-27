/**
 * The server's two cookies, both HttpOnly: the session, an opaque pointer to a row in `sessions`,
 * and the device id, which only says which device this browser is and signs no one in.
 */

import { DEVICE_COOKIE, SESSION_COOKIE } from '@auralis/schema';
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

/** Browsers cap a cookie's life at 400 days. */
const DEVICE_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

export function setDeviceCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  secure: CookieSecure,
  deviceId: string,
): void {
  reply.setCookie(DEVICE_COOKIE, deviceId, {
    ...options(request, secure),
    maxAge: DEVICE_COOKIE_MAX_AGE_S,
  });
}
