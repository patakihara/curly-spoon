import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { idParamSchema, itemEpisodeParamSchema, syncBodySchema } from './schemas.js';

export function registerPlaybackRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.post('/items/:id/play', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      return reply.send({ session: await client.playItem(params.id) });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.post(
    '/items/:itemId/play/:episodeId',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, itemEpisodeParamSchema, request.params);
      if (!params) return undefined;
      try {
        const client = app.abs.forUser(request.userId!);
        return reply.send({ session: await client.playEpisode(params.itemId, params.episodeId) });
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  app.post('/sessions/:id/sync', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const body = parseInput(reply, syncBodySchema, request.body);
    if (!params || !body) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      await client.syncSession(params.id, body);
      return reply.send({ ok: true });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.post('/sessions/:id/close', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      await client.closeSession(params.id);
      return reply.send({ ok: true });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });
}
