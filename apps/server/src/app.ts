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
import { RateLimiter } from './auth/rateLimit.js';
import { sendError } from './httpErrors.js';
import { registerRoutes } from './routes/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: AppConfig;
    abs: AbsUpstreamFactory;
    loginRateLimiter: RateLimiter;
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
  // 10 attempts/minute/IP: generous for a genuine user mistyping a password a few
  // times, punishing for a credential-stuffing script.
  app.decorate('loginRateLimiter', new RateLimiter({ windowMs: 60_000, max: 10 }));

  void app.register(cookiePlugin);
  // No other origin is wired up yet (the web app isn't part of this phase) — deny
  // cross-origin by default rather than reflecting an arbitrary Origin back.
  void app.register(corsPlugin, { origin: false });

  void app.register(
    async (instance) => {
      registerRoutes(instance);
    },
    { prefix: '/api/v1' },
  );

  app.setNotFoundHandler((_request, reply) => {
    sendError(reply, 404, 'not_found', 'No such route');
  });

  app.setErrorHandler((err: FastifyError, request, reply) => {
    request.log.error({ err }, 'unhandled error');
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const code = status === 500 ? 'internal_error' : (err.code ?? 'error');
    const message = status === 500 ? 'Internal server error' : err.message;
    sendError(reply, status, code, message);
  });

  return app;
}
