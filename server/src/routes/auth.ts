import { getMe, logout } from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { clearSessionCookie } from '../auth/cookie.js';
import type { CookieSecure } from '../config.js';
import { serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { deleteSession } from '../store/sessions.js';
import type { User } from '../store/users.js';

/** The access hook has already refused a request without a session on these routes. */
function signedIn(request: FastifyRequest): User {
  if (request.user === null) throw new Error('invariant: a member route ran without a session');
  return request.user;
}

export function authRoutes(
  app: FastifyInstance,
  options: { db: Db; cookieSecure: CookieSecure },
): void {
  const { db, cookieSecure } = options;

  serve(app, getMe, (request) => {
    const user = signedIn(request);
    return { username: user.username, role: user.role };
  });

  serve(app, logout, (request, reply) => {
    signedIn(request);
    if (request.sessionToken !== null) deleteSession(db, request.sessionToken);
    clearSessionCookie(request, reply, cookieSecure);
    return { ok: true };
  });
}
