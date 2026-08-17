/**
 * Jellyfin music routes — config/login, artist/album/track browsing, search, lyrics, and
 * the two proxied byte endpoints a player needs (stream, artwork). Every route sits behind
 * `requireSession`: unlike Audiobookshelf there is no separate first-run "connect the
 * server" step outside a signed-in Auralis session, so `POST /jellyfin/login` both
 * configures the shared base URL and authenticates the calling user in one call.
 *
 * Security-critical: `JellyfinClient.streamUrl`/`imageUrl` embed the access token as
 * the `ApiKey` query parameter, by that package's own design (see `urls.ts`'s file
 * comment) — those URLs must never reach a browser or an APK. `GET
 * /jellyfin/tracks/:itemId/stream` and `GET /jellyfin/items/:itemId/artwork` build the
 * URL server-side, fetch it themselves via `app.upstreamFetch`, and stream the response
 * back, exactly as `routes/media.ts` proxies Audiobookshelf. See `fetchJellyfinMedia`
 * below for why that raw fetch is wrapped rather than left to throw whatever the
 * injected `fetch` throws.
 */

import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Album, Artist } from '@auralis/jellyfin-client';
import { JellyfinError } from '@auralis/jellyfin-client';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError, sendError } from '../httpErrors.js';
import { getSettings, setSettings } from '../db/settingsRepo.js';
import { getJellyfinToken, setJellyfinToken } from '../db/jellyfinSecretsRepo.js';
import { AURALIS_JELLYFIN_DEVICE, JELLYFIN_UPSTREAM_KEY } from '../jellyfinUpstream.js';
import { parseInput } from '../validation.js';
import {
  albumToCandidate,
  artistToOwnershipLibraryItem,
  buildMusicProgressSignals,
  buildRecommendationShelves,
  buildTasteProfile,
  externalCandidateToAlbumPlaceholder,
  externalCandidateToOwnershipItem,
  getExternalProvidersForMedium,
  matchOwnership,
  reasonForExternalShelf,
  scoreCandidates,
  type RecommendationSeed,
  type TasteProfile,
} from '../features/recommendations/index.js';
import {
  jellyfinAddToPlaylistBodySchema,
  jellyfinAlbumsQuerySchema,
  jellyfinCreatePlaylistBodySchema,
  jellyfinItemIdParamSchema,
  jellyfinLibraryQuerySchema,
  jellyfinLoginBodySchema,
  jellyfinPlaybackProgressBodySchema,
  jellyfinPlaybackReportBodySchema,
  jellyfinPlaylistIdParamSchema,
  jellyfinPlaylistItemsQuerySchema,
  jellyfinRemoveFromPlaylistQuerySchema,
  jellyfinSearchQuerySchema,
  jellyfinTracksQuerySchema,
} from './schemas.js';

const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

/**
 * Candidate pool caps for `GET /music/recommended` — same reasoning as
 * `routes/libraries.ts`'s `RECOMMENDATION_CANDIDATE_LIMIT`, sized independently because
 * albums and tracks are different populations of one library (a 231-item audiobook
 * library and a music library of unknown size are not comparable). `MUSIC_TRACK_LIMIT` is
 * larger than `MUSIC_ALBUM_LIMIT` because `buildMusicProgressSignals` needs every track
 * that might carry play history, not just the tracks belonging to the album page fetched —
 * an album with plays whose tracks fall outside a smaller track page would silently look
 * unplayed. Neither is paginated further; revisit if a much larger library shows this
 * pass being slow, exactly as the books-route comment already says.
 */
const MUSIC_ALBUM_LIMIT = 500;
const MUSIC_TRACK_LIMIT = 5000;
/** Artists are a smaller population than albums in any real library (each artist has
 * several albums) — the same 500 cap `MUSIC_ALBUM_LIMIT` uses is generous headroom, not a
 * separately-derived number. */
const MUSIC_ARTIST_LIMIT = 500;

