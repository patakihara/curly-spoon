/**
 * A minimal, in-memory fake of the Jellyfin REST API surface `@auralis/jellyfin-client`
 * uses — auth, `/Items` browsing/search, lyrics (`/Audio/:id/Lyrics`), library refresh
 * (`/Library/MediaFolders`, `/Items/:id/Refresh` — the music-request rescan capability),
 * and the two token-bearing byte routes (`/Audio/:id/stream`, `/Items/:id/Images/Primary`).
 * Mirrors `fakeAbs.ts`'s shape: a `fetch`-compatible function, keyed by a distinct base URL
 * so `buildTestApp.ts` can route by origin, no real socket.
 *
 * Data is small and inline (not a JSON fixture directory like `fakeAbs.ts`'s) —
 * deliberately: this fake exists to exercise the BFF's routes/schemas/error-mapping,
 * not to pin an exact upstream response shape the way the ABS fixtures do. Field names
 * on each item are exactly what `schemas/raw.ts`'s `rawBaseItemDtoSchema` expects
 * (PascalCase, `.passthrough()`), verified against that file, not guessed.
 */

import type { FetchLike } from '@auralis/jellyfin-client';
import { serveRangeableBytes } from './rangeBytes.js';

/** The only host this fake answers for — anything else simulates a DNS/connection failure. */
export const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
export const FAKE_JELLYFIN_CREDENTIALS = { username: 'nova', password: 'stardust1' };
export const FAKE_JELLYFIN_BAD_CREDENTIALS = { username: 'nova', password: 'wrong-password' };
/** The id `GET /Library/MediaFolders` reports for this fake's one music library — the
 * value a real `musicRequestService.ts` rescan passes to `POST /Items/:id/Refresh`. */
export const FAKE_JELLYFIN_MUSIC_LIBRARY_ID = 'lib-fake-music';

interface RawUserData {
  IsFavorite: boolean;
  PlayCount: number;
  LastPlayedDate: string | null;
}

interface RawArtist {
  Id: string;
  Name: string;
  Type: 'MusicArtist';
  Overview: string | null;
  ImageTags: Record<string, string>;
  ChildCount: number;
  UserData: RawUserData;
  /** Optional, matching the real upstream — see `ARTISTS`'s own comment on why exactly one
   * fake artist carries one (wave 15e-music's `GET /music/recommended` external-discovery
   * coverage needs a real MBID to seed ListenBrainz with; the other two staying MBID-less
   * is what lets `music/recommended`'s existing cold-start/library-only tests keep passing
   * unmodified — no test here asserted anything about `ProviderIds` before this addition). */
  ProviderIds?: Record<string, string>;
}

interface RawAlbum {
  Id: string;
  Name: string;
  Type: 'MusicAlbum';
  SortName: string;
  AlbumArtists: Array<{ Id: string; Name: string }>;
  ProductionYear: number | null;
  Overview: string | null;
  Genres: string[];
  ImageTags: Record<string, string>;
  ChildCount: number;
  UserData: RawUserData;
}

interface RawTrack {
  Id: string;
  Name: string;
  Type: 'Audio';
  AlbumId: string;
  Album: string;
  Artists: string[];
  ArtistItems: Array<{ Id: string; Name: string }>;
  IndexNumber: number;
  ParentIndexNumber: number;
  RunTimeTicks: number;
  ImageTags: Record<string, string>;
  Genres: string[];
  UserData: RawUserData;
}

