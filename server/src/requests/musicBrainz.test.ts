/**
 * The server's one MusicBrainz client: songs and albums are handed the same one, so their calls wait
 * in one queue, and together they never ask MusicBrainz more than once a second.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../adapters/http/fetch.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { type Clock, MUSICBRAINZ_GAP_MS } from '../adapters/musicbrainz/client.js';
import { loadConfig } from '../config.js';
import { openDatabase, type Db } from '../store/connection.js';
import { createRequest } from '../store/requests.js';
import { rememberTracks } from '../store/streamedTracks.js';
import { upsertUser } from '../store/users.js';
import { albumSteps } from './albums/index.js';
import { musicBrainzOf } from './musicBrainz.js';
import { songSteps } from './songs/index.js';

const recorded = (call: string) =>
  recordingSchema.parse(
    JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          '..',
          'adapters',
          'musicbrainz',
          'recordings',
          `${call}.json`,
        ),
        'utf8',
      ),
    ),
  );

let dir: string;
let db: Db;
let env: Record<string, string>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-musicbrainz-'));
  mkdirSync(join(dir, 'media/Music'), { recursive: true });
  const keys = join(dir, 'keys.env');
  writeFileSync(keys, 'PROWLARR_API_KEY=a-key\nQBITTORRENT_API_KEY=a-key\n');
  writeFileSync(join(dir, 'jellyfin.key'), 'a-key');
  env = {
    DATA_DIR: join(dir, 'data'),
    PROWLARR_URL: 'http://prowlarr.invalid',
    PROWLARR_API_KEY_FILE: keys,
    QBITTORRENT_URL: 'http://qbittorrent.invalid',
    QBITTORRENT_API_KEY_FILE: keys,
    QBITTORRENT_DOWNLOADS_PATH: '/data/Downloads',
    MEDIA_DIR: join(dir, 'media'),
    JELLYFIN_URL: 'http://jellyfin.invalid',
    JELLYFIN_API_KEY_FILE: join(dir, 'jellyfin.key'),
    MUSICBRAINZ_URL: 'http://musicbrainz.invalid',
    COVERART_URL: '',
  };
  db = openDatabase(':memory:');
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function fakeClock(): Clock {
  let now = 1_000_000;
  return {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  };
}

describe('[M3.albums] one MusicBrainz client for the whole server', () => {
  it('[M3.albums] is none with MusicBrainz switched off, which keeps albums off', () => {
    const config = loadConfig({ ...env, MUSICBRAINZ_URL: '' });
    const musicBrainz = musicBrainzOf(config, async () => new Response());
    expect(musicBrainz).toBeNull();
    const made = albumSteps(config, {
      db,
      fetch: async () => new Response(),
      log: { error: () => undefined },
      now: Date.now,
      people: () => [],
      musicBrainz,
    });
    expect(made).toEqual({ off: 'MUSICBRAINZ_URL' });
  });

  it("[M3.albums] a kept song's search and Search's album rows, asked at once, call MusicBrainz 1.1 s apart", async () => {
    const clock = fakeClock();
    const asked: { at: number; path: string }[] = [];
    const slip = replayFetch([recorded('rg-search-slip')]);
    const fetch: FetchLike = async (url, init) => {
      const path = new URL(url).pathname;
      asked.push({ at: clock.now(), path });
      if (path === '/ws/2/release-group') return slip(url, init);
      const none =
        path === '/ws/2/recording' ? { count: 0, recordings: [] } : { count: 0, releases: [] };
      return new Response(JSON.stringify(none), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const config = loadConfig(env);
    const musicBrainz = musicBrainzOf(config, fetch, clock);
    const albums = albumSteps(config, {
      db,
      fetch,
      log: { error: () => undefined },
      now: clock.now,
      people: () => [],
      musicBrainz,
    });
    const songs = songSteps(config, {
      db,
      fetch,
      log: { error: () => undefined },
      music: {
        open: () => Promise.reject(new Error('nothing streams here')),
        openArt: () => Promise.reject(new Error('no art here')),
      },
      wake: () => undefined,
      musicBrainz,
    });
    if (!('steps' in albums) || !('steps' in songs)) throw new Error('steps are off');

    const id = 'aaaaaaaaaaa';
    rememberTracks(
      db,
      [
        {
          id,
          title: 'Zqxv Plorb',
          artists: ['Nobody Atall'],
          album: 'Wendigast',
          duration: 180,
          artUrl: null,
        },
      ],
      clock.now(),
    );
    const user = upsertUser(db, { username: 'ana', role: 'member' }).id;
    const { request } = createRequest(
      db,
      user,
      { medium: 'song', target: { title: id, creator: null, ids: { youtubeMusicId: id } } },
      clock.now(),
    );

    const [song, rows] = await Promise.all([
      songs.steps.search(request),
      albums.catalogue.search('nine inch nails the slip', new AbortController().signal),
    ]);
    expect(song.kind).toBe('picked');
    expect(rows.length).toBeGreaterThan(0);

    expect(asked.map(({ path }) => path)).toContain('/ws/2/release-group');
    expect(asked.some(({ path }) => path !== '/ws/2/release-group')).toBe(true);
    const gaps = asked.slice(1).map(({ at }, i) => at - asked[i]!.at);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(MUSICBRAINZ_GAP_MS);
  });
});
