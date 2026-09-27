/**
 * Setup claims the admin role once, with the one-time code from the data folder; after that only
 * a signed-in admin may run it, and it grants admin to another username.
 */

import { getSetup, postSetup } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { setSessionCookie } from '../auth/cookie.js';
import type { CookieSecure } from '../config.js';
import { Refusal, serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { createSession } from '../store/sessions.js';
import { consumeSetupCode, verifySetupCode } from '../store/setupCode.js';
import { hasAdmin, upsertUser } from '../store/users.js';

export function setupRoutes(
  app: FastifyInstance,
  options: { db: Db; cookieSecure: CookieSecure; setupCodeFile: string | null },
): void {
  const { db, cookieSecure, setupCodeFile } = options;

  serve(app, getSetup, () => ({ configured: hasAdmin(db) }));

  // Claim or grant is decided here, in one transaction, never from the access hook's earlier
  // look: a request that passed the hook while unclaimed may run only after the claim lands.
  serve(app, postSetup, (request, reply, body) => {
    const outcome = db.transaction(() => {
      if (hasAdmin(db)) {
        if (request.user === null) throw new Refusal(401, 'unauthenticated');
        if (request.user.role !== 'admin') throw new Refusal(403, 'forbidden');
        return { user: upsertUser(db, { username: body.username, role: 'admin' }), session: null };
      }
      if (body.code === undefined || !verifySetupCode(db, body.code)) {
        throw new Refusal(403, 'wrong_code');
      }
      const user = upsertUser(db, { username: body.username, role: 'admin' });
      consumeSetupCode(db, setupCodeFile);
      return { user, session: createSession(db, user.id) };
    })();
    if (outcome.session !== null) {
      setSessionCookie(
        request,
        reply,
        cookieSecure,
        outcome.session.token,
        outcome.session.expiresAt,
      );
    }
    return { username: outcome.user.username, role: outcome.user.role };
  });
}
