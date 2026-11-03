/**
 * The signed-in person's settings, the same on every device of theirs (store/settings.ts). A
 * change names only what it changes; both routes answer every setting.
 */
import { getSettings, putSettings } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { readSettings, writeSettings } from '../store/settings.js';
import { signedIn } from './auth.js';

export function settingsRoutes(app: FastifyInstance, options: { db: Db; now: () => number }): void {
  const { db, now } = options;

  serve(app, getSettings, (request) => readSettings(db, signedIn(request).id));

  serve(app, putSettings, (request, _reply, body) =>
    writeSettings(db, signedIn(request).id, body, now()),
  );
}