/** Same reasoning as `libraries.ts`'s `MAX_SHELVES`/`ITEMS_PER_SHELF`. */
const MUSIC_MAX_SHELVES = 5;
const MUSIC_ITEMS_PER_SHELF = 10;

/** Mirrors `libraries.ts`'s `RECOMMENDATION_SHELF_TYPE` — distinguishes this route's own
 * shelves from anything else a music "for you" surface might one day show. */
const MUSIC_RECOMMENDATION_SHELF_TYPE = 'recommended';

/**
 * Wave 15e-music — external (ListenBrainz) discovery, mixed into this same response.
 *
 * **How many seeds get queried.** Capped independently of
 * `listenbrainz.ts`'s own internal `MAX_SEEDS_QUERIED` (3) — kept equal rather than larger,
 * since querying more seeds than the provider will actually use per call buys nothing but
 * an unbounded seed-selection pass over the taste profile.
 *
 * **Which seeds.** The top-weighted `author` facets from the *same* `TasteProfile` the
 * library-derived shelves below already compute — for music, `adaptMusic.ts`'s
 * `albumToCandidate` folds an album's `artistName` into that facet, so "top author
 * affinity" already means "artist she listens to most." Each candidate seed still needs a
 * *real* `musicBrainzArtistId` (ListenBrainz is MBID-keyed) — resolved via the seed's own
 * album (`profile.facetSeeds.author[name].itemId`) -> that album's `artistId` -> the real
 * `Artist.musicBrainzArtistId`, an identifier chain, never a second name match. A facet
 * with no resolvable MBID is skipped, not substituted with a fuzzy lookup — see this file's
 * own wave report for how often that empties the seed list in practice (any library whose
 * scanner never found a MusicBrainz match).
 *
 * **Cold start is unaffected by construction.** `profile.affinities.author` is empty
 * whenever `profile.totalSignal <= 0` (see `profile.ts`), so a signal-less user resolves
 * zero seeds, queries no provider, and this shelf never appears — the same
 * `{ shelves: [] }` cold-start response the route already guaranteed before this wave.
 */
const MUSIC_EXTERNAL_SEED_LIMIT = 3;
/** Requested from the provider before ownership filtering — deliberately larger than the
 * shelf's own `MUSIC_EXTERNAL_ITEMS_PER_SHELF` cap, so filtering out owned/possible matches
 * still usually leaves enough to fill a real shelf rather than starving it down to one. */
const MUSIC_EXTERNAL_CANDIDATE_LIMIT = 30;
const MUSIC_EXTERNAL_ITEMS_PER_SHELF = 10;
const MUSIC_EXTERNAL_SHELF_ID = 'shelf-external-listenbrainz';
/**
 * Deliberately distinct from `MUSIC_RECOMMENDATION_SHELF_TYPE` — this shelf's items are not
 * real Jellyfin library items (see `externalCandidateToAlbumPlaceholder`'s own doc comment
 * on why they are only *shaped* like one), and a future client change may want to treat
 * "recommended" (rank items already owned) and "discover" (surface items not owned)
 * differently, e.g. a distinct visual treatment or a "not in your library" badge. Neither
 * client reads `type` today (`musicRecommendedFeed.ts` renders every shelf with items
 * regardless of its `type` string), so this is forward-looking, not a behaviour change —
 * see this wave's report for the full reasoning.
 */
const MUSIC_EXTERNAL_SHELF_TYPE = 'discover';

function copyHeaders(reply: FastifyReply, upstream: Response): void {
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) reply.header(name, value);
  }
}

/**
 * Fetches a token-bearing Jellyfin URL and returns the raw `Response`. Unlike
 * `AbsClient`'s `fetchCover`/`fetchAudioTrack` — which `media.ts` calls and which
 * already translate a transport failure into an `AbsError` — this is a bare
 * `app.upstreamFetch` call, because `streamUrl`/`imageUrl` are pure URL builders, not
 * client methods. Left unwrapped, a network failure here would throw whatever the
 * injected `fetch` throws (an untyped `TypeError`, in production), falling through
 * `handleUpstreamError` to a generic 500 with no useful `code`. Wrapping it into a
 * `JellyfinError.network` gets the same structured `jellyfin_unreachable` response every
 * other network failure in this file gets — and, just as importantly, `JellyfinError`'s
 * own message never includes the URL it was constructed from (see `errors.ts`), so the
 * token embedded in `url` can never leak into a response body via this path.
 */
