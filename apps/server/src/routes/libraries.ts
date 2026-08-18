import type { FastifyInstance } from 'fastify';
import type { LibraryItem } from '@auralis/abs-client';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError } from '../httpErrors.js';
import { JellyfinNoCredentialsError, JellyfinNotConfiguredError } from '../jellyfinUpstream.js';
import { parseInput } from '../validation.js';
import { toCandidate } from '../features/recommendations/adapt.js';
import {
  albumToCandidate,
  bookLibraryItemToOwnershipLibraryItem,
  buildMusicProgressSignals,
  buildRecommendationShelves,
  buildTasteProfile,
  externalCandidateToLibraryItemPlaceholder,
  externalCandidateToOwnershipItem,
  externalProviderFactories,
  getExternalProvidersForMedium,
  matchOwnership,
  mergeGenreAffinity,
  reasonForBookExternalShelf,
  scoreCandidates,
  type ExternalProviderFactory,
  type ProgressSignal,
  type RecommendationSeed,
  type TasteProfile,
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

/**
 * Wave 15e-books: external (Open Library) discovery — same shape and same reasoning as
 * `routes/jellyfin.ts`'s `MUSIC_EXTERNAL_*` constants for `GET /music/recommended`. See
 * `openlibrary.ts`'s header comment for why the candidate catalogue is Open Library rather
 * than Audnexus, and `bookExternalDiscovery.ts` for the book-specific adaptation.
 */
const BOOK_EXTERNAL_SEED_LIMIT = 3;
/** Requested from the provider before ownership filtering — deliberately larger than the
 * shelf's own `BOOK_EXTERNAL_ITEMS_PER_SHELF` cap, so filtering out already-owned titles by
 * a loved author still usually leaves enough to fill a real shelf. Matches
 * `routes/jellyfin.ts`'s `MUSIC_EXTERNAL_CANDIDATE_LIMIT` reasoning exactly. */
const BOOK_EXTERNAL_CANDIDATE_LIMIT = 30;
const BOOK_EXTERNAL_ITEMS_PER_SHELF = 10;
const BOOK_EXTERNAL_SHELF_ID = 'shelf-external-openlibrary';
/** Deliberately distinct from `RECOMMENDATION_SHELF_TYPE` — same reasoning
 * `routes/jellyfin.ts`'s `MUSIC_EXTERNAL_SHELF_TYPE` doc comment gives: this shelf's items
 * are not real Audiobookshelf library items, and a future client change may want to treat
 * "recommended" (rank items already owned) and "discover" (surface items not owned)
 * differently. Neither client reads `type` today, so this is forward-looking. */
const BOOK_EXTERNAL_SHELF_TYPE = 'discover';

/**
 * Wave 15e-books: every item `GET /libraries/:id/recommended` returns now carries this,
 * required and never optional — the identical contract `routes/jellyfin.ts`'s
 * `MusicRecommendedAlbum` documents for `GET /music/recommended` (Android's Kotlin models
 * declare fields non-nullable with no default and throw `MissingFieldException` on a
 * missing key; `ignoreUnknownKeys = true` makes adding a field safe for existing clients).
 * A route-scoped type, not a widening of `@auralis/abs-client`'s `LibraryItem` — that
 * package's consumers (Android's own mirrored models, this route's own real-item fetches)
 * must not gain a field neither sends, the same reasoning `15d-1-S` used for
 * `MusicRecommendedAlbum`.
 */
type RecommendedLibraryItem = LibraryItem & { availability: 'owned' | 'external' };

/**
 * The reader wave 15a/15b-1 were both missing for books, closing the sixth-then-seventh
 * writer-with-no-reader this project has shipped (`docs/HANDOVER.md`). Resolves seeds from
 * the real taste profile the route already computed, queries every registered book provider
 * (today, just Open Library), filters out anything the book-ownership pool says she already
 * has, and returns a shelf shaped exactly like the library-derived ones below — or `null`,
 * meaning "no external shelf this response", never an empty/malformed one.
 *
 * Unlike `routes/jellyfin.ts`'s music equivalent, no identifier-chain resolution is needed:
 * a book's author name (the profile's own facet key) is exactly what `openlibrary.ts` wants
 * to query — see that file's header comment for why. `pool` is the same `LibraryItem[]` the
 * route already fetched for its library-derived shelves, filtered to books.
 *
 * `providerFactories` defaults to the real registry and exists as a parameter for the same
 * reason `routes/jellyfin.ts`'s `buildExternalDiscoveryShelf` takes one: so a test can hand
 * in a provider that deliberately violates the "never throws" contract
 * `ExternalRecommendationProvider` documents, and exercise this function's outer `catch`
 * without needing a real provider to misbehave.
 */
export async function buildBookExternalDiscoveryShelf(
  app: FastifyInstance,
  profile: TasteProfile,
  pool: { items: LibraryItem[] },
  libraryId: string,
  providerFactories: Record<string, ExternalProviderFactory> = externalProviderFactories,
): Promise<{
  id: string;
  label: string;
  type: string;
  reason: string;
  items: RecommendedLibraryItem[];
} | null> {
  const authorWeights = Object.entries(profile.affinities.author ?? {}).sort((a, b) => b[1] - a[1]);
  const seeds: RecommendationSeed[] = [];
  for (const [authorName] of authorWeights) {
    if (seeds.length >= BOOK_EXTERNAL_SEED_LIMIT) break;
    if (authorName.trim().length === 0) continue;
    seeds.push({ label: authorName, identifiers: {} });
  }
  if (seeds.length === 0) return null;

  try {
    const providers = getExternalProvidersForMedium(
      'book',
      { fetch: app.upstreamFetch, logger: app.log },
      providerFactories,
    );
    const perProvider = await Promise.all(
      providers.map((provider) => provider.recommend(seeds, BOOK_EXTERNAL_CANDIDATE_LIMIT)),
    );
    const rawCandidates = perProvider.flat();
    if (rawCandidates.length === 0) return null;

    const bookOwnershipPool = pool.items
      .map(bookLibraryItemToOwnershipLibraryItem)
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const newCandidates = rawCandidates.filter(
      (candidate) =>
        matchOwnership(externalCandidateToOwnershipItem(candidate), bookOwnershipPool).status ===
        'new',
    );
    // A one-item carousel reads as a bug — the same rule `shelves.ts`'s
    // `buildRecommendationShelves` already enforces for the library-derived shelves, and
    // `routes/jellyfin.ts`'s music shelf mirrors.
    if (newCandidates.length < 2) return null;

    const chosen = newCandidates.slice(0, BOOK_EXTERNAL_ITEMS_PER_SHELF);
    return {
      id: BOOK_EXTERNAL_SHELF_ID,
      label: 'More books to discover',
      type: BOOK_EXTERNAL_SHELF_TYPE,
      reason: reasonForBookExternalShelf(seeds),
      items: chosen.map((candidate): RecommendedLibraryItem => ({
        ...externalCandidateToLibraryItemPlaceholder(candidate, libraryId),
        availability: 'external',
      })),
    };
  } catch (err) {
    // `ExternalRecommendationProvider.recommend` is contractually total — see that
    // interface's own doc comment: never throws, always degrades to `[]`. This catch exists
    // only against a provider that breaks that contract, mirroring
    // `tryBuildMusicGenreProfile`'s discriminated-logging precedent above and
    // `routes/jellyfin.ts`'s identical outer catch: log at `warn` (a real fault — there is
    // no configured/unconfigured state for a credential-free public API), and always
    // degrade to no external shelf rather than failing the whole route.
    app.log.warn(
      { err },
      'libraries/recommended: external candidate discovery failed, degrading to library-only shelves',
    );
    return null;
  }
}

/** Same caps `routes/jellyfin.ts`'s `/music/recommended` route uses for the same fetch —
 * duplicated as constants (not imported) because that route doesn't export them and this
 * is a small, independent best-effort fetch, not a shared code path. */
const MUSIC_ALBUM_LIMIT = 500;
const MUSIC_TRACK_LIMIT = 5000;

/**
 * Best-effort cross-media genre signal for wave 13e-2's "taste in one medium informs
 * another" requirement (`docs/HANDOVER.md`). Builds a music `TasteProfile` from the
 * user's Jellyfin play history, exactly the way `routes/jellyfin.ts`'s own
 * `/music/recommended` route does, and returns it — or `null` on **any** failure.
 *
 * `null` covers Jellyfin being unconfigured (`JellyfinNotConfiguredError`), this user
 * having no stored Jellyfin credentials (`JellyfinNoCredentialsError`), a network/upstream
 * failure, or genuinely having no music listening history yet (`totalSignal <= 0`, folded
 * in here rather than left for the caller to re-check). The books route must work exactly
 * as it did before this wave when none of that is true — see this function's caller for
 * why `mergeGenreAffinity` is skipped entirely on `null`, not called with an empty
 * profile: `buildTasteProfile([], [], ...)` also has `totalSignal === 0`, but skipping the
 * merge call outright avoids the one extra Jellyfin round-trip on every books-route
 * request for a household that has never connected Jellyfin at all.
 */
async function tryBuildMusicGenreProfile(
  app: FastifyInstance,
  userId: string,
  now: number,
): Promise<TasteProfile | null> {
  try {
    const client = app.jellyfin.forUser(userId);
    const [albumsPage, tracksPage] = await Promise.all([
      client.getAlbums({ limit: MUSIC_ALBUM_LIMIT }),
      client.getTracks({ limit: MUSIC_TRACK_LIMIT }),
    ]);
    const candidates = albumsPage.items.map(albumToCandidate);
    const signals = buildMusicProgressSignals(tracksPage.items);
    const profile = buildTasteProfile(signals, candidates, { now });
    return profile.totalSignal > 0 ? profile : null;
  } catch (err) {
    // Deliberately swallowed — see this function's doc comment. The books route's own
    // Audiobookshelf calls, a few lines below wherever this is awaited, still run and
    // still throw into their own `handleUpstreamError` normally; only this optional
    // enrichment degrades silently.
    //
    // But "degrades silently" must not mean "is undiagnosable". The two configuration
    // errors below are the overwhelmingly common case and are not faults at all — a
    // household that has never connected Jellyfin hits them on every single books-route
    // request, so logging them would be pure noise. **Anything else is a real fault**:
    // a network failure, an upstream shape change, or a genuine bug in `albumToCandidate`
    // or the scoring core. Those produce exactly the same `null` and would otherwise be
    // invisible forever, which is how a broken feature goes on reporting success — the
    // failure mode `docs/HANDOVER.md` records four times over.
    if (err instanceof JellyfinNotConfiguredError || err instanceof JellyfinNoCredentialsError) {
      return null;
    }
    app.log.warn(
      { err },
      'cross-media genre enrichment failed; serving book recommendations without music signal',
    );
    return null;
  }
}

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
      let profile = buildTasteProfile(signals, candidates, { now });
      // Wave 13e-2: fold in cross-media genre affinity from the user's Jellyfin music
      // history, if any exists and Jellyfin is reachable — see
      // `tryBuildMusicGenreProfile`'s doc comment for exactly what "if any" covers and
      // why a failure here must never break this route. Skipped entirely (not merged
      // with an empty profile) when there's nothing to add, so a household that has
      // never touched Jellyfin sees byte-identical output to before this wave.
      const musicProfile = await tryBuildMusicGenreProfile(app, request.userId!, now);
      if (musicProfile) {
        profile = mergeGenreAffinity(profile, musicProfile);
      }
      const scored = scoreCandidates(profile, candidates);
      const shelves = buildRecommendationShelves(profile, scored, candidates, {
        maxShelves: MAX_SHELVES,
        itemsPerShelf: ITEMS_PER_SHELF,
      });

      const itemsById = new Map<string, LibraryItem>(pool.items.map((item) => [item.id, item]));

      // Wave 15e-books: external (Open Library) discovery, ahead of the library-derived
      // shelves — she asked for unowned discovery, not a re-sort of what she already has
      // (`docs/USER_DECISIONS.md`), so when it exists it leads. `null` (no signal, no
      // author facet, or fewer than two unowned candidates) means "not this response",
      // never an empty placeholder shelf. Mirrors `routes/jellyfin.ts`'s identical
      // ordering for `GET /music/recommended`.
      const externalShelf = await buildBookExternalDiscoveryShelf(app, profile, pool, params.id);

      const libraryShelves = shelves.map((shelf) => ({
        id: shelf.id,
        label: shelf.label,
        type: RECOMMENDATION_SHELF_TYPE,
        reason: shelf.reason,
        // Wave 15e-books: every real Audiobookshelf item this route serves is `owned` — see
        // `RecommendedLibraryItem`'s doc comment above `buildBookExternalDiscoveryShelf`.
        items: shelf.itemIds
          .map((id) => itemsById.get(id))
          .filter((item): item is LibraryItem => item !== undefined)
          .map((item): RecommendedLibraryItem => ({ ...item, availability: 'owned' })),
      }));

      const responseShelves = externalShelf ? [externalShelf, ...libraryShelves] : libraryShelves;

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
