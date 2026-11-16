/**
 * Search's playlist row through the real routes: a pasted Spotify playlist link answers the recorded
 * playlist (All Out 80s, 150 tracks) from its recorded embed page and first page of its order, on a
 * fake clock so Spotify's 1 s gap takes no time. A cover's bytes are a stand-in, as Spotify's image
 * host was not recorded.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SearchResults } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from './adapters/musicbrainz/client.js';
import { RECORDED_PLAYLIST } from './adapters/record-spotify.js';
import { SpotifyClient } from './adapters/spotify/client.js';
import { buildApp } from './app.js';
import { albumCatalogue } from './requests/albums/catalogue.js';
import { standInSteps } from './adapters/http/standIn.js';
import { stepsRegistry } from './requests/steps.js';
import { openDatabase } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { upsertUser } from './store/users.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'adapters', 'spotify', 'recordings');
const recordings = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
const embed = recordings.find((r) => r.call === 'embed-playlist')!;
const expiresAt = Number(
  /accessTokenExpirationTimestampMs\\?":(\d+)/.exec(JSON.stringify(embed.response))?.[1],
);
/** The recorded cover, `https://i.scdn.co/image/<IMAGE>`. */
const IMAGE = /i\.scdn\.co\/image\/([0-9a-f]{40})/.exec(JSON.stringify(embed.response))![1]!;
const COVER = Buffer.from('a playlist cover');
const LINK = `https://open.spotify.com/intl-fi/playlist/${RECORDED_PLAYLIST}?si=0123abcd`;
const T0 = Date.UTC(2026, 10, 16, 8);
const MINUTE = 60_000;

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

/** The recorded Spotify, its image host a stand-in, every call counted; `down` refuses them all. */
function spotifyUpstream(options: { down?: boolean } = {}) {
  const asked: string[] = [];
  const replay = replayFetch(recordings);
  let at = expiresAt - 10 * MINUTE;
  const fetch: FetchLike = async (url, init) => {
    asked.push(url);
    if (options.down === true) throw new TypeError('connection refused');
    if (new URL(url).hostname === 'images.invalid') {
      return new URL(url).pathname === `/image/${IMAGE}`
        ? new Response(COVER, { headers: { 'content-type': 'image/jpeg' } })
        : new Response(null, { status: 404 });
    }
    return replay(url, init);
  };
  const spotify = new SpotifyClient({
    embedUrl: 'http://upstream.invalid',
    spclientUrl: 'http://upstream.invalid',
    imageUrl: 'http://images.invalid',
    fetch,
    clock: {
      now: () => at,
      sleep: async (ms) => {
        at += ms;
      },
    },
  });
  return { spotify, asked };
}