async function fetchJellyfinMedia(
  app: FastifyInstance,
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  try {
    return await app.upstreamFetch(url, extraHeaders ? { headers: extraHeaders } : undefined);
  } catch (cause) {
    throw JellyfinError.network(cause);
  }
}

/**
 * The reader wave 15a/15b-1 were both missing (`docs/HANDOVER.md`: "a wave that adds a
 * writer must name its reader" — this is that name). Resolves seeds from the real taste
 * profile the route already computed, queries every registered music provider (today, just
 * ListenBrainz), filters out anything the artist-ownership pool says she already has, and
 * returns a shelf shaped exactly like the library-derived ones below — or `null`, meaning
 * "no external shelf this response", never an empty/malformed one. See
 * `MUSIC_EXTERNAL_SEED_LIMIT`'s doc comment for the seed-selection reasoning.
 */
async function buildExternalDiscoveryShelf(
  app: FastifyInstance,
  profile: TasteProfile,
  albumsById: Map<string, Album>,
  artistsById: Map<string, Artist>,
): Promise<{ id: string; label: string; type: string; reason: string; items: Album[] } | null> {
  const authorWeights = Object.entries(profile.affinities.author ?? {}).sort((a, b) => b[1] - a[1]);
  const seeds: RecommendationSeed[] = [];
  for (const [artistName] of authorWeights) {
    if (seeds.length >= MUSIC_EXTERNAL_SEED_LIMIT) break;
    const seedInfo = profile.facetSeeds.author[artistName];
    if (!seedInfo) continue;
    // Identifier chain, not a second name match: the seed's own album -> that album's
    // real Jellyfin artistId -> that artist's real musicBrainzArtistId. A facet with no
    // resolvable MBID is skipped outright rather than falling back to fuzzy name lookup —
    // ListenBrainz's endpoint is MBID-keyed and gets nothing useful from a guess.
    const seedAlbum = albumsById.get(seedInfo.itemId);
    const artistId = seedAlbum?.artistId;
    const mbid = artistId ? artistsById.get(artistId)?.musicBrainzArtistId : null;
    if (!mbid) continue;
    seeds.push({ label: artistName, identifiers: { musicBrainzArtistId: mbid } });
  }
  if (seeds.length === 0) return null;

  try {
    const providers = getExternalProvidersForMedium('music', {
      fetch: app.upstreamFetch,
      logger: app.log,
    });
    const perProvider = await Promise.all(
      providers.map((provider) => provider.recommend(seeds, MUSIC_EXTERNAL_CANDIDATE_LIMIT)),
    );
    const rawCandidates = perProvider.flat();
    if (rawCandidates.length === 0) return null;

    // Artist-granularity ownership (wave 15e-music's Half 1) — the pool 15a's own report
    // named as missing: ListenBrainz recommends artists, and the route's existing
    // ownership machinery (implicit in `buildRecommendationShelves`'s known-item exclusion)
    // only ever operated on albums. Discovery is the entire point of this shelf (her words,
    // `docs/USER_DECISIONS.md`: "not useful... if recommendations only show things already
    // in my library"), so an owned or probably-owned match is dropped here, not merely
    // labelled — unlike 12c-2's "owned still appears, just not requestable" rule for
    // *search*, where hiding an owned item would make it unfindable. This shelf isn't
    // search; showing her an artist she already owns as a "discovery" defeats the shelf.
    const artistOwnershipPool = Array.from(artistsById.values()).map(artistToOwnershipLibraryItem);
    const newCandidates = rawCandidates.filter(
      (candidate) =>
        matchOwnership(externalCandidateToOwnershipItem(candidate), artistOwnershipPool).status ===
        'new',
    );
    // A one-item carousel reads as a bug — the same rule `shelves.ts`'s
    // `buildRecommendationShelves` already enforces for the library-derived shelves.
    if (newCandidates.length < 2) return null;

    const chosen = newCandidates.slice(0, MUSIC_EXTERNAL_ITEMS_PER_SHELF);
    return {
      id: MUSIC_EXTERNAL_SHELF_ID,
      label: 'New artists to discover',
      type: MUSIC_EXTERNAL_SHELF_TYPE,
      reason: reasonForExternalShelf(seeds),
      items: chosen.map(externalCandidateToAlbumPlaceholder),
    };
  } catch (err) {
    // `ExternalRecommendationProvider.recommend` is contractually total — see that
    // interface's own doc comment: never throws, always degrades to `[]`. This catch
    // exists only against a provider that breaks that contract, mirroring
    // `tryBuildMusicGenreProfile`'s discriminated-logging precedent (`routes/libraries.ts`):
    // log at `warn` (a real fault, not a "not configured" condition — there is no
    // configured/unconfigured state for a credential-free public API), and always degrade
    // to no external shelf rather than failing the whole route.
    app.log.warn(
      { err },
      'music/recommended: external candidate discovery failed, degrading to library-only shelves',
    );
    return null;
  }
}

