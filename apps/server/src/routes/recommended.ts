/**
 * `GET /recommended` — the cross-medium "For You" feed, wave 15c-2-S.
 *
 * Every existing recommendation route (`/libraries/:id/recommended`,
 * `/music/recommended`) scopes its candidate pool to exactly one `media.kind`
 * (a library is books-only or podcasts-only; the music route is albums-only), so
 * `shelves.ts`'s mixed-shelf mechanism (`itemLabels`, populated only when a shelf's
 * `itemIds` span more than one kind — see that file's `typeLabelsFor`) has never had
 * a pool wide enough to fire. `docs/USER_DECISIONS.md` decision 2 requires mixed
 * carousels ("Spotify is the reference"); this route is the first caller that can
 * actually produce one.
 *
 * **Mechanism, not new ranking.** This route adds no scoring logic. It assembles one
 * candidate pool spanning `book`/`podcast` (via Audiobookshelf) and `album` (via
 * Jellyfin), then calls `buildRecommendationShelves` exactly once over the union —
 * calling it per medium and merging afterwards would defeat both the dedupe-by-parent
 * rule and the mixed-label rule, which only see candidates that were scored together.
 *
 * **The reader of this route is client wave `15c-2-W`/`15c-2-A`, not yet built.**
 * This wave is server-only; no web or Android file is touched here.
 *
 * **Degradation is the hard requirement.** Audiobookshelf and Jellyfin are each
 * optional and independently reachable, so either may be unconfigured, have no
 * stored credential for this user, or fail on the network — and this route must
 * never 500 because of it. `tryBuildAbsPool`/`tryBuildJellyfinPool` each degrade to
 * `null` on any failure, following the exact pattern `routes/libraries.ts`'s
 * `tryBuildMusicGenreProfile` already established: a *configuration* error
 * (not connected, no credential) is silent — a household that has never connected
 * one upstream hits it on every request, so logging it would be pure noise — while
 * anything else (a network failure, an upstream shape change, a real bug) is logged
 * at `warn`, because that failure mode is otherwise invisible forever
 * (`docs/HANDOVER.md`'s four writer-with-no-reader / silently-broken-provider
 * findings are the reason this project treats "degrades silently" and "degrades
 * undiagnosably" as two different things).
 */
import type { FastifyInstance } from 'fastify';
import type { Album } from '@auralis/jellyfin-client';
import type { LibraryItem } from '@auralis/abs-client';
import { createRequireSession } from '../auth/requireSession.js';
import { NoCredentialsError, NotConfiguredError } from '../absUpstream.js';
import { JellyfinNoCredentialsError, JellyfinNotConfiguredError } from '../jellyfinUpstream.js';
import { toCandidate } from '../features/recommendations/adapt.js';
import {
  albumToCandidate,
  buildMusicProgressSignals,
  buildRecommendationShelves,
  buildTasteProfile,
  scoreCandidates,
  type ProgressSignal,
  type RecommendationCandidate,
} from '../features/recommendations/index.js';

/**
 * Total Audiobookshelf candidates across every one of the user's libraries — deliberately
 * the same 300 `routes/libraries.ts`'s `RECOMMENDATION_CANDIDATE_LIMIT` uses for a single
 * library, not a new number invented for this route. Applied as a hard cap on the
 * concatenated pool (via `.slice`, after fetching every library's items in parallel),
 * not a per-library budget — a household with many small libraries should not get a
 * *larger* combined pool than one with a single big one; the point is bounding total
 * upstream work, not being fair across libraries.
 */
const ABS_CANDIDATE_LIMIT = 300;

/** Same caps `routes/libraries.ts`'s `tryBuildMusicGenreProfile` and `routes/jellyfin.ts`'s
 * `/music/recommended` route both already use for the identical Jellyfin fetch —
 * duplicated as constants rather than imported, matching those two files' own convention
 * ("a small independent fetch, not a shared code path"). */
const MUSIC_ALBUM_LIMIT = 500;
const MUSIC_TRACK_LIMIT = 5000;

