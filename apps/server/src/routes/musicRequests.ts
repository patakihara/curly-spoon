/**
 * Music request routes — currently **search only**. Registered from `routes/index.ts`,
 * same as `registerRequestRoutes`.
 *
 * `POST /music-requests` (create) and `GET /music-requests` (list) are not here, and that
 * is a deliberate, reported gap for this wave, not an oversight — see
 * `requests/musicRequestService.ts`'s file comment for the full reasoning: persisting a
 * music request needs a way to tell it apart from a book request in the `requests` table,
 * and nothing in the current schema does that. `apps/server/src/db/**` is off-limits for
 * this wave, so that migration is left for whoever picks up persisted create/list next.
 * Provider configuration (credentials, enable/disable, connection test) does **not** have
 * this problem — see `routes/requests.ts`'s `allDescriptors()`, which already lists music
 * providers alongside indexers and download clients on the existing `/providers` routes.
 */

import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { parseInput } from '../validation.js';
import { musicSearchQuerySchema } from './schemas.js';

export function registerMusicRequestRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/music-requests/search', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, musicSearchQuerySchema, request.query);
    if (!query) return undefined;
    const outcome = await app.musicRequests.searchMusic({ term: query.term, limit: query.limit });
    return reply.send({ candidates: outcome.candidates, errors: outcome.errors });
  });
}
