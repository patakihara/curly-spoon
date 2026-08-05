/**
 * `buildServer` is the one factory both `main.ts` and every route test use — tests
 * inject an in-memory DB and a fake upstream `fetch` here and drive the app purely
 * through `fastify.inject()`, never binding a real port (see ARCHITECTURE.md's
 * testing strategy).
 */

import { randomUUID } from 'node:crypto';
import fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookiePlugin from '@fastify/cookie';
import corsPlugin from '@fastify/cors';
import type { FetchLike } from '@auralis/abs-client';
import type { AppConfig } from './config.js';
import type { Db } from './db/connection.js';
import { createAbsUpstreamFactory, type AbsUpstreamFactory } from './absUpstream.js';
import { createJellyfinUpstreamFactory, type JellyfinUpstreamFactory } from './jellyfinUpstream.js';
import { RateLimiter } from './auth/rateLimit.js';
import { sendError } from './httpErrors.js';
import { registerRoutes } from './routes/index.js';
import { registerStaticServing } from './static.js';
import { createRequestService, type RequestService } from './requests/requestService.js';
import {
  createMusicRequestService,
  type MusicRequestService,
} from './requests/musicRequestService.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: AppConfig;
    abs: AbsUpstreamFactory;
    jellyfin: JellyfinUpstreamFactory;
    loginRateLimiter: RateLimiter;
    requests: RequestService;
    /** Music's counterpart to `requests` — search, create, list and a `grab` that stops at
     * `downloading`; see that service's file comment for why it has no `pollDownloads`. */
    musicRequests: MusicRequestService;
    /**
     * The same injected upstream `fetch` `abs` and `requests` are built from, exposed
     * directly. `RequestService` deliberately has no "build me one arbitrary provider,
     * enabled or not" method — `listIndexers`/`getDownloadClient` only return providers
     * that are already enabled (see `buildProvider` in requestService.ts), and
     * `getDownloadClient` isn't even addressable by id. `POST /providers/:id/test` needs
     * exactly the thing those methods withhold: build *this* id's provider from its
     * stored config regardless of `enabled`, so a user can verify credentials before
     * flipping a provider on. Route layer builds that provider itself, straight from the
     * registries, and needs the raw `fetch` to do it.
     */
    upstreamFetch: FetchLike;
  }
}

export interface BuildServerDeps {
  db: Db;
  config: AppConfig;
  /** The upstream fetch — real `fetch` in production, the fixture-backed fake in tests/dev. */
  fetch: FetchLike;
  /** Pass `false` in tests to silence request logging; defaults to on. */
  logger?: boolean;
  /** Retry backoff base for the upstream client — overridden to a few ms in tests. */
  absRetryBaseDelayMs?: number;
  /** Same as `absRetryBaseDelayMs`, for the Jellyfin client. */
  jellyfinRetryBaseDelayMs?: number;
}

export function buildServer(deps: BuildServerDeps): FastifyInstance {
  const app = fastify({
    logger: deps.logger ?? true,
    genReqId: (request) => request.headers['x-request-id']?.toString() ?? randomUUID(),
  });

  app.decorate('db', deps.db);
  app.decorate('config', deps.config);
  app.decorate(
    'abs',
    createAbsUpstreamFactory({
      db: deps.db,
      sessionSecret: deps.config.sessionSecret,
      fetch: deps.fetch,
      retryBaseDelayMs: deps.absRetryBaseDelayMs,
    }),
  );
  app.decorate(
    'jellyfin',
    createJellyfinUpstreamFactory({
      db: deps.db,
      sessionSecret: deps.config.sessionSecret,
      fetch: deps.fetch,
      retryBaseDelayMs: deps.jellyfinRetryBaseDelayMs,
    }),
  );
  // 10 attempts/minute/IP: generous for a genuine user mistyping a password a few
  // times, punishing for a credential-stuffing script.
  app.decorate('loginRateLimiter', new RateLimiter({ windowMs: 60_000, max: 10 }));
  app.decorate(
    'requests',
    createRequestService({
      db: deps.db,
      sessionSecret: deps.config.sessionSecret,
      fetch: deps.fetch,
      absFor: (userId) => app.abs.forUser(userId),
      logger: app.log,
    }),
  );
  app.decorate(
    'musicRequests',
    createMusicRequestService({
      db: deps.db,
      sessionSecret: deps.config.sessionSecret,
      fetch: deps.fetch,
      logger: app.log,
    }),
  );
  app.decorate('upstreamFetch', deps.fetch);

  void app.register(cookiePlugin);
  // The web app is served from this same origin (see static.ts) — there is no
  // legitimate cross-origin caller, so deny by default rather than reflecting
  // an arbitrary Origin back.
  void app.register(corsPlugin, { origin: false });

  void app.register(
    async (instance) => {
      registerRoutes(instance);
    },
    { prefix: '/api/v1' },
  );

  // Also owns the app's one 404 handler (both the JSON `/api/*` shape and the
  // SPA fallback for everything else) — see static.ts for why those two are
  // one concern, not two.
  void registerStaticServing(app, deps.config);

  app.setErrorHandler((err: FastifyError, request, reply) => {
    request.log.error({ err }, 'unhandled error');
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const code = status === 500 ? 'internal_error' : (err.code ?? 'error');
    const message = status === 500 ? 'Internal server error' : err.message;
    sendError(reply, status, code, message);
  });

  return app;
}
