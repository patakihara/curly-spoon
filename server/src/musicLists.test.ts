/**
 * A music list: songs in your order, played on the music queue. Its songs are the YouTube Music
 * matches of the recorded Spotify playlist (All Out 80s), resolved from the recordings as an
 * import resolves them, through the real lists routes of adapters/http/listsServer.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ListDetail,
  ListeningSessionList,
  type MediaRef,
  Queue,
  type QueueItem,
} from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { index, listsServer, refused, two } from './adapters/http/listsServer.js';
import { RECORDED_PLAYLIST, replayedSpotify, replayedYtMusic } from './adapters/record-spotify.js';
import { type IndexRow } from './libraryIndex/rows.js';
import { applyRow, emptyCounts } from './libraryIndex/store.js';
import { resolveEntries } from './music/import/resolve.js';
import { keptTrack } from './requests/songs/kept.js';
import { artOf } from './routes/art.js';
import { openDatabase, type Db } from './store/connection.js';
import { setListItems } from './store/lists.js';
import { createRequest, saveRequest } from './store/requests.js';
import { streamedTrack } from './store/streamedTracks.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const read = (dir: string): Recording[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
const spotifyRecordings = read(join(adapters, 'spotify', 'recordings'));
const ytRecordings = read(join(adapters, 'spotify', 'recordings', 'ytmusic'));

/** The recorded playlist's matches in Spotify's order, written to `streamed_tracks` of `db`. */
async function recordedMatches(db: Db): Promise<MediaRef[]> {
  const spotify = replayedSpotify(spotifyRecordings);
  const yt = replayedYtMusic(ytRecordings);
  const playlist = await spotify.playlist(RECORDED_PLAYLIST);
  const deps = {
    db,
    clock: { now: () => 1_000 },
    track: (id: string) => spotify.track(id),
    search: (q: string) => yt.search(q),
  };
  const songs: MediaRef[] = [];
  for await (const r of resolveEntries(deps, playlist.entries)) {
    if (r.youtubeId !== null) songs.push({ source: 'ytmusic', id: r.youtubeId });
  }
  return songs;
}

/** A household Jellyfin track in the index, in library `music`. */
const JELLYFIN_TRACK = 'f'.repeat(32);
function indexJellyfinTrack(db: Db): MediaRef {
  const row: IndexRow = {
    source: 'jellyfin',
    id: JELLYFIN_TRACK,
    kind: 'track',
    parentId: null,
    libraryId: 'music',
    title: 'A household track',
    creators: [{ name: 'Someone', role: 'artist' }],
    series: [],
    genres: [],
    position: 1,
    disc: null,
    duration: 200,
    year: null,
    publishedAt: null,
    upstreamVersion: null,
    ids: {},
    episodeOrder: null,
    hasArt: false,
    hasLyrics: false,
  };
  applyRow(db, row, 1, emptyCounts());
  return { source: 'jellyfin', id: JELLYFIN_TRACK };
}

let apps: FastifyInstance[] = [];
let db: Db;
let songs: MediaRef[];
beforeEach(async () => {
  db = openDatabase(':memory:');
  index(db);
  songs = await recordedMatches(db);
});
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  db.close();
});

async function server() {
  const s = await listsServer(db);
  apps.push(s.app);
  return s;
}
type Server = Awaited<ReturnType<typeof server>>;

const refsOf = (q: Queue) => [q.current!, ...q.user].map(({ ref }: QueueItem) => ref);

async function musicList(s: Server, refs: MediaRef[]) {
  const list = await s.create({ kind: 'music', name: 'All Out 80s' });
  return s.ok(await s.call('PUT', `/lists/${list.id}/items`, { refs }), ListDetail);
}

const play = async (s: Server, id: string, body: object = {}) =>
  s.ok(await s.call('POST', `/lists/${id}/play`, body), Queue);

