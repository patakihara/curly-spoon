import { getMe, logout } from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { clearSessionCookie } from '../auth/cookie.js';
import type { CookieSecure } from '../config.js';
import { serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { deleteSession } from '../store/sessions.js';
import { listLinks, SERVICES } from '../store/upstreamLinks.js';
import type { User } from '../store/users.js';

/** The access hook has already refused a request without a session on these routes. */
export function signedIn(request: FastifyRequest): User & { deviceId: string } {
  if (request.user === null || request.deviceId === null) {
    throw new Error('invariant: a member route ran without a session');
  }
  return { ...request.user, deviceId: request.deviceId };
}

export function authRoutes(
  app: FastifyInstance,
  options: { db: Db; cookieSecure: CookieSecure },
): void {
  const { db, cookieSecure } = options;

  serve(app, getMe, (request) => {
    const user = signedIn(request);
    const links = listLinks(db, user.id);
    return {
      username: user.username,
      role: user.role,
      deviceId: user.deviceId,
      links: SERVICES.map((service) => {
        const link = links.find((l) => l.service === service);
        return { service, state: link?.state ?? 'unlinked', detail: link?.detail ?? null };
      }),
    };
  });

  serve(app, logout, (request, reply) => {
    signedIn(request);
    if (request.sessionToken !== null) deleteSession(db, request.sessionToken);
    clearSessionCookie(request, reply, cookieSecure);
    return { ok: true };
  });
}
