import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from '../http/fetch.js';
import { type Recording, recordingSchema } from '../http/recording.js';
import { replayFetch } from '../http/replay.js';
import { openDatabase } from '../../store/connection.js';
import { spotifyTrackCache } from '../../store/spotifyTracks.js';
import {
  SPOTIFY_BUSY_WAIT_MS,
  SPOTIFY_GAP_MS,
  SPOTIFY_TOKEN_MARGIN_MS,
  SpotifyClient,
  type SpotifyTrackCache,
  SpotifyError,
} from './client.js';
import { NOT_A_SPOTIFY_PLAYLIST, spotifyPlaylistId } from './link.js';
import {
  ANONYMOUS_TOKEN,
  MISSING_PLAYLIST,
  MISSING_TRACK,
  RECORDED_PLAYLIST,
} from '../record-spotify.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'recordings');
const all: Recording[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
const byCall = (call: string) => all.find((r) => r.call === call)!;
const spotifyRecordings = all.filter((r) => r.call !== 'webapi-429');
const tracks = all
  .filter((r) => r.call.startsWith('track-'))
  .sort((a, b) => (a.call < b.call ? -1 : 1));

/** The recorded token's expiry, from the embed page. */
const expiresAt = Number(
  /accessTokenExpirationTimestampMs\\?":(\d+)/.exec(
    JSON.stringify(byCall('embed-playlist').response.body),
  )?.[1],
);

function fakeClock(start = expiresAt - 10 * 60_000) {
  const clock = { at: start, slept: [] as number[] };
  return {
    clock,
    now: () => clock.at,
    sleep: async (ms: number) => {
      clock.slept.push(ms);
      clock.at += ms;
    },
  };
}

function setUp(options: { fetch?: FetchLike; cache?: SpotifyTrackCache; start?: number } = {}) {
  const asked: { path: string; at: number; authorization: string | null }[] = [];
  const time = fakeClock(options.start);
  const replay = options.fetch ?? replayFetch(spotifyRecordings);
  const fetch: FetchLike = async (url, init) => {
    asked.push({
      path: new URL(url).pathname + new URL(url).search,
      at: time.clock.at,
      authorization: new Headers(init?.headers).get('authorization'),
    });
    return replay(url, init);
  };
  const lines: string[] = [];
  const client = new SpotifyClient({
    embedUrl: 'http://upstream.invalid',
    spclientUrl: 'http://upstream.invalid',
    fetch,
    clock: { now: time.now, sleep: time.sleep },
    log: (line) => lines.push(line),
    ...(options.cache ? { cache: options.cache } : {}),
  });
  return { client, asked, clock: time.clock, lines };
}

const ID = RECORDED_PLAYLIST;

describe('[M3.spotify] a pasted Spotify playlist link', () => {
  it.each([
    `https://open.spotify.com/playlist/${ID}`,
    `https://open.spotify.com/playlist/${ID}?si=abc123&pt=x`,
    `https://open.spotify.com/intl-fi/playlist/${ID}`,
    `https://open.spotify.com/intl-pt-br/playlist/${ID}/`,
    `  spotify:playlist:${ID} `,
    `open.spotify.com/playlist/${ID}`.replace(/^/, 'https://'),
  ])('names the playlist: %s', (link) => {
    expect(spotifyPlaylistId(link)).toBe(ID);
  });

  it.each([
    `https://open.spotify.com/album/${ID}`,
    `https://open.spotify.com/track/${ID}`,
    `https://evil.example/playlist/${ID}`,
    `https://open.spotify.com.evil.example/playlist/${ID}`,
    `spotify:playlist:${ID.slice(1)}`,
    `https://open.spotify.com/playlist/${ID}extra`,
    'take on me a-ha',
    '',
  ])('names none: %s', (text) => {
    expect(spotifyPlaylistId(text)).toBeNull();
  });

  it('a route refuses such text with one code', () => {
    expect(NOT_A_SPOTIFY_PLAYLIST).toBe('not_a_spotify_playlist');
  });
});

