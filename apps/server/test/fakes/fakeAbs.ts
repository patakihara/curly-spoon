/**
 * A fixture-backed, in-memory fake of the Audiobookshelf REST API.
 *
 * It is shaped as a `fetch`-compatible function (matching `@auralis/abs-client`'s
 * `FetchLike`) rather than a bound HTTP server: `AbsClient` takes its `fetch`
 * injected, so wiring this in requires no real socket, no port, and no cleanup —
 * useful in tests, and equally usable as the whole app's dev-mode upstream via
 * `AURALIS_FAKE_UPSTREAMS=1` (see plugins/absUpstream.ts).
 */

import { randomBytes } from 'node:crypto';
import type { FetchLike } from '@auralis/abs-client';
import librariesFixture from './fixtures/libraries.json' with { type: 'json' };
import booksFixture from './fixtures/items-books.json' with { type: 'json' };
import podcastsFixture from './fixtures/items-podcasts.json' with { type: 'json' };
import shelvesFixture from './fixtures/shelves.json' with { type: 'json' };
import seriesFixture from './fixtures/series.json' with { type: 'json' };
import collectionsFixture from './fixtures/collections.json' with { type: 'json' };
import playlistsFixture from './fixtures/playlists.json' with { type: 'json' };
import authorsFixture from './fixtures/authors.json' with { type: 'json' };
import filterDataFixture from './fixtures/filterdata.json' with { type: 'json' };
import usersFixture from './fixtures/users.json' with { type: 'json' };
import { serveRangeableBytes } from './rangeBytes.js';

/** The only host this fake answers for — anything else simulates a DNS/connection failure. */
export const FAKE_BASE_URL = 'http://fake.abs.local';
export const FAKE_CREDENTIALS = { username: 'kara', password: 'hunter2' };
export const FAKE_ITEM_IDS = { dune: 'item-dune', fellowship: 'item-fellowship', hobbit: 'item-hobbit' };
export const FAKE_PODCAST_ITEM_ID = 'item-dailytech';

// -----------------------------------------------------------------------------
// Fixture types (loose — this is test data, not something we need strict about)
// -----------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

const booksById = new Map<string, JsonRecord>(
  (booksFixture as JsonRecord[]).map((item) => [item.id as string, item]),
);
const podcastsById = new Map<string, JsonRecord>(
  (podcastsFixture as JsonRecord[]).map((item) => [item.id as string, item]),
);

function findItem(id: string): JsonRecord | undefined {
  return booksById.get(id) ?? podcastsById.get(id);
}

// Deterministic audio bytes per file id, sized loosely after each track's duration.
const AUDIO_FILES: Record<string, { size: number; mimeType: string }> = {
  'file-dune-1': { size: 6300, mimeType: 'audio/mp4' },
  'file-dune-2': { size: 6300, mimeType: 'audio/mp4' },
  'file-fellowship-1': { size: 7200, mimeType: 'audio/mp4' },
  'file-hobbit-1': { size: 6600, mimeType: 'audio/mp4' },
  'file-dailytech-ep1': { size: 3000, mimeType: 'audio/mpeg' },
  'file-dailytech-ep2': { size: 3600, mimeType: 'audio/mpeg' },
};

function generateBytes(size: number, seed: number): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) buf[i] = (i + seed) % 256;
  return buf;
}

const audioBuffers = new Map<string, Uint8Array>(
  Object.entries(AUDIO_FILES).map(([fileId, meta], index) => [
    fileId,
    generateBytes(meta.size, index * 7),
  ]),
);

function stripToMinified(item: JsonRecord): JsonRecord {
  const media = item.media as JsonRecord;
  const { tracks: _tracks, chapters: _chapters, episodes: _episodes, ...minifiedMedia } = media;
  return { ...item, media: minifiedMedia };
}

function withProgress(item: JsonRecord, progress: JsonRecord | undefined): JsonRecord {
  return progress ? { ...item, userMediaProgress: progress } : item;
}

// -----------------------------------------------------------------------------
// Mutable server-side state
// -----------------------------------------------------------------------------

interface ProgressRecord extends JsonRecord {
  id: string;
  libraryItemId: string;
  episodeId: string | null;
  duration: number;
  currentTime: number;
  progress: number;
  isFinished: boolean;
  lastUpdate: number;
  startedAt: number | null;
  finishedAt: number | null;
}