export function registerJellyfinRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  // ---------------------------------------------------------------------
  // Config / login
  // ---------------------------------------------------------------------

  app.get('/jellyfin/config', { preHandler: requireSession }, async (request, reply) => {
    const settings = getSettings(app.db, JELLYFIN_UPSTREAM_KEY);
    const hasCredentials =
      getJellyfinToken(app.db, request.userId!, app.config.sessionSecret) !== null;
    return reply.send({
      configured: settings !== null,
      baseUrl: settings?.baseUrl ?? null,
      hasCredentials,
    });
  });

  app.post('/jellyfin/login', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, jellyfinLoginBodySchema, request.body);
    if (!body) return undefined;

    let baseUrl = body.baseUrl;
    if (!baseUrl) {
      const settings = getSettings(app.db, JELLYFIN_UPSTREAM_KEY);
      if (!settings) {
        sendError(
          reply,
          409,
          'jellyfin_not_configured',
          'Jellyfin connection has not been configured yet — include baseUrl',
        );
        return undefined;
      }
      baseUrl = settings.baseUrl;
    }

    try {
      const client = app.jellyfin.forSetup(baseUrl);
      const result = await client.login(body.username, body.password);
      // A failed login above throws before either line here runs — mirrors
      // setup.ts's "a failed probe is never persisted" rule, so a typo'd URL or
      // password never overwrites a previously-working configuration.
      setSettings(app.db, baseUrl, JELLYFIN_UPSTREAM_KEY);
      setJellyfinToken(app.db, request.userId!, result.token, app.config.sessionSecret);
      // The access token itself is never echoed back — only the id/name a UI needs to
      // show "connected as ...".
      return reply.send({
        configured: true,
        baseUrl,
        user: { id: result.user.id, name: result.user.name },
      });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Library browsing — one flat route per item kind, all through /Items upstream.
  // ---------------------------------------------------------------------

  /**
   * `ids=,,,`-shaped query strings parse to a *defined but empty* array
   * (`jellyfinLibraryQuerySchema`'s own doc comment on `ids`) — distinct from `ids` not
   * being supplied at all, which stays `undefined` and falls through to the normal
   * unfiltered listing below. The distinction matters because `@auralis/jellyfin-client`'s
   * `queryItems` only sends `ids` upstream when the array is non-empty (`query.ids &&
   * query.ids.length > 0`), so an empty array reaches Jellyfin exactly as if `ids` had
   * never been passed — the whole unfiltered listing, not the "these zero items" the
   * caller actually asked for. Short-circuiting here, before the upstream call, is
   * simpler than teaching the client package to tell the two cases apart.
   */
  function isEmptyIdsFilter(query: { ids?: string[] }): boolean {
    return query.ids !== undefined && query.ids.length === 0;
  }

  function emptyLibraryPage(startIndex: number | undefined): {
    items: never[];
    total: number;
    startIndex: number;
  } {
    return { items: [], total: 0, startIndex: startIndex ?? 0 };
  }

  app.get('/jellyfin/artists', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinLibraryQuerySchema, request.query);
    if (!query) return undefined;
    if (isEmptyIdsFilter(query)) return reply.send(emptyLibraryPage(query.startIndex));
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.getArtists(query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/jellyfin/albums', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinAlbumsQuerySchema, request.query);
    if (!query) return undefined;
    if (isEmptyIdsFilter(query)) return reply.send(emptyLibraryPage(query.startIndex));
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.getAlbums(query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/jellyfin/tracks', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinTracksQuerySchema, request.query);
    if (!query) return undefined;
    if (isEmptyIdsFilter(query)) return reply.send(emptyLibraryPage(query.startIndex));
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.getTracks(query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Playlists — mirrors `JellyfinClient`'s playlist methods one route per method, same
  // `requireSession` / `app.jellyfin.forUser` / `handleUpstreamError` shape as everything
  // else in this file. See `@auralis/jellyfin-client`'s `schemas/raw.ts` playlists section
  // for the source-verified route findings this mirrors, in particular that removal keys
  // on the playlist-entry id (`playlistItemIds` here), never a track id.
  // ---------------------------------------------------------------------

  app.get('/jellyfin/playlists', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinLibraryQuerySchema, request.query);
    if (!query) return undefined;
    if (isEmptyIdsFilter(query)) return reply.send(emptyLibraryPage(query.startIndex));
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.getPlaylists(query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get(
    '/jellyfin/playlists/:playlistId/items',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinPlaylistIdParamSchema, request.params);
      if (!params) return undefined;
      const query = parseInput(reply, jellyfinPlaylistItemsQuerySchema, request.query);
      if (!query) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        return reply.send(await client.getPlaylistItems(params.playlistId, query));
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  app.post('/jellyfin/playlists', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, jellyfinCreatePlaylistBodySchema, request.body);
    if (!body) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      const id = await client.createPlaylist(body.name, body.itemIds);
      return reply.code(201).send({ id });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.post(
    '/jellyfin/playlists/:playlistId/items',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinPlaylistIdParamSchema, request.params);
      if (!params) return undefined;
      const body = parseInput(reply, jellyfinAddToPlaylistBodySchema, request.body);
      if (!body) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        await client.addToPlaylist(params.playlistId, body.itemIds);
        return reply.code(204).send();
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  app.delete(
    '/jellyfin/playlists/:playlistId/items',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinPlaylistIdParamSchema, request.params);
      if (!params) return undefined;
      const query = parseInput(reply, jellyfinRemoveFromPlaylistQuerySchema, request.query);
      if (!query) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        await client.removeFromPlaylist(params.playlistId, query.playlistItemIds);
        return reply.code(204).send();
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  app.get('/jellyfin/search', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinSearchQuerySchema, request.query);
    if (!query) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.search(query.term, { limit: query.limit }));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Recommendations — wave 13e-2. `/music/recommended`, not `/jellyfin/recommended`:
  // named after the medium, mirroring `libraries.ts`'s `/libraries/:id/recommended`
  // (named after the medium's own resource), rather than after this file's `/jellyfin/*`
  // prefix — there is no per-library `:id` here because nothing else in this file scopes
  // browsing to one Jellyfin library either (`/jellyfin/albums` etc. search recursively
  // across every music library the user can see).
  //
  // Reuses the exact same pure scoring core `libraries.ts`'s `/recommended` route uses
  // (`buildTasteProfile` -> `scoreCandidates` -> `buildRecommendationShelves`) via
  // `adaptMusic.ts`'s album/track adapter — see that file's doc comments for the
  // candidate/signal mapping and its justification. One ranking implementation, two
  // adapters: `docs/HANDOVER.md`'s phase-13 standing decision.
  //
  // Jellyfin unconfigured, or this user has no stored Jellyfin credentials: `app.jellyfin
  // .forUser` throws `JellyfinNotConfiguredError`/`JellyfinNoCredentialsError` before any
  // upstream call, and `handleUpstreamError` already maps both to a structured response
  // (409 `jellyfin_not_configured` / 401 `jellyfin_unauthenticated`) — the same behaviour
  // every other route in this file gets from the same catch block, not a special case
  // invented for this route.
  // ---------------------------------------------------------------------

  app.get('/music/recommended', { preHandler: requireSession }, async (request, reply) => {
    try {
      const client = app.jellyfin.forUser(request.userId!);
      const [albumsPage, tracksPage, artistsPage] = await Promise.all([
        client.getAlbums({ limit: MUSIC_ALBUM_LIMIT }),
        client.getTracks({ limit: MUSIC_TRACK_LIMIT }),
        client.getArtists({ limit: MUSIC_ARTIST_LIMIT }),
      ]);

      const candidates = albumsPage.items.map(albumToCandidate);
      const signals = buildMusicProgressSignals(tracksPage.items);
      const now = Date.now();
      const profile = buildTasteProfile(signals, candidates, { now });
      const scored = scoreCandidates(profile, candidates);
      const shelves = buildRecommendationShelves(profile, scored, candidates, {
        maxShelves: MUSIC_MAX_SHELVES,
        itemsPerShelf: MUSIC_ITEMS_PER_SHELF,
      });

      const albumsById = new Map<string, Album>(albumsPage.items.map((a) => [a.id, a]));
      const artistsById = new Map<string, Artist>(artistsPage.items.map((a) => [a.id, a]));

      // Wave 15e-music: external (ListenBrainz) discovery, ahead of the library-derived
      // shelves — she asked for unowned discovery, not a re-sort of what she already has
      // (`docs/USER_DECISIONS.md`), so when it exists it leads. `null` (no signal, no
      // resolvable seed, or fewer than two unowned candidates) means "not this response",
      // never an empty placeholder shelf.
      const externalShelf = await buildExternalDiscoveryShelf(
        app,
        profile,
        albumsById,
        artistsById,
      );

      const libraryShelves = shelves.map((shelf) => ({
        id: shelf.id,
        label: shelf.label,
        type: MUSIC_RECOMMENDATION_SHELF_TYPE,
        reason: shelf.reason,
        items: shelf.itemIds
          .map((id) => albumsById.get(id))
          .filter((album): album is Album => album !== undefined),
      }));

      const responseShelves = externalShelf ? [externalShelf, ...libraryShelves] : libraryShelves;

      return reply.send({ shelves: responseShelves });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Lyrics — mirrors `JellyfinClient.getLyrics` one route to one method, same shape as
  // every other route here. `getLyrics` already folds Jellyfin's "no lyrics" 404 into a
  // typed `null` (see that method's own doc comment for why — the 404 also covers "item
  // not found", which this route can't tell apart from "no lyrics" either), so a 200 with
  // `{ lyrics: null }` is this route's own honest way of saying the same thing to the web
  // client — never a 404, which the client would otherwise have to special-case away from
  // every other kind of upstream failure this file already maps with `handleUpstreamError`.
  // ---------------------------------------------------------------------

  app.get(
    '/jellyfin/tracks/:itemId/lyrics',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
      if (!params) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        const lyrics = await client.getLyrics(params.itemId);
        return reply.send({ lyrics });
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  // ---------------------------------------------------------------------
  // Playback progress reporting — mirrors `JellyfinClient.reportPlaybackStart`/
  // `reportPlaybackProgress`/`reportPlaybackStopped` one route per method. Same shape as
  // every other route here: `requireSession`, `app.jellyfin.forUser`, and
  // `handleUpstreamError` for the not-configured/no-credentials/upstream-failure cases —
  // no new error handling invented for these three.
  // ---------------------------------------------------------------------

  app.post('/jellyfin/playback/start', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, jellyfinPlaybackReportBodySchema, request.body);
    if (!body) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      await client.reportPlaybackStart(body.itemId, body.positionSeconds);
      return reply.code(204).send();
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.post(
    '/jellyfin/playback/progress',
    { preHandler: requireSession },
    async (request, reply) => {
      const body = parseInput(reply, jellyfinPlaybackProgressBodySchema, request.body);
      if (!body) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        await client.reportPlaybackProgress(body.itemId, body.positionSeconds, {
          isPaused: body.isPaused,
        });
        return reply.code(204).send();
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  app.post('/jellyfin/playback/stopped', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, jellyfinPlaybackReportBodySchema, request.body);
    if (!body) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      await client.reportPlaybackStopped(body.itemId, body.positionSeconds);
      return reply.code(204).send();
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Favourites — mirrors `JellyfinClient.markFavorite`/`unmarkFavorite` one route to one
  // method, same shape as playback progress reporting above: `requireSession`,
  // `app.jellyfin.forUser`, `handleUpstreamError`. Each responds with `{ favorite }`
  // reflecting the state Jellyfin actually recorded (see those client methods' own doc
  // comments for why the return value is trusted over the request's own intent).
  // ---------------------------------------------------------------------

  app.post(
    '/jellyfin/items/:itemId/favorite',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
      if (!params) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        const favorite = await client.markFavorite(params.itemId);
        return reply.send({ favorite });
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  app.delete(
    '/jellyfin/items/:itemId/favorite',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
      if (!params) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        const favorite = await client.unmarkFavorite(params.itemId);
        return reply.send({ favorite });
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  // ---------------------------------------------------------------------
  // Proxied media — see this file's doc comment and `fetchJellyfinMedia` above for why
  // the token-bearing URL is built and fetched here, never handed to the caller.
  // ---------------------------------------------------------------------

  async function proxyStream(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> {
    const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
    if (!params) return undefined;

    try {
      const client = app.jellyfin.forUser(request.userId!);
      const url = client.streamUrl(params.itemId, { deviceId: AURALIS_JELLYFIN_DEVICE.deviceId });
      const range = request.headers.range;
      const upstream = await fetchJellyfinMedia(app, url, range ? { Range: range } : undefined);

      reply.code(upstream.status);
      copyHeaders(reply, upstream);

      if (request.method === 'HEAD' || upstream.body === null) {
        return reply.send();
      }
      // Streamed, not buffered — same reasoning as media.ts's audio-track proxy: this
      // is what makes seeking inside a long track practical.
      return reply.send(Readable.fromWeb(upstream.body));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  }

  // Registered explicitly rather than relying on Fastify's auto-exposed HEAD-for-GET —
  // same reasoning as media.ts: the auto route would zero out Content-Length.
  const streamRouteOptions = { preHandler: requireSession, exposeHeadRoute: false } as const;
  app.get('/jellyfin/tracks/:itemId/stream', streamRouteOptions, proxyStream);
  app.head('/jellyfin/tracks/:itemId/stream', streamRouteOptions, proxyStream);

  app.get(
    '/jellyfin/items/:itemId/artwork',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
      if (!params) return undefined;

      try {
        const client = app.jellyfin.forUser(request.userId!);
        const url = client.imageUrl(params.itemId);
        const upstream = await fetchJellyfinMedia(app, url);

        reply.code(upstream.status);
        copyHeaders(reply, upstream);
        // Cover art is content-addressed by item id, so it's safe to cache aggressively —
        // same policy as media.ts's cover route.
        reply.header('Cache-Control', 'public, max-age=86400, immutable');
        return reply.send(Buffer.from(await upstream.arrayBuffer()));
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );
}
