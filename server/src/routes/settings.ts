/**
 * The signed-in person's settings, the same on every device of theirs (store/settings.ts). A
 * change names only what it changes; both routes answer every setting. A change of queue style
 * reaches every one of the person's device sessions at once.
 */
import { getSettings, putSettings } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import type { Sessions } from '../queues/sessions.js';
import { serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { readSettings, writeSettings } from '../store/settings.js';
import { signedIn } from './auth.js';

export function settingsRoutes(
  app: FastifyInstance,
  options: { db: Db; sessions: Sessions; now: () => number },
): void {
  const { db, sessions, now } = options;

  serve(app, getSettings, (request) => readSettings(db, signedIn(request).id));

  serve(app, putSettings, (request, _reply, body) => {
    const user = signedIn(request);
    const was = readSettings(db, user.id).queueStyle;
    const settings = writeSettings(db, user.id, body, now());
    if (settings.queueStyle !== was) sessions.restyle(user, settings.queueStyle);
    return settings;
  });
}