const ARTISTS: Array<{
  id: string;
  name: string;
  overview: string;
  /** Wave 15e-music: exactly one fake artist carries a `MusicBrainzArtist` provider id, so
   * `routes/jellyfin.test.ts`'s `GET /music/recommended` external-discovery tests have a
   * real MBID to build a `RecommendationSeed` from and to prove an artist-granularity
   * `owned` ownership verdict against (see `musicExternalDiscovery.ts`). The other two
   * artists staying MBID-less is deliberate too — it's what exercises the title-only
   * `possible` fallback without a second fixture addition, and keeps every pre-existing
   * assertion in this file (album/artist counts) untouched. */
  musicBrainzId?: string;
}> = [
  {
    id: 'artist-nebula',
    name: 'The Nebula Collective',
    overview: 'A synth duo.',
    musicBrainzId: 'mbid-fake-nebula-7a21',
  },
  { id: 'artist-echo', name: 'Echo Fields', overview: 'Ambient guitar.' },
  // Added for `routes/jellyfin.test.ts`'s `GET /music/recommended` coverage (wave
  // 13e-2): a *third* artist sharing the 'Synthwave' genre with artist-nebula's two
  // albums, so seeding a play on one nebula album still leaves two unplayed
  // same-genre candidates (nightglass + this artist's album) — `shelves.ts` drops
  // any facet with fewer than two matching candidates, so the existing two-artist
  // fixture (each with exactly two albums) could never produce a real genre shelf
  // without adding a third genre-sharing album. Doesn't touch artist-nebula's or
  // artist-echo's own album counts, which `jellyfin.test.ts` asserts exactly.
  { id: 'artist-lumen', name: 'Lumen Cascade', overview: 'A one-person synth project.' },
];

const ALBUMS: Array<{
  id: string;
  name: string;
  artistId: string;
  year: number;
  genres: string[];
}> = [
  {
    id: 'album-driftwave',
    name: 'Driftwave',
    artistId: 'artist-nebula',
    year: 2021,
    genres: ['Synthwave'],
  },
  {
    id: 'album-nightglass',
    name: 'Nightglass',
    artistId: 'artist-nebula',
    year: 2023,
    genres: ['Synthwave'],
  },
  {
    id: 'album-hollow',
    name: 'Hollow Fields',
    artistId: 'artist-echo',
    year: 2020,
    genres: ['Ambient'],
  },
  {
    // Added for the synced-lyrics e2e wave (`e2e/app/lyrics.spec.ts`): a track with enough
    // lyric lines to overflow `.auralis-lyrics`'s `max-height: 320px` (see `app.css`), so the
    // active-line scroll-into-view effect has genuinely off-screen lines to scroll to, not
    // just a short list that already fits. Kept as its own album/artist-echo addition rather
    // than extending `album-driftwave`/`album-hollow` because both those albums' track counts
    // are asserted exactly (`jellyfin.test.ts`'s "returns tracks scoped to one album"
    // expects 2 for Driftwave; `music.spec.ts`'s doc comment states 1 for Hollow) — adding
    // here changes only artist-echo's child count, which nothing asserts.
    id: 'album-wavelengths',
    name: 'Wavelengths',
    artistId: 'artist-echo',
    year: 2022,
    genres: ['Ambient'],
  },
  {
    // See `artist-lumen`'s own comment above `ARTISTS` for why this exists.
    id: 'album-lumenfall',
    name: 'Lumenfall',
    artistId: 'artist-lumen',
    year: 2024,
    genres: ['Synthwave'],
  },
];

const TRACKS: Array<{
  id: string;
  name: string;
  albumId: string;
  discNumber: number;
  trackNumber: number;
  durationSeconds: number;
  audio: { size: number; mimeType: string };
}> = [
  {
    id: 'track-driftwave-1',
    name: 'Tidal Lines',
    albumId: 'album-driftwave',
    discNumber: 1,
    trackNumber: 1,
    durationSeconds: 214,
    audio: { size: 4200, mimeType: 'audio/mpeg' },
  },
  {
    id: 'track-driftwave-2',
    name: 'Static Coast',
    albumId: 'album-driftwave',
    discNumber: 1,
    trackNumber: 2,
    durationSeconds: 198,
    audio: { size: 3900, mimeType: 'audio/mpeg' },
  },
  {
    id: 'track-hollow-1',
    name: 'Empty Rooms',
    albumId: 'album-hollow',
    discNumber: 1,
    trackNumber: 1,
    durationSeconds: 301,
    audio: { size: 5100, mimeType: 'audio/mpeg' },
  },
  {
    id: 'track-wavelengths-1',
    name: 'Horizon Radio',
    albumId: 'album-wavelengths',
    discNumber: 1,
    trackNumber: 1,
    durationSeconds: 90,
    audio: { size: 2200, mimeType: 'audio/mpeg' },
  },
  {
    id: 'track-lumenfall-1',
    name: 'Afterglow',
    albumId: 'album-lumenfall',
    discNumber: 1,
    trackNumber: 1,
    durationSeconds: 180,
    audio: { size: 3600, mimeType: 'audio/mpeg' },
  },
];