async function server(options: { down?: boolean; importing?: boolean; streaming?: boolean } = {}) {
  const upstream = spotifyUpstream(options);
  const musicBrainzAsked: string[] = [];
  const musicBrainz = new MusicBrainzClient({
    baseUrl: 'http://upstream.invalid',
    fetch: async (url) => {
      musicBrainzAsked.push(url);
      throw new TypeError('connection refused');
    },
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock: { now: () => 0, sleep: async () => undefined },
  });
  let now = T0;
  const db = openDatabase(':memory:');
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: {
      key: Buffer.alloc(32, 7),
      config: { absUrl: undefined, jellyfinUrl: undefined },
      fetch: replayFetch([]),
    },
    now: () => now,
    logger: false,
    albumCatalogue: albumCatalogue({
      musicBrainz,
      coverArt: null,
      now: () => now,
      log: { error: () => undefined },
    }),
    requests: {
      steps: stepsRegistry([standInSteps('album')]),
      everyMs: 3_600_000,
      notIndexedAfterMs: 60_000,
      stepTimeoutMs: 0,
      stallAfterMs: 60_000,
      holdAfterMs: 60_000,
    },
    ...(options.importing === false
      ? {}
      : {
          spotifyImport: {
            spotify: upstream.spotify,
            search: async () => [],
            available: () => options.streaming !== false,
          },
        }),
  });
  apps.push(app);
  const user = upsertUser(db, { username: 'kara', role: 'member' });
  const device = createDevice(db, { userId: user.id, kind: 'web' });
  const { token } = createSession(db, { userId: user.id, deviceId: device.id, kind: 'bearer' });
  const headers = { authorization: `Bearer ${token}` };
  const search = async (q: string) => {
    const answer = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent(q)}`,
      headers,
    });
    expect(answer.statusCode).toBe(200);
    return SearchResults.parse(answer.json());
  };
  return {
    app,
    headers,
    search,
    spotifyAsked: upstream.asked,
    musicBrainzAsked,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe('[M3.spotify] a pasted Spotify playlist link in Search', () => {
  it('answers the one playlist row: its name, its song count, its cover and the link to import', async () => {
    const { search, spotifyAsked } = await server();
    const found = await search(LINK);
    expect(found.playlists).toEqual([
      {
        from: `https://open.spotify.com/playlist/${RECORDED_PLAYLIST}`,
        name: 'All Out 80s',
        count: 150,
        art: `/api/search/playlists/${IMAGE}/art`,
      },
    ]);
    expect(spotifyAsked.map((url) => new URL(url).pathname)).toEqual([
      `/embed/playlist/${RECORDED_PLAYLIST}`,
      `/playlist/v2/playlist/${RECORDED_PLAYLIST}`,
    ]);
  });

  it('searches nothing else for a link: no library results, no catalogue asked', async () => {
    const { search, musicBrainzAsked } = await server();
    const found = await search(`spotify:playlist:${RECORDED_PLAYLIST}`);
    expect(found.playlists).toHaveLength(1);
    expect(found).toMatchObject({ results: [], books: [], albums: [], songs: [] });
    expect(musicBrainzAsked).toEqual([]);
  });

  it('asks Spotify nothing for the same playlist again within 10 minutes, and asks again after', async () => {
    const { search, spotifyAsked, later } = await server();
    await search(LINK);
    later(9 * MINUTE);
    expect((await search(`spotify:playlist:${RECORDED_PLAYLIST}`)).playlists).toHaveLength(1);
    expect(spotifyAsked).toHaveLength(2);
    later(2 * MINUTE);
    expect((await search(LINK)).playlists).toHaveLength(1);
    expect(spotifyAsked).toHaveLength(4);
  });

  it('answers no row, never a failed search, while Spotify does not answer', async () => {
    const { search, spotifyAsked } = await server({ down: true });
    const found = await search(LINK);
    expect(found.playlists).toEqual([]);
    expect(spotifyAsked.length).toBeGreaterThan(0);
  });

  it('never asks Spotify for a query that is not a playlist link', async () => {
    const { search, spotifyAsked } = await server();
    for (const q of [
      'all out 80s',
      `https://open.spotify.com/album/${RECORDED_PLAYLIST}`,
      `spotify:track:${RECORDED_PLAYLIST}`,
    ]) {
      expect((await search(q)).playlists).toEqual([]);
    }
    expect(spotifyAsked).toEqual([]);
  });

  it('lists no row and asks nothing while a playlist cannot be imported', async () => {
    for (const off of [{ importing: false }, { streaming: false }]) {
      const { search, spotifyAsked } = await server(off);
      expect((await search(LINK)).playlists).toEqual([]);
      expect(spotifyAsked).toEqual([]);
    }
  });

  it('serves the row’s cover from Spotify’s image host by its image id, and 404 for one it lacks', async () => {
    const { app, headers, spotifyAsked } = await server();
    const art = await app.inject({
      method: 'GET',
      url: `/api/search/playlists/${IMAGE}/art`,
      headers,
    });
    expect(art.statusCode).toBe(200);
    expect(art.headers['content-type']).toBe('image/jpeg');
    expect(art.rawPayload).toEqual(COVER);
    const none = await app.inject({
      method: 'GET',
      url: `/api/search/playlists/${'0'.repeat(40)}/art`,
      headers,
    });
    expect(none.statusCode).toBe(404);
    const notAnId = await app.inject({
      method: 'GET',
      url: '/api/search/playlists/..%2Fevil/art',
      headers,
    });
    expect(notAnId.statusCode).toBe(400);
    expect(spotifyAsked.map((url) => new URL(url).host)).toEqual([
      'images.invalid',
      'images.invalid',
    ]);
  });
});