describe('[M3.spotify/b] an imported playlist plays in its original order', () => {
  it('[M3.spotify/b] a music list of the recorded matches plays them on the music queue in Spotify’s order, the spoken queue untouched', async () => {
    const s = await server();
    await s.call('POST', '/queues/spoken/items', { ref: two, how: 'now' });
    const list = await musicList(s, songs);

    expect(songs.length).toBeGreaterThan(100);
    expect(list).toMatchObject({ kind: 'music', count: songs.length });
    expect(list.items.map((i) => i.ref)).toEqual(songs);
    expect(list.items[0]).toMatchObject({ kind: 'song', progress: null, finished: false });
    expect(list.items[0]!.title).toBe(streamedTrack(db, songs[0]!.id)!.title);

    const queue = await play(s, list.id);

    expect(refsOf(queue)).toEqual(songs);
    expect(queue.context).toBeNull();
    const session = s.ok(await s.call('GET', '/sessions'), ListeningSessionList).sessions[0]!;
    expect(session.active).toBe('music');
    expect(session.currents.spoken?.ref).toEqual(two);
    expect(session.currents.music?.ref).toEqual(songs[0]);
  });

  it('[M3.spotify/b] played from one of its songs, plays that song onwards, played or not', async () => {
    const s = await server();
    const list = await musicList(s, songs);

    const queue = await play(s, list.id, { start: songs[40] });

    expect(refsOf(queue)).toEqual(songs.slice(40));
    expect(await s.call('POST', `/lists/${list.id}/play`, { start: two })).toEqual(
      refused(404, 'not_found'),
    );
  });

  it('[M3.spotify/b] a kept song stays the song it was imported as, and shows and plays as its Jellyfin track', async () => {
    const s = await server();
    const kept = songs[2]!;
    const track = indexJellyfinTrack(db);
    const { request } = createRequest(
      db,
      s.users.kara!,
      {
        medium: 'song',
        target: { title: 'Kept', creator: 'Someone', ids: { youtubeMusicId: kept.id } },
      },
      1,
    );
    saveRequest(db, request.id, { state: { status: 'inLibrary' }, result: track }, 1);
    const list = await musicList(s, songs.slice(0, 5));

    const queue = await play(s, list.id);

    expect(refsOf(queue)[2]).toEqual(kept);
    // `POST /play` of a kept song plays the track its keep names (keptSongs.test.ts).
    expect(keptTrack(db, kept.id)).toEqual(track);
    expect(list.items[2]!.art).toBe(artOf(db, kept));
  });

  it('[M3.spotify/b] a song named twice keeps its first place', async () => {
    const s = await server();
    const [a, b, c] = songs as [MediaRef, MediaRef, MediaRef];

    const list = await musicList(s, [a, b, a, c, b]);

    expect(list.items.map((i) => i.ref)).toEqual([a, b, c]);
    expect(refsOf(await play(s, list.id))).toEqual([a, b, c]);
  });

  it('[M3.spotify/b] leaves out a Jellyfin track the person cannot reach, and refuses adding one', async () => {
    const s = await server();
    const track = indexJellyfinTrack(db);
    const list = await musicList(s, songs.slice(0, 3));
    setListItems(db, s.users.kara!, list.id, [songs[0]!, track, songs[1]!]);

    expect((await s.detail(list.id)).items.map((i) => i.ref)).toEqual(songs.slice(0, 2));
    expect(refsOf(await play(s, list.id))).toEqual(songs.slice(0, 2));
    expect(await s.call('POST', `/lists/${list.id}/items`, { ref: track })).toEqual(
      refused(404, 'not_found'),
    );
  });

  it('[M3.spotify/b] takes only songs search or an import named, and a song only on a music list', async () => {
    const s = await server();
    const list = await musicList(s, []);
    const podcasts = await s.create({ kind: 'playlist', name: 'Commute' });

    expect(
      await s.call('POST', `/lists/${list.id}/items`, {
        ref: { source: 'ytmusic', id: 'zzzzzzzzzzz' },
      }),
    ).toEqual(refused(404, 'not_found'));
    expect(await s.call('POST', `/lists/${list.id}/items`, { ref: two })).toEqual(
      refused(400, 'wrong_kind'),
    );
    expect(await s.call('POST', `/lists/${podcasts.id}/items`, { ref: songs[0] })).toEqual(
      refused(400, 'wrong_kind'),
    );
    expect(await s.call('POST', `/lists/${list.id}/play`, {})).toEqual(
      refused(400, 'nothing_to_play'),
    );
  });
});