const MAX_SHELVES = 5;
const ITEMS_PER_SHELF = 10;

/**
 * Namespace prefixes for candidate/signal ids, wave 15c-2-S-2.
 *
 * `shelves.ts` keys `candidatesById`, its `used` set and `itemLabels` by a bare
 * `RecommendationCandidate.id` — and Audiobookshelf ids and Jellyfin ids come from two
 * independent systems with no cross-namespace uniqueness guarantee. Without a prefix, a
 * collision would let the last-written pool silently shadow the other in every map this
 * route (and `shelves.ts`) keys by id, while `toMixedItem` below still resolved that id
 * Audiobookshelf-first — so a colliding Jellyfin album could render with a book's title
 * and cover, labelled `"Album"`, with the book unreachable.
 *
 * Every id this route hands to the scoring core (`RecommendationCandidate.id` *and*
 * `ProgressSignal.itemId` — `profile.ts`'s `itemsById`/`knownItemIds` match the two
 * against each other, so both must carry the same namespacing or the match breaks) is
 * prefixed by `namespaceAbsId`/`namespaceJellyfinId` before it reaches
 * `buildTasteProfile`/`scoreCandidates`/`buildRecommendationShelves`, and stripped back
 * off by `toMixedItem`/`stripNamespace` before anything reaches the wire — so the
 * response's `items[].id` is the original upstream id, unchanged from what ships today.
 * No client consumes this route yet, so this is free to fix now and a breaking change
 * later.
 */
const ABS_ID_PREFIX = 'abs:';
const JELLYFIN_ID_PREFIX = 'jf:';

function namespaceAbsId(id: string): string {
  return `${ABS_ID_PREFIX}${id}`;
}

function namespaceJellyfinId(id: string): string {
  return `${JELLYFIN_ID_PREFIX}${id}`;
}

/** Strips whichever namespace prefix `id` carries, for re-keying `itemLabels` back to
 * the bare upstream ids the response's `items[].id` values use. Falls through
 * unchanged if neither prefix matches, which should not happen — every key this route
 * ever puts in `itemLabels` came from a candidate this route itself namespaced. */
function stripNamespace(id: string): string {
  if (id.startsWith(ABS_ID_PREFIX)) return id.slice(ABS_ID_PREFIX.length);
  if (id.startsWith(JELLYFIN_ID_PREFIX)) return id.slice(JELLYFIN_ID_PREFIX.length);
  return id;
}

/** Matches `routes/libraries.ts`'s and `routes/jellyfin.ts`'s own `*_RECOMMENDATION_SHELF_TYPE`
 * — nothing downstream branches on it today, kept for the same forward-looking reason those
 * two name it explicitly rather than inlining the string. */
const MIXED_RECOMMENDATION_SHELF_TYPE = 'recommended';

/** The three media kinds this route's pool can contain — mirrors
 * `RecommendationCandidate['media']['kind']`, restated here because this file's own
 * response type (`MixedRecommendedItem`) is deliberately not `RecommendationCandidate`
 * (that shape is the scoring core's internal candidate, not a renderable card). */
type MixedItemKind = 'book' | 'podcast' | 'album';

