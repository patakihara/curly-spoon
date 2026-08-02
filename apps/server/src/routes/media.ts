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
    if (!params || !query) return undefined;

    try {
      const client = app.abs.forUser(request.userId!);
      const upstream = await client.fetchCover(params.itemId, query);
      reply.code(upstream.status);
      copyHeaders(reply, upstream);
      // Cover art is content-addressed by item id + transform params, so it's safe to
      // cache aggressively — this is the "cache headers" half of the proxy requirement.
      reply.header('Cache-Control', 'public, max-age=86400, immutable');
      // Returning `reply` (rather than just calling `.send()`) matters here: Fastify's
      // async-handler wrapper otherwise finalises the response as soon as this function's
      // promise resolves, which can race the payload being written — see the identical
      // `return reply.send(...)` below, which is load-bearing for the streamed case.
      return reply.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  async function proxyAudioTrack(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> {
    const params = parseInput(reply, mediaTrackParamSchema, request.params);
    if (!params) return undefined;

    try {
      const client = app.abs.forUser(request.userId!);
      const range = request.headers.range;
      const upstream = await client.fetchAudioTrack(params.itemId, params.fileId, range);

      reply.code(upstream.status);
      copyHeaders(reply, upstream);

      if (request.method === 'HEAD' || upstream.body === null) {
        return reply.send();
      }

      // Streamed, not buffered: this is the part that makes seeking inside a
      // 20-hour audiobook practical rather than pulling the whole file into memory.
      return reply.send(Readable.fromWeb(upstream.body));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  }

  // Registered explicitly rather than relying on Fastify's auto-exposed HEAD-for-GET:
  // that auto route recomputes Content-Length from the (necessarily empty) body it
  // sends, zeroing out the very header a HEAD request exists to report. Our own HEAD
  // route reuses the GET handler — `request.method` inside it still reports 'HEAD',
  // which is what the body-vs-headers-only branch above checks.
  const trackRouteOptions = { preHandler: requireSession, exposeHeadRoute: false } as const;
  app.get('/media/:itemId/track/:fileId', trackRouteOptions, proxyAudioTrack);
  app.head('/media/:itemId/track/:fileId', trackRouteOptions, proxyAudioTrack);
}