interface SessionRecord {
  id: string;
  libraryItemId: string;
  episodeId: string | null;
  mediaType: 'book' | 'podcast';
  currentTime: number;
  duration: number;
}

export interface FakeAbsUpstream {
  fetch: FetchLike;
  /** Directly inspect what the fake currently thinks a session's `currentTime` is — used by sync tests. */
  getSessionCurrentTime(sessionId: string): number | undefined;
}

export function createFakeAbsUpstream(): FakeAbsUpstream {
  const users = usersFixture as Array<{
    id: string;
    username: string;
    password: string;
    permissions: Record<string, boolean>;
    defaultLibraryId: string;
  }>;
  const tokens = new Map<string, string>(); // token -> userId
  const progressByKey = new Map<string, ProgressRecord>(); // `${userId}:${itemId}:${episodeId ?? ''}`
  const bookmarksByUser = new Map<string, JsonRecord[]>();
  const sessions = new Map<string, SessionRecord>();
  let sessionSeq = 0;

  function progressKey(userId: string, itemId: string, episodeId?: string): string {
    return `${userId}:${itemId}:${episodeId ?? ''}`;
  }

  function userFromAuth(headers: Headers): { id: string; username: string; permissions: Record<string, boolean> } | null {
    const auth = headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    const token = auth.slice('Bearer '.length);
    const userId = tokens.get(token);
    if (!userId) return null;
    const user = users.find((u) => u.id === userId);
    return user ? { id: user.id, username: user.username, permissions: user.permissions } : null;
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function unauthorized(): Response {
    return json({ error: 'Unauthorized' }, 401);
  }

  function notFound(): Response {
    return json({ error: 'Not found' }, 404);
  }

  const fetchFn: FetchLike = async (input, init) => {
    const url = new URL(input);

    // Simulate a real DNS/connection failure for any host other than the fake's own —
    // this is what makes an "unreachable server" test against a bad setup URL meaningful.
    if (url.origin !== FAKE_BASE_URL) {
      throw new Error(`getaddrinfo ENOTFOUND ${url.hostname}`);
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);
    const body = (): JsonRecord => (init?.body ? (JSON.parse(String(init.body)) as JsonRecord) : {});

    // ---- Unauthenticated ----
    if (method === 'GET' && path === '/status') {
      return json({ isInit: true, version: 'fake-2.99.0', language: 'en-us' });
    }

    if (method === 'POST' && path === '/login') {
      const { username, password } = body() as { username?: string; password?: string };
      const user = users.find((u) => u.username === username && u.password === password);
      if (!user) return json({ error: 'Invalid username or password' }, 401);
      const token = randomBytes(16).toString('hex');
      tokens.set(token, user.id);
      return json({
        user: {
          id: user.id,
          username: user.username,
          token,
          permissions: user.permissions,
          mediaProgress: [],
          bookmarks: bookmarksByUser.get(user.id) ?? [],
        },
        userDefaultLibraryId: user.defaultLibraryId,
      });
    }

    // Everything else requires a bearer token.
    const user = userFromAuth(headers);
    if (!user) return unauthorized();

    if (method === 'GET' && path === '/api/libraries') {
      return json(librariesFixture);
    }

    // /api/libraries/:id/*
    if (parts[0] === 'api' && parts[1] === 'libraries' && parts[2]) {
      const libraryId = parts[2];
      const sub = parts[3];

      if (method === 'GET' && sub === 'items' && parts.length === 4) {
        const catalog = libraryId === 'lib-podcasts' ? podcastsFixture : booksFixture;
        const minified = url.searchParams.get('minified') !== '0';
        const limit = Number(url.searchParams.get('limit') ?? catalog.length);
        const page = Number(url.searchParams.get('page') ?? 0);
        const items = (catalog as JsonRecord[]).slice(page * limit, page * limit + limit);
        return json({
          results: minified ? items.map(stripToMinified) : items,
          total: catalog.length,
          limit,
          page,
        });
      }

      if (method === 'GET' && sub === 'personalized') {
        const shelves = (shelvesFixture as Record<string, Array<JsonRecord & { entityIds: string[] }>>)[
          libraryId
        ] ?? [];
        return json(
          shelves.map((shelf) => ({
            id: shelf.id,
            label: shelf.label,
            type: shelf.type,
            entities: shelf.entityIds
              .map((id) => findItem(id))
              .filter((item): item is JsonRecord => item !== undefined)
              .map(stripToMinified),
          })),
        );
      }

      if (method === 'GET' && sub === 'series') {
        const list = (seriesFixture as Record<string, Array<JsonRecord & { bookIds: string[] }>>)[
          libraryId
        ] ?? [];
        return json({
          results: list.map((series) => ({
            id: series.id,
            name: series.name,
            description: series.description,
            books: series.bookIds.map((id) => stripToMinified(findItem(id)!)),
          })),
          total: list.length,
        });
      }

      if (method === 'GET' && sub === 'collections') {
        const list = (collectionsFixture as Record<string, Array<JsonRecord & { bookIds: string[] }>>)[
          libraryId
        ] ?? [];
        return json({
          collections: list.map((collection) => ({
            id: collection.id,
            name: collection.name,
            description: collection.description,
            books: collection.bookIds.map((id) => stripToMinified(findItem(id)!)),
          })),
        });
      }

      if (method === 'GET' && sub === 'playlists') {
        const list = (playlistsFixture as Record<string, JsonRecord[]>)[libraryId] ?? [];
        return json({ playlists: list });
      }

      if (method === 'GET' && sub === 'authors') {
        const list = (authorsFixture as Record<string, JsonRecord[]>)[libraryId] ?? [];
        return json({ authors: list });
      }

      if (method === 'GET' && sub === 'filterdata') {
        const data = (filterDataFixture as Record<string, JsonRecord>)[libraryId] ?? {};
        return json(data);
      }

      if (method === 'GET' && sub === 'search') {
        const q = (url.searchParams.get('q') ?? '').toLowerCase();
        const catalog = libraryId === 'lib-podcasts' ? podcastsFixture : booksFixture;
        const matches = (catalog as JsonRecord[]).filter((item) => {
          const metadata = (item.media as JsonRecord).metadata as JsonRecord;
          const title = String(metadata.title ?? '').toLowerCase();
          return title.includes(q);
        });
        const key = libraryId === 'lib-podcasts' ? 'podcast' : 'book';
        return json({ [key]: matches.map((item) => ({ libraryItem: stripToMinified(item) })) });
      }
    }

    // /api/items/:id...
    if (parts[0] === 'api' && parts[1] === 'items' && parts[2]) {
      const itemId = parts[2];
      const item = findItem(itemId);

      if (parts.length === 3 && method === 'GET') {
        if (!item) return notFound();
        const expanded = url.searchParams.get('expanded') === '1';
        const includeProgress = url.searchParams.get('include') === 'progress';
        const shaped = expanded ? item : stripToMinified(item);
        const progress = includeProgress ? progressByKey.get(progressKey(user.id, itemId)) : undefined;
        return json(withProgress(shaped, progress));
      }

      if (parts[3] === 'cover' && method === 'GET') {
        const bytes = generateBytes(2048, 1);
        return new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      }

      if (parts[3] === 'file' && parts[4] && (method === 'GET' || method === 'HEAD')) {
        const fileId = parts[4];
        const buffer = audioBuffers.get(fileId);
        if (!buffer) return notFound();
        const meta = AUDIO_FILES[fileId]!;
        const result = serveRangeableBytes(buffer, headers.get('range') ?? undefined, meta.mimeType);
        return new Response(method === 'HEAD' ? null : result.body, {
          status: result.status,
          headers: result.headers,
        });
      }

      if (parts[3] === 'play' && method === 'POST') {
        if (!item) return notFound();
        const episodeId = parts[4];
        sessionSeq += 1;
        const sessionId = `sess-${sessionSeq}`;
        const media = item.media as JsonRecord;

        if (episodeId) {
          const episode = (media.episodes as JsonRecord[] | undefined)?.find((e) => e.id === episodeId);
          if (!episode) return notFound();
          const track = episode.audioTrack as JsonRecord;
          sessions.set(sessionId, {
            id: sessionId,
            libraryItemId: itemId,
            episodeId,
            mediaType: 'podcast',
            currentTime: 0,
            duration: episode.duration as number,
          });
          return json({
            id: sessionId,
            libraryItemId: itemId,
            episodeId,
            mediaType: 'podcast',
            displayTitle: episode.title,
            duration: episode.duration,
            currentTime: 0,
            audioTracks: [track],
            chapters: [],
          });
        }

        sessions.set(sessionId, {
          id: sessionId,
          libraryItemId: itemId,
          episodeId: null,
          mediaType: 'book',
          currentTime: 0,
          duration: media.duration as number,
        });
        return json({
          id: sessionId,
          libraryItemId: itemId,
          episodeId: null,
          mediaType: 'book',
          displayTitle: (media.metadata as JsonRecord).title,
          duration: media.duration,
          currentTime: 0,
          audioTracks: media.tracks,
          chapters: media.chapters,
        });
      }
    }

    // /api/session/:id/{sync,close}
    if (parts[0] === 'api' && parts[1] === 'session' && parts[2]) {
      const sessionId = parts[2];
      if (parts[3] === 'sync' && method === 'POST') {
        const session = sessions.get(sessionId);
        if (!session) return notFound();
        const { currentTime } = body() as { currentTime?: number };
        if (typeof currentTime === 'number') session.currentTime = currentTime;
        return json({ ok: true });
      }
      if (parts[3] === 'close' && method === 'POST') {
        if (!sessions.has(sessionId)) return notFound();
        sessions.delete(sessionId);
        return json({ ok: true });
      }
    }

    // /api/me...
    if (parts[0] === 'api' && parts[1] === 'me') {
      if (parts.length === 2 && method === 'GET') {
        const mediaProgress = [...progressByKey.values()].filter((p) =>
          p.id.startsWith(`${user.id}:`),
        );
        return json({
          id: user.id,
          username: user.username,
          permissions: user.permissions,
          mediaProgress,
          bookmarks: bookmarksByUser.get(user.id) ?? [],
        });
      }

      if (parts[2] === 'items-in-progress' && method === 'GET') {
        const items = [...progressByKey.entries()]
          .filter(([key]) => key.startsWith(`${user.id}:`))
          .map(([, progress]) => {
            const found = findItem(progress.libraryItemId);
            return found ? withProgress(stripToMinified(found), progress) : undefined;
          })
          .filter((item): item is JsonRecord => item !== undefined);
        return json({ libraryItems: items });
      }

      if (parts[2] === 'progress' && parts[3]) {
        const itemId = parts[3];
        const episodeId = parts[4];
        const key = progressKey(user.id, itemId, episodeId);

        if (method === 'GET') {
          const existing = progressByKey.get(key);
          return existing ? json(existing) : notFound();
        }

        if (method === 'PATCH') {
          const patch = body() as Partial<ProgressRecord>;
          const existing = progressByKey.get(key);
          const merged: ProgressRecord = {
            id: existing?.id ?? key,
            libraryItemId: itemId,
            episodeId: episodeId ?? null,
            duration: patch.duration ?? existing?.duration ?? 0,
            currentTime: patch.currentTime ?? existing?.currentTime ?? 0,
            progress: patch.progress ?? existing?.progress ?? 0,
            isFinished: patch.isFinished ?? existing?.isFinished ?? false,
            lastUpdate: Date.now(),
            startedAt: existing?.startedAt ?? Date.now(),
            finishedAt: patch.isFinished ? Date.now() : (existing?.finishedAt ?? null),
          };
          progressByKey.set(key, merged);
          return json(merged);
        }
      }

      if (parts[2] === 'item' && parts[3] && parts[4] === 'bookmark') {
        const itemId = parts[3];
        const list = bookmarksByUser.get(user.id) ?? [];

        if (method === 'POST') {
          const { time, title } = body() as { time: number; title: string };
          const bookmark = { libraryItemId: itemId, title, time, createdAt: Date.now() };
          bookmarksByUser.set(user.id, [...list, bookmark]);
          return json(bookmark);
        }

        if (method === 'PATCH') {
          const { time, title } = body() as { time: number; title: string };
          const updated = list.map((b) => ((b as JsonRecord).time === time ? { ...b, title } : b));
          bookmarksByUser.set(user.id, updated);
          const bookmark = updated.find((b) => (b as JsonRecord).time === time);
          return bookmark ? json(bookmark) : notFound();
        }

        if (method === 'DELETE' && parts[5]) {
          const time = Number(parts[5]);
          bookmarksByUser.set(
            user.id,
            list.filter((b) => (b as JsonRecord).time !== time),
          );
          return json({ ok: true });
        }
      }
    }

    return notFound();
  };

  return {
    fetch: fetchFn,
    getSessionCurrentTime: (sessionId) => sessions.get(sessionId)?.currentTime,
  };
}