/**
 * One card in a mixed shelf — deliberately narrower than either existing per-medium item
 * type (`RecommendedLibraryItem` in `routes/libraries.ts`, `MusicRecommendedAlbum` in
 * `routes/jellyfin.ts`), because a mixed shelf's `items[]` can be neither: Android's
 * `RecommendedLibraryItem` mirror carries ABS-only fields (`libraryId`, `media`,
 * `progress`), and `MusicRecommendedAlbum` carries Jellyfin-only fields (`trackCount`,
 * `favorite`). What survives is what a carousel card actually renders.
 *
 * **Nullability, field by field** — every field is either always-sent-non-null or
 * explicitly nullable; none is ever *absent*, matching the guarantee
 * `RecommendedLibraryItem`/`MusicRecommendedAlbum` already give (their own doc comments
 * name why: Android's kotlinx models declare fields non-nullable with no default and
 * throw `MissingFieldException` on a missing key, on a device nobody here can test).
 *
 * - `kind` — always present; the discriminator a client needs to render the right card
 *   chrome and to know which of `coverPath`/`imageTag` is meaningful.
 * - `id` — always present; opaque, and only unique *within* `kind`'s own upstream
 *   namespace (an Audiobookshelf item id and a Jellyfin item id are generated by two
 *   independent systems with no cross-namespace uniqueness guarantee — `kind` is what
 *   disambiguates two different-origin ids that happen to collide, not a claim that
 *   collision is impossible).
 * - `title` — always present; every kind's underlying type guarantees a non-null title.
 * - `subtitle` — nullable: a book's authors joined (`null` if none), a podcast's flat
 *   `author` (already `string | null` on the source type), an album's `artistName`
 *   (same). Never fabricated when the source has nothing to say.
 * - `coverPath` — nullable, meaningful only when `kind` is `'book'` or `'podcast'`
 *   (Audiobookshelf's own `LibraryItem.coverPath`); `null` for an album.
 * - `imageTag` — nullable, meaningful only when `kind` is `'album'` (Jellyfin's own
 *   `Album.imageTag`); `null` for a book or podcast. **Two nullable fields rather than
 *   one normalized "image ref" field** — the two upstreams resolve a cover through
 *   different URL shapes (an Audiobookshelf item-id-keyed cover route vs. a Jellyfin
 *   album-id-plus-tag image route), so a single opaque field would still require the
 *   client to branch on `kind` to know which URL builder to call; keeping the two
 *   existing per-medium field names is zero new vocabulary for a client that already
 *   knows both from `RecommendedLibraryItem`/`MusicRecommendedAlbum`.
 * - `availability` — always `'owned'` in this wave's response: every candidate in this
 *   route's pool comes from the user's own real Audiobookshelf/Jellyfin libraries (see
 *   this file's header comment — no external-discovery provider is mixed in here).
 *   Still typed as the full `'owned' | 'external'` union the two existing routes use,
 *   both so a client can share one type/rendering branch across all three recommendation
 *   responses, and so a future wave adding external discovery to this route is additive
 *   rather than a breaking field-type change.
 */
interface MixedRecommendedItem {
  kind: MixedItemKind;
  id: string;
  title: string;
  subtitle: string | null;
  coverPath: string | null;
  imageTag: string | null;
  availability: 'owned' | 'external';
}

interface AbsPool {
  candidates: RecommendationCandidate[];
  signals: ProgressSignal[];
  itemsById: Map<string, LibraryItem>;
}

interface JellyfinPool {
  candidates: RecommendationCandidate[];
  signals: ProgressSignal[];
  albumsById: Map<string, Album>;
}

/**
 * Best-effort Audiobookshelf half of the pool: every library's items (bounded by
 * `ABS_CANDIDATE_LIMIT` total), adapted via the same `toCandidate` the single-library
 * `/libraries/:id/recommended` route uses, plus progress signals from `getMe()` filtered
 * to the pool actually fetched — same shape `routes/libraries.ts`'s own recommended-route
 * handler already builds, generalized from one library to every library the user has.
 *
 * Returns `null` on `NotConfiguredError`/`NoCredentialsError` (not a fault — see this
 * file's header comment) or on any other failure (logged at `warn`, since that case is
 * otherwise invisible). Never throws.
 */
