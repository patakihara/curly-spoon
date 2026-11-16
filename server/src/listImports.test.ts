/**
 * Importing a public Spotify playlist as a music list, through the real lists routes: the recorded
 * playlist (All Out 80s, 150 tracks) read from its recorded Spotify answers, each track searched in
 * its recorded YouTube Music answers, both on fake clocks so the 1 s and 2 s gaps take no time.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ListDetail, type MediaRef } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { index, listsServer, refused } from './adapters/http/listsServer.js';
import {
  MISSING_PLAYLIST,
  RECORDED_PLAYLIST,
  replayedSpotify,
  replayedYtMusic,
} from './adapters/record-spotify.js';
import { SpotifyError, type SpotifyEntry } from './adapters/spotify/client.js';
import type { YtSong } from './adapters/ytmusic/client.js';
import type { SpotifyReader } from './lists/import/job.js';
import { resolveEntries } from './music/import/resolve.js';
import { openDatabase, type Db } from './store/connection.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const read = (dir: string): Recording[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
const spotifyRecordings = read(join(adapters, 'spotify', 'recordings'));
const ytRecordings = read(join(adapters, 'spotify', 'recordings', 'ytmusic'));

const LINK = `https://open.spotify.com/playlist/${RECORDED_PLAYLIST}?si=abc`;

/** What resolving the recorded playlist gives, worked out apart from the job: songs and the rest. */
async function expected() {
  const db = openDatabase(':memory:');
  const spotify = replayedSpotify(spotifyRecordings);
  const yt = replayedYtMusic(ytRecordings);
  const playlist = await spotify.playlist(RECORDED_PLAYLIST);
  const songs: MediaRef[] = [];
  const unmatched: number[] = [];
  const deps = {
    db,
    clock: { now: () => 1_000 },
    track: (id: string) => spotify.track(id),
    search: (q: string) => (searches++, yt.search(q)),
  };
  let searches = 0;
  for await (const r of resolveEntries(deps, playlist.entries)) {
    if (r.youtubeId === null) unmatched.push(r.position);
    else if (!songs.some((s) => s.id === r.youtubeId)) {
      songs.push({ source: 'ytmusic', id: r.youtubeId });
    }
  }
  db.close();
  return { name: playlist.name, total: playlist.entries.length, songs, unmatched, searches };
}
const want = await expected();

/** A gate searches wait at once `held` is set, until it is opened. */
function gate() {
  let open: (() => void) | null = null;
  let wait: Promise<void> | null = null;
  return {
    hold() {
      wait = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    open() {
      open?.();
      wait = null;
    },
    passed: () => wait ?? Promise.resolve(),
  };
}

/** The recorded Spotify and YouTube Music, counting every call each is asked. */
function upstreams(spotify: SpotifyReader = replayedSpotify(spotifyRecordings)) {
  const yt = replayedYtMusic(ytRecordings);
  const calls = { spotify: 0, searches: 0 };
  const g = gate();
  /** Searches done before the gate holds, then each waits for it. */
  let holdAfter = Number.POSITIVE_INFINITY;
  const reader: SpotifyReader = {
    playlistHeader: (id) => (calls.spotify++, spotify.playlistHeader(id)),
    playlist: (id) => (calls.spotify++, spotify.playlist(id)),
    track: (id) => (calls.spotify++, spotify.track(id)),
  };
  let at = 0;
  const search = async (q: string): Promise<YtSong[]> => {
    calls.searches++;
    if (calls.searches > holdAfter) await g.passed();
    return yt.search(q);
  };
  releases.push(() => g.open());
  return {
    calls,
    holdAfter(n: number) {
      holdAfter = n;
      g.hold();
    },
    release: () => g.open(),
    options: {
      spotify: reader,
      search,
      available: () => true,
      clock: {
        now: () => at,
        sleep: async (ms: number) => {
          at += ms;
        },
      },
    },
  };
}

/** Opens every gate, so no import is left waiting when its app closes. */
const releases: (() => void)[] = [];
let apps: FastifyInstance[] = [];
let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  index(db);
});
afterEach(async () => {
  releases.splice(0).forEach((release) => release());
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  db.close();
});

async function server(u = upstreams()) {
  const s = await listsServer(db, { spotifyImport: u.options });
  apps.push(s.app);
  return { ...s, u };
}
type Server = Awaited<ReturnType<typeof server>>;

