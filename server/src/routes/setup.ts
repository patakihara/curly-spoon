/**
 * Setup claims the admin role once, with the one-time code from the data folder; after that the
 * access hook lets only an admin in, and setup grants admin to another username.
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

  serve(app, postSetup, (request, reply, body) => {
    if (hasAdmin(db)) {
      // Only an admin reaches here once setup has run.
      const granted = upsertUser(db, { username: body.username, role: 'admin' });
      return { username: granted.username, role: granted.role };
    }
    if (body.code === undefined || !verifySetupCode(db, body.code)) {
      throw new Refusal(403, 'wrong_code');
    }
    const { admin, session } = db.transaction(() => {
      const admin = upsertUser(db, { username: body.username, role: 'admin' });
      consumeSetupCode(db, setupCodeFile);
      return { admin, session: createSession(db, admin.id) };
    })();
    setSessionCookie(request, reply, cookieSecure, session.token, session.expiresAt);
    return { username: admin.username, role: admin.role };
  });
}
