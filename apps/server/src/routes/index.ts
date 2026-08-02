import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './health.js';
import { registerAuthRoutes } from './auth.js';
import { registerSetupRoutes } from './setup.js';
import { registerLibraryRoutes } from './libraries.js';
import { registerItemRoutes } from './items.js';
import { registerPlaybackRoutes } from './playback.js';
import { registerProgressRoutes } from './progress.js';
import { registerMediaRoutes } from './media.js';

/** All `/api/v1` routes, in one place so app.ts stays a thin composition root. */
export function registerRoutes(app: FastifyInstance): void {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerSetupRoutes(app);
  registerLibraryRoutes(app);
  registerItemRoutes(app);
  registerPlaybackRoutes(app);
  registerProgressRoutes(app);
  registerMediaRoutes(app);
}
