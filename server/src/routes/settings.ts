/**
 * The signed-in person's settings, the same on every device of theirs (store/settings.ts). A
 * change names only what it changes; both routes answer every setting. A change of queue style
 * reaches every one of the person's device sessions at once.
 */
import { getSettings, putSettings, type SettingsBody } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import type { Sessions } from '../queues/sessions.js';
import { serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { readSettings, writeSettings } from '../store/settings.js';
import type { User } from '../store/users.js';
import { signedIn } from './auth.js';

export function settingsRoutes(
  app: FastifyInstance,
  options: { db: Db; sessions: Sessions; now: () => number },
): void {
  const { db, sessions, now } = options;

  serve(app, getSettings, (request) => readSettings(db, signedIn(request).id));

  // The stored style and every session following it change together, or none of them does.
  const put = db.transaction((user: User, body: SettingsBody) => {
    const was = readSettings(db, user.id).queueStyle;
    const settings = writeSettings(db, user.id, body, now());
    if (settings.queueStyle !== was) sessions.restyle(user, settings.queueStyle);
    return settings;
  });

  serve(app, putSettings, (request, _reply, body) => put(signedIn(request), body));
}
