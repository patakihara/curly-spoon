import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { idParamSchema, itemEpisodeParamSchema, syncBodySchema } from './schemas.js';

export function registerPlaybackRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.post('/items/:id/play', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return;
    try {
      const client = app.abs.forUser(request.userId!);
      reply.send({ session: await client.playItem(params.id) });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  app.post('/items/:itemId/play/:episodeId', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, itemEpisodeParamSchema, request.params);
    if (!params) return;
    try {
      const client = app.abs.forUser(request.userId!);
      reply.send({ session: await client.playEpisode(params.itemId, params.episodeId) });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  app.post('/sessions/:id/sync', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const body = parseInput(reply, syncBodySchema, request.body);
    if (!params || !body) return;
    try {
      const client = app.abs.forUser(request.userId!);
      await client.syncSession(params.id, body);
      reply.send({ ok: true });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  app.post('/sessions/:id/close', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return;
    try {
      const client = app.abs.forUser(request.userId!);
      await client.closeSession(params.id);
      reply.send({ ok: true });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });
}
