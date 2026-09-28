import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AbsClient } from './audiobookshelf/client.js';
import { type Recording, recordingSchema } from './http/recording.js';
import { replayFetch } from './http/replay.js';
import { JellyfinClient } from './jellyfin/client.js';

const adapters = dirname(fileURLToPath(import.meta.url));

function recording(upstream: string, call: string): Recording {
  const file = join(adapters, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

const ABS_CALLS = {
  'library-list': { method: 'GET', path: /^\/api\/libraries$/ },
  'item-detail': { method: 'GET', path: /^\/api\/items\/[^/]+$/ },
  'item-play': { method: 'POST', path: /^\/api\/items\/[^/]+\/play$/ },
  'session-close': { method: 'POST', path: /^\/api\/session\/[^/]+\/close$/ },
} as const;

const abs = Object.fromEntries(
  Object.keys(ABS_CALLS).map((call) => [call, recording('audiobookshelf', call)]),
) as Record<keyof typeof ABS_CALLS, Recording>;

function json(body: Recording['request']['body']): Record<string, unknown> {
  if (body === null || !('json' in body)) throw new Error('expected a JSON body');
  return body.json as Record<string, unknown>;
}

const itemId = (r: Recording) => (r.request.path.split('/')[3] ?? '') as string;

const absClient = () =>
  new AbsClient({
    baseUrl: 'http://upstream.invalid',
    token: '<token>',
    fetch: replayFetch(Object.values(abs)),
  });

describe("[M0.record/b] Audiobookshelf's recordings from mediaserver", () => {
  it("[M0.record/b] recordings from mediaserver exist for Audiobookshelf's library list, item detail and play", () => {
    for (const [call, { method, path }] of Object.entries(ABS_CALLS)) {
      const r = abs[call as keyof typeof ABS_CALLS];
      expect(r.upstream, call).toBe('audiobookshelf');
      expect(r.call, call).toBe(call);
      expect(r.upstreamVersion, call).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.request.method, call).toBe(method);
      expect(r.request.path, call).toMatch(path);
      expect(r.response.status, call).toBe(200);
    }
  });

  it('[M0.record/b] each recorded Audiobookshelf call parses through the client', async () => {
    const client = absClient();
    const libraries = await client.getLibraries();
    expect(libraries.map((l) => l.mediaType)).toContain('book');

    const item = await client.getItem(itemId(abs['item-detail']));
    expect(item.mediaType).toBe('book');

    const deviceInfo = json(abs['item-play'].request.body).deviceInfo as {
      deviceId: string;
      clientVersion: string;
    };
    const session = await client.play(itemId(abs['item-play']), deviceInfo);
    expect(session.audioTracks.length).toBeGreaterThan(0);

    await expect(client.closeSession(session.id)).resolves.toBeUndefined();
  });

  it('[M0.record/b] the recorded play call asked for direct play and got it', () => {
    const request = json(abs['item-play'].request.body);
    expect(request.forceDirectPlay).toBe(true);
    expect(request.supportedMimeTypes).toEqual(expect.arrayContaining([expect.any(String)]));

    const session = json(abs['item-play'].response.body);
    expect(session.playMethod).toBe(0);
    const tracks = session.audioTracks as { contentUrl: string; metadata: unknown }[];
    for (const track of tracks) {
      expect(track.contentUrl).toMatch(/^\/api\/items\/[^/]+\/file\/\d+$/);
      expect(track.metadata).not.toBeNull();
    }
  });

  it('[M0.record/b] the recorded play session is the one the recording closed', () => {
    const sessionId = json(abs['item-play'].response.body).id as string;
    expect(abs['session-close'].request.path).toBe(`/api/session/${sessionId}/close`);
  });

  it('[M0.record/b] the recorded item is a book, never from the Podcasts library', () => {
    const libraries = json(abs['library-list'].response.body).libraries as {
      id: string;
      mediaType: string;
    }[];
    const item = json(abs['item-detail'].response.body) as { libraryId: string };
    const library = libraries.find((l) => l.id === item.libraryId);
    expect(library?.mediaType).toBe('book');
  });
});

const JELLYFIN_CALLS = {
  'library-list': { method: 'GET', path: /^\/Library\/MediaFolders$/ },
  'item-detail': { method: 'GET', path: /^\/Items\/[^/]+$/ },
} as const;

const jellyfin = Object.fromEntries(
  Object.keys(JELLYFIN_CALLS).map((call) => [call, recording('jellyfin', call)]),
) as Record<keyof typeof JELLYFIN_CALLS, Recording>;

describe("[M0.record/b] Jellyfin's recordings from mediaserver", () => {
  it("[M0.record/b] recordings from mediaserver exist for Jellyfin's library list and item detail", () => {
    for (const [call, { method, path }] of Object.entries(JELLYFIN_CALLS)) {
      const r = jellyfin[call as keyof typeof JELLYFIN_CALLS];
      expect(r.upstream, call).toBe('jellyfin');
      expect(r.call, call).toBe(call);
      expect(r.upstreamVersion, call).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.request.method, call).toBe(method);
      expect(r.request.path, call).toMatch(path);
      expect(r.response.status, call).toBe(200);
    }
  });

  it('[M0.record/b] each recorded Jellyfin call parses through the client', async () => {
    const client = new JellyfinClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch: replayFetch(Object.values(jellyfin)),
    });
    const libraries = await client.getLibraries();
    expect(libraries.map((l) => l.CollectionType)).toContain('music');

    const detail = jellyfin['item-detail'].request;
    const albumId = detail.path.split('/')[2] ?? '';
    const album = await client.getItem(albumId, detail.query.userId);
    expect(album.Id).toBe(albumId);
    expect(album.Type).toBe('MusicAlbum');
  });
});