const artistName = (id: string): string => ARTISTS.find((a) => a.id === id)?.name ?? '';
const albumName = (id: string): string => ALBUMS.find((a) => a.id === id)?.name ?? '';
const albumArtistId = (albumId: string): string =>
  ALBUMS.find((a) => a.id === albumId)?.artistId ?? '';

/** Per-item play state — `playCount`/`lastPlayedAt` (already an ISO string, matching
 * `LastPlayedDate`'s wire shape), seeded only by `POST /Sessions/Playing/Stopped` (see
 * that handler below), never by a module-level default. Mirrors `fakeAbs.ts`'s
 * `progressByKey` convention (wave 13b's own comment on why: a module-level default
 * leaks into every unrelated test that shares this fake via `buildTestApp()`). */
type PlayState = ReadonlyMap<string, { playCount: number; lastPlayedAt: string | null }>;

function userData(id: string, favorites: ReadonlySet<string>, playState: PlayState): RawUserData {
  const play = playState.get(id);
  return {
    IsFavorite: favorites.has(id),
    PlayCount: play?.playCount ?? 0,
    LastPlayedDate: play?.lastPlayedAt ?? null,
  };
}

function artistDto(
  a: (typeof ARTISTS)[number],
  favorites: ReadonlySet<string>,
  playState: PlayState,
): RawArtist {
  return {
    Id: a.id,
    Name: a.name,
    Type: 'MusicArtist',
    Overview: a.overview,
    ImageTags: { Primary: `${a.id}-tag` },
    ChildCount: ALBUMS.filter((al) => al.artistId === a.id).length,
    UserData: userData(a.id, favorites, playState),
    ...(a.musicBrainzId ? { ProviderIds: { MusicBrainzArtist: a.musicBrainzId } } : {}),
  };
}

function albumDto(
  al: (typeof ALBUMS)[number],
  favorites: ReadonlySet<string>,
  playState: PlayState,
): RawAlbum {
  return {
    Id: al.id,
    Name: al.name,
    Type: 'MusicAlbum',
    SortName: al.name,
    AlbumArtists: [{ Id: al.artistId, Name: artistName(al.artistId) }],
    ProductionYear: al.year,
    Overview: null,
    Genres: al.genres,
    ImageTags: { Primary: `${al.id}-tag` },
    ChildCount: TRACKS.filter((t) => t.albumId === al.id).length,
    UserData: userData(al.id, favorites, playState),
  };
}

function trackDto(
  t: (typeof TRACKS)[number],
  favorites: ReadonlySet<string>,
  playState: PlayState,
): RawTrack {
  const artistId = albumArtistId(t.albumId);
  return {
    Id: t.id,
    Name: t.name,
    Type: 'Audio',
    AlbumId: t.albumId,
    Album: albumName(t.albumId),
    Artists: [artistName(artistId)],
    ArtistItems: [{ Id: artistId, Name: artistName(artistId) }],
    IndexNumber: t.trackNumber,
    ParentIndexNumber: t.discNumber,
    RunTimeTicks: t.durationSeconds * 10_000_000,
    ImageTags: { Primary: `${t.albumId}-tag` },
    Genres: [],
    UserData: userData(t.id, favorites, playState),
  };
}

// Deterministic bytes per track id, sized after `audio.size` above — mirrors
// `fakeAbs.ts`'s `generateBytes`.
function generateBytes(size: number, seed: number): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) buf[i] = (i + seed) % 256;
  return buf;
}

const AUDIO_BYTES = new Map<string, { bytes: Uint8Array; mimeType: string }>(
  TRACKS.map((t, i) => [
    t.id,
    { bytes: generateBytes(t.audio.size, i + 1), mimeType: t.audio.mimeType },
  ]),
);