describe('[M3.spotify] the Spotify reader, on recorded answers', () => {
  it("gives the playlist's name and cover from its embed page", async () => {
    const { client } = setUp();
    expect(await client.playlistHeader(ID)).toEqual({
      name: 'All Out 80s',
      cover: expect.stringMatching(/^https:\/\/i\.scdn\.co\/image\/\w+$/) as unknown,
    });
  });

  it("reads the whole order in two pages, in Spotify's order, past the embed page's 100", async () => {
    const { client, asked } = setUp();
    const playlist = await client.playlist(ID);
    const recordedUris = [byCall('order-page-1'), byCall('order-page-2')].flatMap((r) =>
      (
        r.response.body as { json: { contents: { items: { uri: string }[] } } }
      ).json.contents.items.map((i) => i.uri),
    );
    expect(playlist.length).toBe(150);
    expect(playlist.entries).toHaveLength(150);
    expect(playlist.entries.map((e) => e.uri)).toEqual(recordedUris);
    expect(playlist.entries.map((e) => e.position)).toEqual([...Array(150).keys()]);
    expect(playlist.entries.every((e) => e.kind === 'track')).toBe(true);
    expect(asked.map((a) => a.path)).toEqual([
      `/embed/playlist/${ID}`,
      `/playlist/v2/playlist/${ID}?from=0&length=100`,
      `/playlist/v2/playlist/${ID}?from=100&length=100`,
    ]);
  });

  it("gives a track's title, artists, album, length and ISRC", async () => {
    const { client } = setUp();
    const playlist = await client.playlist(ID);
    const first = playlist.entries[0]!;
    expect(first.kind).toBe('track');
    expect(await client.track((first as { id: string }).id)).toEqual({
      title: 'Thriller',
      artists: ['Michael Jackson'],
      album: 'Thriller',
      durationMs: 358807,
      isrc: 'USSM19902989',
    });
  });

  it('reads every recorded track, each with a title, an artist and a length', async () => {
    const { client } = setUp();
    const playlist = await client.playlist(ID);
    const read = [];
    for (const entry of playlist.entries) {
      if (entry.kind === 'track') read.push(await client.track(entry.id));
    }
    expect(read).toHaveLength(tracks.length);
    for (const t of read) {
      expect(t?.title.length).toBeGreaterThan(0);
      expect(t?.artists.length).toBeGreaterThan(0);
      expect(t?.durationMs).toBeGreaterThan(0);
    }
    expect(read.filter((t) => t?.isrc).length).toBe(read.length);
  });

  it('answers null for a track Spotify has no metadata for', async () => {
    const { client } = setUp();
    await client.playlistHeader(ID);
    expect(await client.track(MISSING_TRACK)).toBeNull();
  });

  it('a playlist that does not exist is 404 playlist_not_found', async () => {
    const { client } = setUp();
    const error = await client.playlist(MISSING_PLAYLIST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpotifyError);
    expect(error).toMatchObject({ code: 'playlist_not_found', status: 404 });
  });

  it('starts each call at least 1 s after the last one ended', async () => {
    const { client, asked } = setUp();
    const playlist = await client.playlist(ID);
    for (const e of playlist.entries.slice(0, 5)) if (e.kind === 'track') await client.track(e.id);
    for (let n = 1; n < asked.length; n += 1) {
      expect(asked[n]!.at - asked[n - 1]!.at).toBeGreaterThanOrEqual(SPOTIFY_GAP_MS);
    }
  });

  it('runs calls asked at once one at a time, in the order asked', async () => {
    const { client, asked } = setUp();
    const playlist = await client.playlist(ID);
    const ids = playlist.entries.slice(0, 3).map((e) => (e as { id: string }).id);
    asked.length = 0;
    await Promise.all(ids.map((id) => client.track(id)));
    expect(asked).toHaveLength(3);
    expect(asked[1]!.at - asked[0]!.at).toBeGreaterThanOrEqual(SPOTIFY_GAP_MS);
    expect(asked[2]!.at - asked[1]!.at).toBeGreaterThanOrEqual(SPOTIFY_GAP_MS);
  });

  it('fetches the embed page again when under a minute of the token is left', async () => {
    const { client, asked, clock } = setUp();
    const playlist = await client.playlist(ID);
    const embeds = () => asked.filter((a) => a.path.startsWith('/embed/')).length;
    expect(embeds()).toBe(1);
    clock.at = expiresAt - SPOTIFY_TOKEN_MARGIN_MS + 1;
    await client.track((playlist.entries[0] as { id: string }).id);
    expect(embeds()).toBe(2);
    expect(asked.at(-2)!.path).toBe(`/embed/playlist/${ID}`);
  });

  it('a kept track asks nothing', async () => {
    const db = openDatabase(':memory:');
    const time = { now: () => expiresAt - 10 * 60_000 };
    const cache = spotifyTrackCache(db, time);
    const first = setUp({ cache });
    const playlist = await first.client.playlist(ID);
    const id = (playlist.entries[0] as { id: string }).id;
    const read = await first.client.track(id);
    const second = setUp({ cache });
    expect(await second.client.track(id)).toEqual(read);
    expect(second.asked).toEqual([]);
  });

  it('a track kept over 30 days ago is asked again', async () => {
    const db = openDatabase(':memory:');
    const time = { at: expiresAt - 10 * 60_000 };
    const cache = spotifyTrackCache(db, { now: () => time.at });
    const first = setUp({ cache });
    const playlist = await first.client.playlist(ID);
    const id = (playlist.entries[0] as { id: string }).id;
    await first.client.track(id);
    time.at += 31 * 24 * 60 * 60 * 1000;
    expect(cache.get(id)).toBeUndefined();
  });
});

