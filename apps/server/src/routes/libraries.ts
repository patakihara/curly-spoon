import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { idParamSchema, libraryItemsQuerySchema, searchQuerySchema, seriesQuerySchema } from './schemas.js';

export function registerLibraryRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/libraries', { preHandler: requireSession }, async (request, reply) => {
    try {
      const client = app.abs.forUser(request.userId!);
      reply.send({ libraries: await client.getLibraries() });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  app.get('/libraries/:id/home', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return;
    try {
      const client = app.abs.forUser(request.userId!);
      reply.send({ shelves: await client.getLibraryHome(params.id) });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  app.get('/libraries/:id/items', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const query = parseInput(reply, libraryItemsQuerySchema, request.query);
    if (!params || !query) return;
    try {
      const client = app.abs.forUser(request.userId!);
      reply.send(await client.getLibraryItems(params.id, query));
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  app.get('/libraries/:id/series', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const query = parseInput(reply, seriesQuerySchema, request.query);
    if (!params || !query) return;
    try {
      const client = app.abs.forUser(request.userId!);
      reply.send(await client.getLibrarySeries(params.id, query));
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  app.get('/libraries/:id/search', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const query = parseInput(reply, searchQuerySchema, request.query);
    if (!params || !query) return;
    try {
      const client = app.abs.forUser(request.userId!);
      reply.send(await client.searchLibrary(params.id, query.q, query.limit));
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });
}
