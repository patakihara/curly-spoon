import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { getItemQuerySchema, idParamSchema } from './schemas.js';

export function registerItemRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/items/:id', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const query = parseInput(reply, getItemQuerySchema, request.query);
    if (!params || !query) return;
    try {
      const client = app.abs.forUser(request.userId!);
      const item = await client.getItem(params.id, {
        expanded: query.expanded,
        includeProgress: query.include === 'progress',
      });
      reply.send({ item });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });
}