describe('[M3.spotify] a busy Spotify, from the recorded 429', () => {
  const busy = byCall('webapi-429');
  /** Serves the recorded 429 for the order `times` times, then the recordings. */
  function busyFor(times: number): FetchLike {
    const replay = replayFetch(spotifyRecordings);
    let left = times;
    return async (url, init) => {
      if (url.includes('/playlist/v2/') && left > 0) {
        left -= 1;
        return new Response(JSON.stringify((busy.response.body as { json: unknown }).json), {
          status: busy.response.status,
          headers: busy.response.headers,
        });
      }
      return replay(url, init);
    };
  }

  it('waits for Retry-After and goes on, holding rather than failing', async () => {
    const { client, clock, lines } = setUp({ fetch: busyFor(2) });
    const playlist = await client.playlist(ID);
    expect(playlist.entries).toHaveLength(150);
    const retryAfter = Number(busy.response.headers['retry-after']) * 1000;
    expect(clock.slept.filter((ms) => ms === retryAfter)).toHaveLength(2);
    expect(lines).toHaveLength(2);
  });

  it('waits 60 s when no Retry-After is named', async () => {
    const replay = replayFetch(spotifyRecordings);
    let left = 1;
    const fetch: FetchLike = async (url, init) => {
      if (url.includes('/playlist/v2/') && left-- > 0) return new Response('{}', { status: 429 });
      return replay(url, init);
    };
    const { client, clock } = setUp({ fetch });
    await client.playlist(ID);
    expect(clock.slept).toContain(SPOTIFY_BUSY_WAIT_MS);
  });

  it('stops with spotify_unavailable at the third 429 in a row', async () => {
    const { client } = setUp({ fetch: busyFor(3) });
    const error = await client.playlist(ID).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'spotify_unavailable' });
  });
});

describe('[M3.spotify] the anonymous token stays inside the reader', () => {
  /** The embed recording with a token of the live shape put back in, as Spotify sends it. */
  const TOKEN = 'BQ' + 'x7Kp2mN9qR4tV8wY1zA3cE5gH6jL0'.repeat(4) + 'Zz';
  const withToken: FetchLike = async (url, init) => {
    const replay = replayFetch(spotifyRecordings);
    const response = await replay(url, init);
    if (!url.includes('/embed/')) return response;
    const text = (await response.text()).replace(ANONYMOUS_TOKEN, TOKEN);
    return new Response(text, { status: response.status, headers: response.headers });
  };

  it('sends it only as the bearer of spclient calls, never to the embed page', async () => {
    const { client, asked } = setUp({ fetch: withToken });
    await client.playlist(ID);
    expect(asked[0]!.authorization).toBeNull();
    expect(asked[1]!.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('never names it in an error, a log line or JSON.stringify of the client', async () => {
    const replayed = withToken;
    let busy = 1;
    let fail = false;
    const fetch: FetchLike = async (url, init) => {
      if (url.includes('/playlist/v2/') && busy-- > 0) return new Response('{}', { status: 429 });
      if (fail && url.includes('/metadata/')) {
        return new Response('{"not":"a track"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return replayed(url, init);
    };
    const { client, lines } = setUp({ fetch });
    const playlist = await client.playlist(ID);
    fail = true;
    const error = await client
      .track((playlist.entries[0] as { id: string }).id)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const said = [
      String(error),
      (error as Error).stack ?? '',
      JSON.stringify(error),
      ...lines,
      JSON.stringify(client),
    ].join('\n');
    expect(said).not.toContain(TOKEN);
    expect(said).not.toContain(TOKEN.slice(10, 40));
  });
});
