/**
 * Podcast discovery routes — search the iTunes-backed directory, preview an RSS feed
 * before subscribing, and subscribe (creating a new Audiobookshelf library item).
 *
 * `POST /podcasts/feed` and `POST /podcasts` are admin-gated upstream (Audiobookshelf
 * 403s a non-admin account); `GET /podcasts/search` is not. See `httpErrors.ts` for how
 * a 403 maps to `upstream_forbidden`, distinct from a 401 `upstream_auth_expired` — a
 * non-admin user tapping "subscribe" must not be logged out as if their session expired.
 */

import type { FastifyInstance } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import {
  previewPodcastFeedBodySchema,
  searchPodcastDirectoryQuerySchema,
  subscribePodcastBodySchema,
} from './schemas.js';

export function registerPodcastRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/podcasts/search', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, searchPodcastDirectoryQuerySchema, request.query);
    if (!query) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      const results = await client.searchPodcastDirectory(query.term, query.country);
      return reply.send({ results });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.post('/podcasts/feed', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, previewPodcastFeedBodySchema, request.body);
    if (!body) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      const preview = await client.previewPodcastFeed(body.rssFeed);
      return reply.send({ preview });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.post('/podcasts', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, subscribePodcastBodySchema, request.body);
    if (!body) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      const item = await client.subscribePodcast(body);
      return reply.code(201).send({ item });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });
}
