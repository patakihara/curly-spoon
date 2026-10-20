/**
 * Browse's shelves (`GET /api/feed`): Up next and the second most recent book and show, from the
 * person's own plays on every device and their Audiobookshelf progress (feed/upNext.ts). It costs
 * one Audiobookshelf `GET /api/me`, and someone not linked to it gets no shelves.
 */
import { getFeed } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { composeFeed } from '../feed/upNext.js';
import { type ListsContext, readerFor } from '../lists/reader.js';
import { serve } from '../route.js';
import { digestQueued, userPlays } from '../store/listening.js';
import { signedIn } from './auth.js';

export function feedRoutes(app: FastifyInstance, context: ListsContext): void {
  serve(app, getFeed, async (request) => {
    const r = await readerFor(context, signedIn(request));
    return {
      shelves: await composeFeed(r, userPlays(r.db, r.userId), digestQueued(r.db, r.userId)),
    };
  });
}
