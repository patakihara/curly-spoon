import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './health.js';
import { registerAuthRoutes } from './auth.js';
import { registerSetupRoutes } from './setup.js';
import { registerLibraryRoutes } from './libraries.js';
import { registerItemRoutes } from './items.js';
import { registerAuthorRoutes } from './authors.js';
import { registerPlaybackRoutes } from './playback.js';
import { registerProgressRoutes } from './progress.js';
import { registerMediaRoutes } from './media.js';
import { registerRequestRoutes } from './requests.js';
import { registerMusicRequestRoutes } from './musicRequests.js';
import { registerPodcastRoutes } from './podcasts.js';
import { registerJellyfinRoutes } from './jellyfin.js';
import { registerRecommendedRoutes } from './recommended.js';

/** All `/api/v1` routes, in one place so app.ts stays a thin composition root. */
export function registerRoutes(app: FastifyInstance): void {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerSetupRoutes(app);
  registerLibraryRoutes(app);
  registerItemRoutes(app);
  registerAuthorRoutes(app);
  registerPlaybackRoutes(app);
  registerProgressRoutes(app);
  registerMediaRoutes(app);
  registerRequestRoutes(app);
  registerMusicRequestRoutes(app);
  registerPodcastRoutes(app);
  registerJellyfinRoutes(app);
  registerRecommendedRoutes(app);
}