// Cover art bytes, keyed by whatever id the `ImageTags` above are attached to (artists,
// albums and — via `${albumId}-tag` — tracks all resolve to their album's cover).
const IMAGE_IDS = new Set([...ARTISTS.map((a) => a.id), ...ALBUMS.map((a) => a.id)]);
const IMAGE_BYTES = new Map<string, Uint8Array>(
  [...IMAGE_IDS].map((id, i) => [id, generateBytes(600, i + 100)]),
);

/** Lyrics, keyed by track id — deliberately covers the three response shapes
 * `GET /jellyfin/tracks/:itemId/lyrics` (`routes/jellyfin.ts`) has to distinguish: a
 * synced (every line has `Start`) response for `track-driftwave-1`, an unsynced (no line
 * has `Start`) response for `track-driftwave-2`, and no entry at all for
 * `track-hollow-1` — that one falls through to this fake's default 404, exactly the
 * "item not found or has no lyrics" ambiguity the real `LyricsController.GetLyrics`
 * itself can't distinguish (see `client.ts`'s `getLyrics` doc comment).
 */
const LYRICS: Record<string, { Text: string; Start?: number }[]> = {
  'track-driftwave-1': [
    { Text: 'Tidal lines on the shore', Start: 0 },
    { Text: 'Static coast forevermore', Start: 32_500_000 }, // 3.25s
  ],
  'track-driftwave-2': [{ Text: 'plain text, no timing at all' }],
  // 15 invented lines, 5s apart (0s-70s), for `track-wavelengths-1` — see that track's own
  // comment above `ALBUMS` for why: this is the one fixture with enough lines to overflow
  // `.auralis-lyrics`'s 320px `max-height`, so `e2e/app/lyrics.spec.ts` can exercise the
  // active-line scroll-into-view effect against lines that start genuinely off-screen.
  'track-wavelengths-1': [
    { Text: 'Horizon caught the static hush', Start: 0 },
    { Text: 'Radio waves in gentle rush', Start: 50_000_000 }, // 5s
    { Text: 'Counting seconds in the wire', Start: 100_000_000 }, // 10s
    { Text: 'Antennas humming with desire', Start: 150_000_000 }, // 15s
    { Text: 'Frequencies drawn out and slow', Start: 200_000_000 }, // 20s
    { Text: 'Somewhere a signal starts to grow', Start: 250_000_000 }, // 25s
    { Text: 'Voices folding into hiss', Start: 300_000_000 }, // 30s
    { Text: 'A tuning dial you cannot miss', Start: 350_000_000 }, // 35s
    { Text: 'Wavelengths bending toward the dawn', Start: 400_000_000 }, // 40s
    { Text: "The station hums after you're gone", Start: 450_000_000 }, // 45s
    { Text: 'Copper wire and open sky', Start: 500_000_000 }, // 50s
    { Text: 'Every channel asking why', Start: 550_000_000 }, // 55s
    { Text: 'The dial turns another notch', Start: 600_000_000 }, // 60s
    { Text: 'Somewhere a silence starts to watch', Start: 650_000_000 }, // 65s
    { Text: 'Horizon fades to gentle grey', Start: 700_000_000 }, // 70s
  ],
};

/** One occurrence of a track within a fake playlist. `entryId` is deliberately a separate
 * counter from any item id, mirroring the real server's `PlaylistItemId` (see
 * `@auralis/jellyfin-client`'s `schemas/raw.ts` playlists section) — the whole point being
 * that route/schema tests exercising add-then-remove can prove the BFF forwards *this* id,
 * not the track's own id, on the way out. */
interface FakePlaylistEntry {
  entryId: string;
  itemId: string;
}

interface FakePlaylist {
  id: string;
  name: string;
  entries: FakePlaylistEntry[];
}

export interface FakeJellyfinUpstream {
  fetch: FetchLike;
}