async function tryBuildAbsPool(app: FastifyInstance, userId: string): Promise<AbsPool | null> {
  try {
    const client = app.abs.forUser(userId);
    const [me, libraries] = await Promise.all([client.getMe(), client.getLibraries()]);

    const pages = await Promise.all(
      libraries.map((library) =>
        client.getLibraryItems(library.id, { limit: ABS_CANDIDATE_LIMIT }),
      ),
    );
    const items = pages.flatMap((page) => page.items).slice(0, ABS_CANDIDATE_LIMIT);

    // Keyed by the bare upstream id — `toMixedItem` looks items up here *after*
    // stripping the namespace prefix back off, so this map is deliberately not
    // re-keyed to match the namespaced candidate/signal ids below.
    const itemsById = new Map<string, LibraryItem>(items.map((item) => [item.id, item]));
    const signals: ProgressSignal[] = me.mediaProgress
      .filter((p) => itemsById.has(p.libraryItemId))
      .map((p) => ({
        // Namespaced to match `candidates` below — `profile.ts`'s `buildTasteProfile`
        // matches `signal.itemId` against `RecommendationCandidate.id` directly, so the
        // two must carry identical ids, prefix included.
        itemId: namespaceAbsId(p.libraryItemId),
        progress: p.progress,
        isFinished: p.isFinished,
        // Same fallback chain `routes/libraries.ts`'s own recommended-route handler
        // uses: `lastUpdate` is refreshed by every progress sync so it's the freshest
        // "when did this happen" signal; `finishedAt` is set once and never touched
        // again, so it's the fallback; both absent maps to `null`, which
        // `buildTasteProfile` already treats as maximally stale.
        lastActivityAt: p.lastUpdate ?? p.finishedAt ?? null,
      }));

    const candidates = items
      .map(toCandidate)
      .map((candidate) => ({ ...candidate, id: namespaceAbsId(candidate.id) }));

    return { candidates, signals, itemsById };
  } catch (err) {
    if (err instanceof NotConfiguredError || err instanceof NoCredentialsError) {
      return null;
    }
    app.log.warn(
      { err },
      'recommended: Audiobookshelf candidate pool failed, degrading to Jellyfin-only shelves',
    );
    return null;
  }
}

/**
 * Best-effort Jellyfin half of the pool: every album plus enough tracks to derive
 * play-based progress signals, adapted via the exact `albumToCandidate`/
 * `buildMusicProgressSignals` pair `routes/jellyfin.ts`'s `/music/recommended` route
 * already uses. Returns `null` on `JellyfinNotConfiguredError`/
 * `JellyfinNoCredentialsError` (not a fault) or on any other failure (logged at `warn`).
 * Never throws.
 */
async function tryBuildJellyfinPool(
  app: FastifyInstance,
  userId: string,
): Promise<JellyfinPool | null> {
  try {
    const client = app.jellyfin.forUser(userId);
    const [albumsPage, tracksPage] = await Promise.all([
      client.getAlbums({ limit: MUSIC_ALBUM_LIMIT }),
      client.getTracks({ limit: MUSIC_TRACK_LIMIT }),
    ]);

    // Keyed by the bare upstream id, same reasoning as `tryBuildAbsPool`'s `itemsById`.
    const albumsById = new Map<string, Album>(albumsPage.items.map((a) => [a.id, a]));
    const candidates = albumsPage.items
      .map(albumToCandidate)
      .map((candidate) => ({ ...candidate, id: namespaceJellyfinId(candidate.id) }));
    // Namespaced to match `candidates` — same `profile.ts` matching reasoning as the
    // Audiobookshelf pool's signals above.
    const signals = buildMusicProgressSignals(tracksPage.items).map((signal) => ({
      ...signal,
      itemId: namespaceJellyfinId(signal.itemId),
    }));

    return { candidates, signals, albumsById };
  } catch (err) {
    if (err instanceof JellyfinNotConfiguredError || err instanceof JellyfinNoCredentialsError) {
      return null;
    }
    app.log.warn(
      { err },
      'recommended: Jellyfin candidate pool failed, degrading to Audiobookshelf-only shelves',
    );
    return null;
  }
}

/**
 * Resolves one shelf `itemId` back to a renderable card. `id` arrives namespaced (see
 * `namespaceAbsId`/`namespaceJellyfinId` above) — the prefix says which pool produced it,
 * so this routes to the matching map directly rather than probing both, and strips the
 * prefix before returning: every `id` in the response is the bare upstream id, matching
 * what ships today. Returns `null` only if the matching pool's map doesn't recognize the
 * bare id, which should not happen: every namespaced `itemId` a shelf can contain
 * originates from the `candidates` array both pools fed into `buildRecommendationShelves`.
 */
