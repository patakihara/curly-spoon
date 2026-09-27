/**
 * The one hook between every request and its handler. It resolves the session cookie (rotating it
 * past half its life), refuses a signed-in write from another site, then enforces the access the
 * route declared in schema/: 401 without a session, 403 without the role. A route that declares
 * no access cannot be registered at all.
 */

import { type Access, SESSION_COOKIE } from '@auralis/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CookieSecure } from '../config.js';
import type { Db } from '../store/connection.js';
import { rotateSession, validateSession } from '../store/sessions.js';
import { getUserById, hasAdmin, type User } from '../store/users.js';
import { clearSessionCookie, setSessionCookie } from './cookie.js';
import type { ProxyTrust } from './proxy.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
  }
  interface FastifyRequest {
    user: User | null;
    /** The session cookie's current value, after any rotation. */
    sessionToken: string | null;
  }
}

export interface AccessOptions {
  db: Db;
  proxy: ProxyTrust;
  cookieSecure: CookieSecure;
  /** Where browsers load the app from; `undefined` allows the request's own origin. */
  publicOrigin: string | undefined;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originOf(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

/** The Origin header, or failing that the Referer's origin, must be the app's own. */
function fromOwnSite(request: FastifyRequest, publicOrigin: string | undefined): boolean {
  const expected = publicOrigin ?? originOf(`${request.protocol}://${request.host}`);
  const { origin, referer } = request.headers;
  const claimed = origin !== undefined && origin !== '' ? originOf(origin) : originOf(referer);
  return claimed !== undefined && claimed === expected;
}

function refuse(reply: FastifyReply, status: 401 | 403, error: string) {
  return reply.code(status).send({ error });
}

export function registerAccess(app: FastifyInstance, options: AccessOptions): void {
  const { db, proxy, cookieSecure, publicOrigin } = options;
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  // Fails closed: a route added without an access declaration stops the app from being built.
  app.addHook('onRoute', (route) => {
    if (route.config?.access === undefined) {
      throw new Error(`${String(route.method)} ${route.url} declares no access`);
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    // Before anything reads request.ip or request.protocol, which consult the trust.
    await proxy.refreshIfStale();

    const token = request.cookies[SESSION_COOKIE];
    if (token !== undefined && token !== '') {
      if (UNSAFE_METHODS.has(request.method) && !fromOwnSite(request, publicOrigin)) {
        return refuse(reply, 403, 'cross_origin');
      }
      const session = validateSession(db, token);
      const user = session ? getUserById(db, session.userId) : null;
      if (session === null || user === null) {
        clearSessionCookie(request, reply, cookieSecure);
      } else {
        request.user = user;
        request.sessionToken = token;
        if (session.shouldRotate) {
          const rotated = rotateSession(db, token);
          if (rotated) {
            request.sessionToken = rotated.token;
            setSessionCookie(request, reply, cookieSecure, rotated.token, rotated.expiresAt);
          }
        }
      }
    }

    // No route matched: the not-found handler answers, public by declaration here.
    if (request.is404) return;
    const access = request.routeOptions.config.access;
    if (access === 'public') return;
    // Only a first look: the setup handler decides claim or grant again, atomically.
    if (access === 'setup' && !hasAdmin(db)) return;
    if (request.user === null) return refuse(reply, 401, 'unauthenticated');
    if (access !== 'member' && request.user.role !== 'admin') {
      return refuse(reply, 403, 'forbidden');
    }
  });
}
