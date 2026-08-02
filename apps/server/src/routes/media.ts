/**
 * Proxied binary endpoints. Audiobookshelf (the fake included) already implements
 * correct HTTP Range semantics on `/api/items/:id/file/:fileId` — this route's whole
 * job is to forward the client's `Range` header down and forward upstream's status,
 * headers and body straight back up, without buffering the file in memory. That's
 * what makes seeking inside a 20-hour audiobook viable.
 */

import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { coverQuerySchema, itemIdParamSchema, mediaTrackParamSchema } from './schemas.js';

const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

function copyHeaders(reply: FastifyReply, upstream: Response): void {
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) reply.header(name, value);
  }
}

export function registerMediaRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/media/:itemId/cover', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, itemIdParamSchema, request.params);
    const query = parseInput(reply, coverQuerySchema, request.query);
    if (!params || !query) return;

    try {
      const client = app.abs.forUser(request.userId!);
      const upstream = await client.fetchCover(params.itemId, query);
      reply.code(upstream.status);
      copyHeaders(reply, upstream);
      // Cover art is content-addressed by item id + transform params, so it's safe to
      // cache aggressively — this is the "cache headers" half of the proxy requirement.
      reply.header('Cache-Control', 'public, max-age=86400, immutable');
      reply.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });

  async function proxyAudioTrack(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = parseInput(reply, mediaTrackParamSchema, request.params);
    if (!params) return;

    try {
      const client = app.abs.forUser(request.userId!);
      const range = request.headers.range;
      const upstream = await client.fetchAudioTrack(params.itemId, params.fileId, range);

      reply.code(upstream.status);
      copyHeaders(reply, upstream);

      if (request.method === 'HEAD' || upstream.body === null) {
        reply.send();
        return;
      }

      reply.send(Readable.fromWeb(upstream.body));
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  }

  // Fastify auto-exposes a HEAD route for every GET (exposeHeadRoutes, on by default)
  // that runs this same handler and then discards the body — `request.method` still
  // reports 'HEAD' inside it, which is what the body-vs-headers-only branch checks.
  app.get('/media/:itemId/track/:fileId', { preHandler: requireSession }, proxyAudioTrack);
}
