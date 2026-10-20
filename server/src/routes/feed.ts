/**
 * Browse's shelves (`GET /api/feed`): Up next and the second most recent book and show, from the
 * person's own plays on every device and their Audiobookshelf progress (feed/upNext.ts). It costs
 * one Audiobookshelf `GET /api/me`: any failure of it answers 502 `upstream_failed`, and someone
 * not linked to it gets no shelves.
 */
import { getFeed } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { composeFeed } from '../feed/upNext.js';
import { type ListsContext, readerFor } from '../lists/reader.js';
import { Refusal, serve } from '../route.js';
import { digestQueued, userPlays } from '../store/listening.js';
import { signedIn } from './auth.js';

export function feedRoutes(app: FastifyInstance, context: ListsContext): void {
  serve(app, getFeed, async (request) => {
    const r = await readerFor(context, signedIn(request)).catch((error: unknown) => {
      // Audiobookshelf not finding the person's `GET /api/me` is its failure, not a missing feed.
      if (error instanceof Refusal && error.status === 404) {
        throw new Refusal(502, 'upstream_failed');
      }
      throw error;
    });
    return {
      shelves: await composeFeed(r, userPlays(r.db, r.userId), digestQueued(r.db, r.userId)),
    };
  });
}