export function createFakeJellyfinUpstream(): FakeJellyfinUpstream {
  const tokens = new Map<string, string>(); // token -> userId
  // Favourite state, keyed by item id — a single set is enough since every fake token
  // resolves to the same one fake user (`jellyfin-user-1`), matching this fake's existing
  // single-tenant shape elsewhere (no per-user branching in `/Items` either).
  const favorites = new Set<string>();
  // Play state, keyed by item id — seeded only by `POST /Sessions/Playing/Stopped` below
  // (the real API path a client reports a finished listen through), never by a
  // module-level default. See `PlayState`'s doc comment above.
  const playState = new Map<string, { playCount: number; lastPlayedAt: string | null }>();
  const playlists = new Map<string, FakePlaylist>();
  let nextPlaylistId = 1;
  let nextEntryId = 1;

  /** Carries `UserData` even though playlists don't have favourite state in this client —
   * purely so this fake's `/Items` handler can hold every item kind in one array without a
   * type split; real Jellyfin does populate `UserData` on every `BaseItemDto` regardless of
   * kind. */
  function playlistDto(p: FakePlaylist): {
    Id: string;
    Name: string;
    Type: 'Playlist';
    ChildCount: number;
    ImageTags: Record<string, string>;
    UserData: RawUserData;
  } {
    return {
      Id: p.id,
      Name: p.name,
      Type: 'Playlist',
      ChildCount: p.entries.length,
      ImageTags: {},
      UserData: { IsFavorite: false, PlayCount: 0, LastPlayedDate: null },
    };
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function unauthorized(): Response {
    return json({ Message: 'Unauthorized' }, 401);
  }

  function notFound(): Response {
    return json({ Message: 'Not found' }, 404);
  }

  /** Jellyfin accepts the token two ways depending on caller: the `MediaBrowser
   * ... Token="..."` header (`JellyfinClient`'s own auth, used for `/Items` browsing and
   * search) or the `ApiKey` query parameter (what `urls.ts`'s `buildStreamUrl`/
   * `buildImageUrl` embed, since an `<audio>`/`<img>` element can't attach a header) —
   * see `urls.ts`'s file comment for the real-server citation. Both must work here, since
   * the BFF's media-proxy routes use the query-param form exclusively. */
  function tokenFromRequest(url: URL, headers: Headers): string | undefined {
    const apiKey = url.searchParams.get('ApiKey');
    if (apiKey) return apiKey;
    const auth = headers.get('authorization');
    if (!auth) return undefined;
    const match = /Token="([^"]*)"/.exec(auth);
    return match?.[1] || undefined;
  }

  const fetchFn: FetchLike = async (input, init) => {
    const url = new URL(input);

    if (url.origin !== FAKE_JELLYFIN_BASE_URL) {
      throw new Error(`getaddrinfo ENOTFOUND ${url.hostname}`);
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);
    const body = (): Record<string, unknown> =>
      init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    // ---- Auth ----
    if (method === 'POST' && path === '/Users/AuthenticateByName') {
      const { Username, Pw } = body() as { Username?: string; Pw?: string };
      if (
        Username !== FAKE_JELLYFIN_CREDENTIALS.username ||
        Pw !== FAKE_JELLYFIN_CREDENTIALS.password
      ) {
        return unauthorized();
      }
      const token = `fake-jellyfin-token-${tokens.size + 1}`;
      tokens.set(token, 'jellyfin-user-1');
      return json({
        User: { Id: 'jellyfin-user-1', Name: Username, ServerId: 'fake-server-id' },
        AccessToken: token,
        ServerId: 'fake-server-id',
      });
    }

    // Everything else requires a token, header or query-param form.
    const token = tokenFromRequest(url, headers);
    if (!token || !tokens.has(token)) return unauthorized();

    // ---- Favourites ----
    // Mirrors the real `UserLibraryController`'s `MarkFavoriteItem`/`UnmarkFavoriteItem` —
    // verified against that controller (see `schemas/raw.ts`'s favourites section comment
    // in `@auralis/jellyfin-client`): `POST`/`DELETE /UserFavoriteItems/{itemId}`, no
    // userId needed since it resolves from the token, response is `{ IsFavorite }`
    // reflecting the state *after* the change.
    if (
      (method === 'POST' || method === 'DELETE') &&
      parts[0] === 'UserFavoriteItems' &&
      parts[1]
    ) {
      const itemId = parts[1];
      const known =
        ARTISTS.some((a) => a.id === itemId) ||
        ALBUMS.some((a) => a.id === itemId) ||
        TRACKS.some((t) => t.id === itemId);
      if (!known) return notFound();
      if (method === 'POST') favorites.add(itemId);
      else favorites.delete(itemId);
      return json({ IsFavorite: favorites.has(itemId) });
    }

    // ---- Playlists ----
    // Mirrors the real `PlaylistsController`, verified against that controller (see
    // `@auralis/jellyfin-client`'s `schemas/raw.ts` playlists section comment): `POST
    // /Playlists` (body `Name`/`Ids`), `GET /Playlists/:id/Items` (playlist order, each row
    // carrying its own `PlaylistItemId` distinct from the track's `Id`), `POST
    // /Playlists/:id/Items?ids=` to append, `DELETE /Playlists/:id/Items?entryIds=` to
    // remove by that same per-entry id. Playlist listing itself has no dedicated route —
    // it's folded into the generic `/Items?includeItemTypes=Playlist` branch below, exactly
    // like the real server.
    if (method === 'POST' && path === '/Playlists') {
      const { Name, Ids } = body() as { Name?: string; Ids?: string[] };
      const id = `playlist-${nextPlaylistId}`;
      nextPlaylistId += 1;
      const entries: FakePlaylistEntry[] = (Ids ?? []).map((itemId) => {
        const entryId = `entry-${nextEntryId}`;
        nextEntryId += 1;
        return { entryId, itemId };
      });
      playlists.set(id, { id, name: Name ?? '', entries });
      return json({ Id: id });
    }

    if (parts[0] === 'Playlists' && parts[1] && parts[2] === 'Items' && parts.length === 3) {
      const playlist = playlists.get(parts[1]);
      if (!playlist) return notFound();

      if (method === 'GET') {
        const dtos = playlist.entries.flatMap((entry) => {
          const track = TRACKS.find((t) => t.id === entry.itemId);
          if (!track) return [];
          return [{ ...trackDto(track, favorites, playState), PlaylistItemId: entry.entryId }];
        });
        return json({ Items: dtos, TotalRecordCount: dtos.length, StartIndex: 0 });
      }

      if (method === 'POST') {
        const ids = url.searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
        for (const itemId of ids) {
          const entryId = `entry-${nextEntryId}`;
          nextEntryId += 1;
          playlist.entries.push({ entryId, itemId });
        }
        return new Response(null, { status: 204 });
      }

      if (method === 'DELETE') {
        const entryIds = url.searchParams.get('entryIds')?.split(',').filter(Boolean) ?? [];
        playlist.entries = playlist.entries.filter((e) => !entryIds.includes(e.entryId));
        return new Response(null, { status: 204 });
      }
    }

    // ---- Library refresh — the music-request rescan wave. Mirrors the real
    // `GET /Library/MediaFolders` / `POST /Items/{itemId}/Refresh` shapes verified in
    // `@auralis/jellyfin-client`'s `client.ts` (same section comment has the source
    // citations): one music library folder, and a refresh call that just 204s — this fake
    // has no background worker to simulate, since the real endpoint never reports
    // completion either. ----
    if (method === 'GET' && path === '/Library/MediaFolders') {
      return json({
        Items: [{ Id: FAKE_JELLYFIN_MUSIC_LIBRARY_ID, Name: 'Music', CollectionType: 'music' }],
        TotalRecordCount: 1,
        StartIndex: 0,
      });
    }
    if (method === 'POST' && parts[0] === 'Items' && parts[1] && parts[2] === 'Refresh') {
      const itemId = parts[1];
      if (itemId !== FAKE_JELLYFIN_MUSIC_LIBRARY_ID) return notFound();
      return new Response(null, { status: 204 });
    }

    // ---- Library browsing / search — one endpoint for all three item kinds ----
    if (method === 'GET' && path === '/Items') {
      const includeItemTypes = (url.searchParams.get('includeItemTypes') ?? '')
        .split(',')
        .filter(Boolean);
      const searchTerm = url.searchParams.get('searchTerm')?.toLowerCase();
      const albumArtistIds = url.searchParams.get('albumArtistIds');
      const albumIds = url.searchParams.get('albumIds');
      const ids = url.searchParams.get('ids')?.split(',').filter(Boolean);
      const startIndex = Number(url.searchParams.get('startIndex') ?? 0);
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam !== null ? Number(limitParam) : undefined;
      const favoritesOnly = (url.searchParams.get('filters') ?? '')
        .split(',')
        .includes('IsFavorite');

      let items: Array<RawArtist | RawAlbum | RawTrack | ReturnType<typeof playlistDto>> = [];
      if (includeItemTypes.includes('MusicArtist')) {
        items = items.concat(ARTISTS.map((a) => artistDto(a, favorites, playState)));
      }
      if (includeItemTypes.includes('MusicAlbum')) {
        let albums = ALBUMS;
        if (albumArtistIds) albums = albums.filter((a) => a.artistId === albumArtistIds);
        items = items.concat(albums.map((a) => albumDto(a, favorites, playState)));
      }
      if (includeItemTypes.includes('Audio')) {
        let tracks = TRACKS;
        if (albumIds) tracks = tracks.filter((t) => t.albumId === albumIds);
        items = items.concat(tracks.map((t) => trackDto(t, favorites, playState)));
      }
      if (includeItemTypes.includes('Playlist')) {
        items = items.concat([...playlists.values()].map(playlistDto));
      }
      if (searchTerm) {
        items = items.filter((item) => (item.Name ?? '').toLowerCase().includes(searchTerm));
      }
      if (favoritesOnly) {
        items = items.filter((item) => item.UserData.IsFavorite);
      }
      if (ids && ids.length > 0) {
        items = items.filter((item) => ids.includes(item.Id));
      }

      const total = items.length;
      const page =
        limit !== undefined ? items.slice(startIndex, startIndex + limit) : items.slice(startIndex);
      return json({ Items: page, TotalRecordCount: total, StartIndex: startIndex });
    }

    // ---- Artwork ----
    if (parts[0] === 'Items' && parts[1] && parts[2] === 'Images' && parts[3]) {
      const itemId = parts[1];
      const bytes = IMAGE_BYTES.get(itemId);
      if (!bytes) return notFound();
      return new Response(method === 'HEAD' ? null : bytes, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(bytes.length) },
      });
    }

    // ---- Audio stream ----
    if (parts[0] === 'Audio' && parts[1] && parts[2] === 'stream') {
      const itemId = parts[1];
      const meta = AUDIO_BYTES.get(itemId);
      if (!meta) return notFound();
      const result = serveRangeableBytes(
        meta.bytes,
        headers.get('range') ?? undefined,
        meta.mimeType,
      );
      return new Response(method === 'HEAD' ? null : result.body, {
        status: result.status,
        headers: result.headers,
      });
    }

    // ---- Lyrics ----
    if (method === 'GET' && parts[0] === 'Audio' && parts[1] && parts[2] === 'Lyrics') {
      const lines = LYRICS[parts[1]];
      if (!lines) return notFound();
      return json({ Metadata: {}, Lyrics: lines });
    }

    // ---- Playback progress reporting ----
    // Mirrors the real `PlaystateController`'s three routes, verified against
    // `Jellyfin.Api/Controllers/PlaystateController.cs`: every one of
    // `ReportPlaybackStart`/`ReportPlaybackProgress`/`ReportPlaybackStopped` returns
    // `NoContent()` on success — 204, empty body — regardless of whether a start report
    // preceded a progress/stop report, so this fake does the same without tracking any
    // session state across the three calls.
    if (method === 'POST' && path === '/Sessions/Playing') {
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && path === '/Sessions/Playing/Progress') {
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && path === '/Sessions/Playing/Stopped') {
      // Wave 13e-2: records a play, mirroring real Jellyfin's `PlaystateController`
      // incrementing `UserData.PlayCount`/`LastPlayedDate` on a stop report. This is the
      // one real API path route tests use to seed music listening history for
      // `GET /api/v1/music/recommended` — never a module-level fixture default, per this
      // fake's own `PlayState` doc comment above.
      const { ItemId } = body() as { ItemId?: string };
      if (ItemId) {
        const existing = playState.get(ItemId) ?? { playCount: 0, lastPlayedAt: null };
        playState.set(ItemId, {
          playCount: existing.playCount + 1,
          lastPlayedAt: new Date().toISOString(),
        });
      }
      return new Response(null, { status: 204 });
    }

    return notFound();
  };

  return { fetch: fetchFn };
}