const importIt = async (s: Server, from = LINK, name = 'kara') =>
  s.call('POST', '/lists/import', { from }, name);

/** The list once its import is no longer running, asking again between turns of the job. */
async function finished(s: Server, id: string, name = 'kara'): Promise<ListDetail> {
  for (let n = 0; n < 10_000; n++) {
    const list = await s.detail(id, name);
    if (list.import?.state === 'done' || list.import?.state === 'stopped') return list;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('the import never finished');
}

/** The list once at least `n` places are handled. */
async function handled(s: Server, id: string, n: number): Promise<ListDetail> {
  for (let i = 0; i < 10_000; i++) {
    const list = await s.detail(id);
    if ((list.import?.done ?? 0) >= n) return list;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`the import never handled ${n}`);
}

describe('[M3.spotify] importing a public Spotify playlist', { timeout: 30_000 }, () => {
  it('answers at once with the music list, named as the playlist, its import reading', async () => {
    const s = await server();
    s.u.holdAfter(0);
    const answer = await importIt(s);
    const list = s.ok(answer, ListDetail);
    expect(list).toMatchObject({ kind: 'music', name: want.name, items: [] });
    expect(list.import).toMatchObject({ source: 'spotify', state: 'reading', done: 0 });
    s.u.release();
  });

  it('fills the list in Spotify’s order as tracks match, and reports where it stands', async () => {
    const s = await server();
    s.u.holdAfter(20);
    const { id } = s.ok(await importIt(s), ListDetail);
    const midway = await handled(s, id, 10);
    expect(midway.import).toMatchObject({ state: 'matching', total: want.total });
    const done = midway.import!.done;
    expect(s.refs(midway.items)).toEqual(want.songs.slice(0, midway.items.length));
    expect(midway.items.length).toBeLessThanOrEqual(done);
    s.u.release();
    const list = await finished(s, id);
    expect(s.refs(list.items)).toEqual(want.songs);
    expect(list.import).toMatchObject({ state: 'done', done: want.total, total: want.total });
    expect(list.import!.unmatched.map((u) => u.position)).toEqual(want.unmatched);
    expect(want.unmatched.length).toBe(5);
    for (const u of list.import!.unmatched) {
      expect(u.reason).toBe('noMatch');
      expect(u.title).not.toBeNull();
      expect(u.artists.length).toBeGreaterThan(0);
    }
    expect(list.items.length + list.import!.unmatched.length + list.import!.duplicates).toBe(
      want.total,
    );
  });

  it('goes on after a restart from where it was, ending with each song once', async () => {
    const first = await server();
    first.u.holdAfter(30);
    const { id } = first.ok(await importIt(first), ListDetail);
    await handled(first, id, 20);
    const closing = first.app.close();
    first.u.release();
    await closing;
    apps = apps.filter((a) => a !== first.app);

    const second = await server();
    const list = await finished(second, id);
    expect(second.refs(list.items)).toEqual(want.songs);
    expect(list.import).toMatchObject({ state: 'done', done: want.total });
    // The places handled before the restart were not searched again.
    expect(second.u.calls.searches).toBeLessThanOrEqual(want.searches - 20);
  });

  it('runs a second import behind the first, never both at once', async () => {
    const s = await server();
    s.u.holdAfter(5);
    const kara = s.ok(await importIt(s), ListDetail);
    await handled(s, kara.id, 3);
    const otto = s.ok(await importIt(s, LINK, 'otto'), ListDetail);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await s.detail(otto.id, 'otto')).import).toMatchObject({ state: 'reading', done: 0 });
    s.u.release();
    await finished(s, kara.id);
    const ottos = await finished(s, otto.id, 'otto');
    expect(s.refs(ottos.items)).toEqual(want.songs);
  });

  it('refuses a second import of the same playlist while the first runs: 409 importing', async () => {
    const s = await server();
    s.u.holdAfter(1);
    const { id } = s.ok(await importIt(s), ListDetail);
    expect(await importIt(s)).toEqual(refused(409, 'importing'));
    expect(await s.call('POST', `/lists/${id}/import`)).toEqual(refused(409, 'importing'));
    s.u.release();
    await finished(s, id);
  });

  it('re-importing replaces the songs with Spotify’s order, keeping the list’s id and name', async () => {
    const s = await server();
    const { id } = s.ok(await importIt(s), ListDetail);
    await finished(s, id);
    await s.call('PATCH', `/lists/${id}`, { name: 'My 80s' });
    await s.call('PUT', `/lists/${id}/items`, { refs: want.songs.slice(0, 3).reverse() });

    const again = s.ok(await s.call('POST', `/lists/${id}/import`), ListDetail);
    expect(again).toMatchObject({ id, name: 'My 80s', items: [] });
    expect(again.import).toMatchObject({ state: 'reading', done: 0, unmatched: [] });
    const list = await finished(s, id);
    expect(list).toMatchObject({ id, name: 'My 80s' });
    expect(s.refs(list.items)).toEqual(want.songs);

    // Pasting the link again is the same re-import of the same list.
    const pasted = s.ok(await importIt(s), ListDetail);
    expect(pasted.id).toBe(id);
    await finished(s, id);
    expect((await s.lists()).filter((l) => l.kind === 'music')).toHaveLength(1);
  });

  it('reports places past the most a list holds as listFull, reading none of them', async () => {
    const entries: SpotifyEntry[] = Array.from({ length: 1002 }, (_, position) => ({
      position,
      kind: 'notASong' as const,
      uri: `spotify:episode:${String(position).padStart(22, '0')}`,
    }));
    const standIn: SpotifyReader = {
      playlistHeader: async () => ({ name: 'Long', cover: null }),
      playlist: async (id) => ({ id, name: 'Long', cover: null, length: 1002, entries }),
      track: async () => {
        throw new Error('no track is read');
      },
    };
    const s = await server(upstreams(standIn));
    const { id } = s.ok(await importIt(s), ListDetail);
    const list = await finished(s, id);
    expect(list.import).toMatchObject({ state: 'done', done: 1002, total: 1002 });
    const reasons = list.import!.unmatched.map((u) => u.reason);
    expect(reasons.filter((r) => r === 'notASong')).toHaveLength(1000);
    expect(list.import!.unmatched.slice(1000)).toMatchObject([
      { position: 1000, reason: 'listFull' },
      { position: 1001, reason: 'listFull' },
    ]);
  });

  it('stops, never fails, when Spotify keeps refusing, and runs again from there', async () => {
    const real = replayedSpotify(spotifyRecordings);
    let refusing = true;
    const flaky: SpotifyReader = {
      playlistHeader: (id) => real.playlistHeader(id),
      playlist: (id) => real.playlist(id),
      track: async (id) => {
        if (refusing) throw new SpotifyError('spotify_unavailable', 503);
        return real.track(id);
      },
    };
    const s = await server(upstreams(flaky));
    const { id } = s.ok(await importIt(s), ListDetail);
    const stopped = await finished(s, id);
    expect(stopped.import).toMatchObject({ state: 'stopped', stopped: 'spotify_unavailable' });
    refusing = false;
    s.ok(await s.call('POST', `/lists/${id}/import`), ListDetail);
    const list = await finished(s, id);
    expect(list.import).toMatchObject({ state: 'done', stopped: null });
    expect(s.refs(list.items)).toEqual(want.songs);
  });

  it('a playlist that is gone is 404 playlist_not_found, and no list is made', async () => {
    const s = await server();
    expect(await importIt(s, `spotify:playlist:${MISSING_PLAYLIST}`)).toEqual(
      refused(404, 'playlist_not_found'),
    );
    expect((await s.lists()).filter((l) => l.kind === 'music')).toEqual([]);
  });

  it('a link that names no Spotify playlist is 400 not_a_spotify_playlist', async () => {
    const s = await server();
    expect(await importIt(s, 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy')).toEqual(
      refused(400, 'not_a_spotify_playlist'),
    );
    expect(s.u.calls.spotify).toBe(0);
  });

  it('is off while YouTube Music streaming is: 409 medium_unavailable', async () => {
    const u = upstreams();
    const s = await server({ ...u, options: { ...u.options, available: () => false } });
    expect(await importIt(s)).toEqual(refused(409, 'medium_unavailable'));
    expect(u.calls).toEqual({ spotify: 0, searches: 0 });
  });

  it('asks nothing upstream at start', async () => {
    const s = await server();
    await s.app.ready();
    await s.lists();
    expect(s.u.calls).toEqual({ spotify: 0, searches: 0 });
  });

  it('a list never imported shows no import', async () => {
    const s = await server();
    const list = await s.create({ kind: 'music', name: 'Mine' });
    expect(list.import).toBeNull();
  });
});
