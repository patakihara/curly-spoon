/**
 * Music request routes. Registered from `routes/index.ts`, same as `registerRequestRoutes`.
 *
 * Search, create, list, approve/reject/retry and grab are here. What is **not**: a status
 * poll. A request does now advance past `downloading` — `musicRequestService.ts` asks
 * Jellyfin to rescan and lands on `importRequested` — but nothing claims `completed`,
 * because Jellyfin's refresh is fire-and-forget with no API to observe it finishing. (An
 * earlier version of this comment said no rescan capability existed at all; it does now.)
 * `remove()` on the provider is likewise unwired: `DELETE
 * /music-requests/:id` below only drops the row, exactly mirroring `routes/requests.ts`'s
 * `DELETE /requests/:id`, which never calls the book download client's `remove` either.
 *
 * Provider configuration (credentials, enable/disable, connection test) lives on the
 * existing `/providers` routes, not here — see `routes/requests.ts`'s `allDescriptors()`,
 * which already lists music providers alongside indexers and download clients.
 */

import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { sendError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import {
  createMusicRequestBodySchema,
  idParamSchema,
  listRequestsQuerySchema,
  musicSearchQuerySchema,
} from './schemas.js';
import { handleRequestError } from './requests.js';
import { deleteRequest, getRequest } from '../db/requestsRepo.js';

export function registerMusicRequestRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  // Must be registered before `/music-requests/:id` — same static-before-parametric
  // reasoning `routes/requests.ts` documents for `/requests/search`.
  app.get('/music-requests/search', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, musicSearchQuerySchema, request.query);
    if (!query) return undefined;
    const outcome = await app.musicRequests.searchMusic({ term: query.term, limit: query.limit });
    return reply.send({ candidates: outcome.candidates, errors: outcome.errors });
  });

  app.get('/music-requests', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, listRequestsQuerySchema, request.query);
    if (!query) return undefined;
    const requests = app.musicRequests.listRequests(query.status);
    return reply.send({ requests });
  });

  app.post('/music-requests', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, createMusicRequestBodySchema, request.body);
    if (!body) return undefined;
    const created = app.musicRequests.createRequest({
      userId: request.userId!,
      candidate: body.candidate,
    });
    return reply.code(201).send({ request: created });
  });

  app.get('/music-requests/:id', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    const found = getRequest(app.db, params.id);
    // A book row 404s here exactly as a nonexistent id would — this is the music route.
    if (!found || found.mediaType !== 'music') {
      sendError(reply, 404, 'not_found', `request "${params.id}" not found`);
      return undefined;
    }
    return reply.send({ request: found });
  });

  app.post(
    '/music-requests/:id/approve',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, idParamSchema, request.params);
      if (!params) return undefined;
      try {
        return reply.send({ request: app.musicRequests.approve(params.id) });
      } catch (err) {
        if (!handleRequestError(reply, err)) throw err;
        return undefined;
      }
    },
  );

  app.post('/music-requests/:id/reject', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      return reply.send({ request: app.musicRequests.reject(params.id) });
    } catch (err) {
      if (!handleRequestError(reply, err)) throw err;
      return undefined;
    }
  });

  // Same "try again" shape as `routes/requests.ts`'s `/requests/:id/retry`: `retry()` alone
  // only resets the status and clears the old failure detail, `grab()` is what actually
  // drives the pipeline, so the user-facing retry is both in sequence.
  app.post('/music-requests/:id/retry', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      app.musicRequests.retry(params.id);
      const grabbed = await app.musicRequests.grab(params.id);
      return reply.send({ request: grabbed });
    } catch (err) {
      if (!handleRequestError(reply, err)) throw err;
      return undefined;
    }
  });

  app.post('/music-requests/:id/grab', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      const grabbed = await app.musicRequests.grab(params.id);
      return reply.send({ request: grabbed });
    } catch (err) {
      if (!handleRequestError(reply, err)) throw err;
      return undefined;
    }
  });

  app.delete('/music-requests/:id', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    const found = getRequest(app.db, params.id);
    if (!found || found.mediaType !== 'music') {
      sendError(reply, 404, 'not_found', `request "${params.id}" not found`);
      return undefined;
    }
    // Row-only delete, deliberately — see this file's header comment.
    deleteRequest(app.db, params.id);
    return reply.code(204).send();
  });
}
