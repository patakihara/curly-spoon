import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { idParamSchema } from './schemas.js';

/**
 * An author's own page — proxies Audiobookshelf's `GET /authors/:id?include=items`,
 * which resolves the author's books server-side (see `AbsClient.getAuthor`'s own
 * doc comment for the source trace). Not library-scoped: Audiobookshelf's author
 * ids are global, so there's no `:libraryId` in this route either.
 */
export function registerAuthorRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/authors/:id', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      return reply.send(await client.getAuthor(params.id));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });
}