function toMixedItem(
  id: string,
  absItemsById: Map<string, LibraryItem> | undefined,
  albumsById: Map<string, Album> | undefined,
): MixedRecommendedItem | null {
  if (id.startsWith(ABS_ID_PREFIX)) {
    const absItem = absItemsById?.get(id.slice(ABS_ID_PREFIX.length));
    if (!absItem) return null;
    if (absItem.media.kind === 'book') {
      const authorNames = absItem.media.authors
        .map((a) => a.name)
        .filter((name) => name.trim().length > 0);
      return {
        kind: 'book',
        id: absItem.id,
        title: absItem.media.title,
        subtitle: authorNames.length > 0 ? authorNames.join(', ') : null,
        coverPath: absItem.coverPath,
        imageTag: null,
        availability: 'owned',
      };
    }
    return {
      kind: 'podcast',
      id: absItem.id,
      title: absItem.media.title,
      subtitle: absItem.media.author,
      coverPath: absItem.coverPath,
      imageTag: null,
      availability: 'owned',
    };
  }

  if (id.startsWith(JELLYFIN_ID_PREFIX)) {
    const album = albumsById?.get(id.slice(JELLYFIN_ID_PREFIX.length));
    if (!album) return null;
    return {
      kind: 'album',
      id: album.id,
      title: album.name,
      subtitle: album.artistName,
      coverPath: null,
      imageTag: album.imageTag,
      availability: 'owned',
    };
  }

  return null;
}

export function registerRecommendedRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  app.get('/recommended', { preHandler: requireSession }, async (request, reply) => {
    const userId = request.userId!;

    // Both upstreams are independently optional — fetched in parallel, each degrading
    // to `null` internally rather than throwing, so neither's absence blocks the other.
    const [absPool, jellyfinPool] = await Promise.all([
      tryBuildAbsPool(app, userId),
      tryBuildJellyfinPool(app, userId),
    ]);

    // One union pool, scored and shelved once — see this file's header comment for why
    // per-medium shelving-then-merging would defeat the dedupe/mixed-label rules.
    const candidates: RecommendationCandidate[] = [
      ...(absPool?.candidates ?? []),
      ...(jellyfinPool?.candidates ?? []),
    ];
    const signals: ProgressSignal[] = [
      ...(absPool?.signals ?? []),
      ...(jellyfinPool?.signals ?? []),
    ];

    const now = Date.now();
    const profile = buildTasteProfile(signals, candidates, { now });
    const scored = scoreCandidates(profile, candidates);
    const shelves = buildRecommendationShelves(profile, scored, candidates, {
      maxShelves: MAX_SHELVES,
      itemsPerShelf: ITEMS_PER_SHELF,
    });

    const responseShelves = shelves.map((shelf) => {
      // `shelf.itemLabels` (when present) is keyed by the *namespaced* candidate id —
      // see this file's namespacing header comment. Re-key to the bare upstream id
      // before serializing, or the keys match no `items[].id` this route actually sends
      // (the trap this wave exists to close: prefixing without also stripping here
      // would silently disable `itemLabels` for every mixed shelf).
      const itemLabels = shelf.itemLabels
        ? Object.fromEntries(
            Object.entries(shelf.itemLabels).map(([id, label]) => [stripNamespace(id), label]),
          )
        : undefined;

      return {
        id: shelf.id,
        label: shelf.label,
        type: MIXED_RECOMMENDATION_SHELF_TYPE,
        reason: shelf.reason,
        // Only set when `shelves.ts`'s `typeLabelsFor` populated it (a shelf spanning
        // more than one kind) — omitted, not sent as `null`, for a single-kind shelf, the
        // same "absent means not applicable" contract `RecommendationShelf.itemLabels`'s
        // own doc comment already promises.
        ...(itemLabels ? { itemLabels } : {}),
        items: shelf.itemIds
          .map((id) => toMixedItem(id, absPool?.itemsById, jellyfinPool?.albumsById))
          .filter((item): item is MixedRecommendedItem => item !== null),
      };
    });

    return reply.send({ shelves: responseShelves });
  });
}
