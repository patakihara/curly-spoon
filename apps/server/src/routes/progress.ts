import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { itemIdParamSchema, progressQuerySchema, updateProgressBodySchema } from './schemas.js';

export function registerProgressRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/me/progress', { preHandler: requireSession }, async (request, reply) => {
    try {
      const client = app.abs.forUser(request.userId!);
      const me = await client.getMe();
      reply.send({ progress: me.mediaProgress });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  app.patch('/progress/:itemId', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, itemIdParamSchema, request.params);
    const query = parseInput(reply, progressQuerySchema, request.query);
    const body = parseInput(reply, updateProgressBodySchema, request.body);
    if (!params || !query || !body) return;
    try {
      const client = app.abs.forUser(request.userId!);
      const progress = await client.updateProgress(params.itemId, query.episodeId, body);
      reply.send({ progress });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });
}
