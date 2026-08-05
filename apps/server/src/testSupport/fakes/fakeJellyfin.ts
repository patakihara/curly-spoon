/**
 * A minimal, in-memory fake of the Jellyfin REST API surface `@auralis/jellyfin-client`
 * uses — auth, `/Items` browsing/search, and the two token-bearing byte routes
 * (`/Audio/:id/stream`, `/Items/:id/Images/Primary`). Mirrors `fakeAbs.ts`'s shape: a
 * `fetch`-compatible function, keyed by a distinct base URL so `buildTestApp.ts` can
 * route by origin, no real socket.
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

interface RawArtist {
  Id: string;
  Name: string;
  Type: 'MusicArtist';
  Overview: string | null;
  ImageTags: Record<string, string>;
  ChildCount: number;
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
}

const ARTISTS: Array<{ id: string; name: string; overview: string }> = [
  { id: 'artist-nebula', name: 'The Nebula Collective', overview: 'A synth duo.' },
  { id: 'artist-echo', name: 'Echo Fields', overview: 'Ambient guitar.' },
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
];

const artistName = (id: string): string => ARTISTS.find((a) => a.id === id)?.name ?? '';
const albumName = (id: string): string => ALBUMS.find((a) => a.id === id)?.name ?? '';
const albumArtistId = (albumId: string): string =>
  ALBUMS.find((a) => a.id === albumId)?.artistId ?? '';

function artistDto(a: (typeof ARTISTS)[number]): RawArtist {
  return {
    Id: a.id,
    Name: a.name,
    Type: 'MusicArtist',
    Overview: a.overview,
    ImageTags: { Primary: `${a.id}-tag` },
    ChildCount: ALBUMS.filter((al) => al.artistId === a.id).length,
  };
}

function albumDto(al: (typeof ALBUMS)[number]): RawAlbum {
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
  };
}

function trackDto(t: (typeof TRACKS)[number]): RawTrack {
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

export interface FakeJellyfinUpstream {
  fetch: FetchLike;
}

export function createFakeJellyfinUpstream(): FakeJellyfinUpstream {
  const tokens = new Map<string, string>(); // token -> userId

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

    // ---- Library browsing / search — one endpoint for all three item kinds ----
    if (method === 'GET' && path === '/Items') {
      const includeItemTypes = (url.searchParams.get('includeItemTypes') ?? '')
        .split(',')
        .filter(Boolean);
      const searchTerm = url.searchParams.get('searchTerm')?.toLowerCase();
      const albumArtistIds = url.searchParams.get('albumArtistIds');
      const albumIds = url.searchParams.get('albumIds');
      const startIndex = Number(url.searchParams.get('startIndex') ?? 0);
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam !== null ? Number(limitParam) : undefined;

      let items: Array<RawArtist | RawAlbum | RawTrack> = [];
      if (includeItemTypes.includes('MusicArtist')) {
        items = items.concat(ARTISTS.map(artistDto));
      }
      if (includeItemTypes.includes('MusicAlbum')) {
        let albums = ALBUMS;
        if (albumArtistIds) albums = albums.filter((a) => a.artistId === albumArtistIds);
        items = items.concat(albums.map(albumDto));
      }
      if (includeItemTypes.includes('Audio')) {
        let tracks = TRACKS;
        if (albumIds) tracks = tracks.filter((t) => t.albumId === albumIds);
        items = items.concat(tracks.map(trackDto));
      }
      if (searchTerm) {
        items = items.filter((item) => (item.Name ?? '').toLowerCase().includes(searchTerm));
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
      return new Response(null, { status: 204 });
    }

    return notFound();
  };

  return { fetch: fetchFn };
}
