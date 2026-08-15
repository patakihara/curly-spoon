import type { FastifyInstance } from 'fastify';
import type { LibraryItem } from '@auralis/abs-client';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { toCandidate } from '../features/recommendations/adapt.js';
import {
  buildRecommendationShelves,
  buildTasteProfile,
  scoreCandidates,
  type ProgressSignal,
} from '../features/recommendations/index.js';
import {
  idParamSchema,
  libraryItemsQuerySchema,
  searchQuerySchema,
  seriesQuerySchema,
} from './schemas.js';

/**
 * Cap on how many of the library's items are pulled in as the recommendation
 * candidate pool. The user's real library is ~231 items today (`docs/setup/MY_SETUP.md`);
 * 300 covers the whole thing with headroom for growth without silently
 * degrading to "recommendations only from the first page" the way a smaller
 * default (e.g. the 25–50 a shelf/browse view would request) would. Well under
 * the BFF's own `libraryItemsQuerySchema` ceiling of 500, so this is a
 * deliberate choice, not the schema's limit leaking through. Revisit if a much
 * larger library shows this pass being slow — nothing here paginates further.
 */
const RECOMMENDATION_CANDIDATE_LIMIT = 300;

/** Bounds passed to `buildRecommendationShelves` — matches the sizes
 * `shelves.test.ts` exercises; no existing convention elsewhere in the route
 * layer to inherit (`getLibraryHome` just passes Audiobookshelf's own shelves
 * through unchanged). 5 shelves keeps the appended "for you" section from
 * dwarfing the rest of the home feed; 10 items per shelf matches a normal
 * carousel width. */
const MAX_SHELVES = 5;
const ITEMS_PER_SHELF = 10;

/** The `Shelf.type` this route stamps on every shelf it returns, distinguishing
 * these from Audiobookshelf's own personalized shelves (whose `type` values
 * come from ABS itself, e.g. `book`/`series`/`continue-listening`) — nothing
 * downstream branches on it today, but a distinct constant means one can
 * later without re-deriving what "ours" looks like. */
const RECOMMENDATION_SHELF_TYPE = 'recommended';

export function registerLibraryRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/libraries', { preHandler: requireSession }, async (request, reply) => {
    try {
      const client = app.abs.forUser(request.userId!);
      return reply.send({ libraries: await client.getLibraries() });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/libraries/:id/home', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      return reply.send({ shelves: await client.getLibraryHome(params.id) });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/libraries/:id/recommended', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      const [me, pool] = await Promise.all([
        client.getMe(),
        client.getLibraryItems(params.id, { limit: RECOMMENDATION_CANDIDATE_LIMIT }),
      ]);

      const poolIds = new Set(pool.items.map((item) => item.id));
      const signals: ProgressSignal[] = me.mediaProgress
        .filter((p) => poolIds.has(p.libraryItemId))
        .map((p) => ({
          itemId: p.libraryItemId,
          progress: p.progress,
          isFinished: p.isFinished,
          // `lastUpdate` is refreshed by every progress sync, so it's the
          // freshest signal of "when did this activity happen"; `finishedAt`
          // is set once and never touched again, so it's the fallback rather
          // than the primary. Both absent (never synced, e.g. a
          // manually-marked-finished item) maps to `null`, which
          // `buildTasteProfile` already treats as maximally stale — the safe
          // default, not a crash.
          lastActivityAt: p.lastUpdate ?? p.finishedAt ?? null,
        }));

      const candidates = pool.items.map(toCandidate);
      const now = Date.now();
      const profile = buildTasteProfile(signals, candidates, { now });
      const scored = scoreCandidates(profile, candidates);
      const shelves = buildRecommendationShelves(profile, scored, candidates, {
        maxShelves: MAX_SHELVES,
        itemsPerShelf: ITEMS_PER_SHELF,
      });

      const itemsById = new Map<string, LibraryItem>(pool.items.map((item) => [item.id, item]));
      const responseShelves = shelves.map((shelf) => ({
        id: shelf.id,
        label: shelf.label,
        type: RECOMMENDATION_SHELF_TYPE,
        reason: shelf.reason,
        items: shelf.itemIds
          .map((id) => itemsById.get(id))
          .filter((item): item is LibraryItem => item !== undefined),
      }));

      return reply.send({ shelves: responseShelves });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/libraries/:id/items', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const query = parseInput(reply, libraryItemsQuerySchema, request.query);
    if (!params || !query) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      return reply.send(await client.getLibraryItems(params.id, query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/libraries/:id/series', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const query = parseInput(reply, seriesQuerySchema, request.query);
    if (!params || !query) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      return reply.send(await client.getLibrarySeries(params.id, query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/libraries/:id/search', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const query = parseInput(reply, searchQuerySchema, request.query);
    if (!params || !query) return undefined;
    try {
      const client = app.abs.forUser(request.userId!);
      return reply.send(await client.searchLibrary(params.id, query.q, query.limit));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });
}
