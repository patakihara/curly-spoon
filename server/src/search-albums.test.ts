/**
 * Search's album rows through the real routes: MusicBrainz answers its recorded release-group
 * searches, the requests' steps are stand-ins, and what the household holds, kept songs included, is
 * written to the index and the requests store as the index job and a keep do.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type RequestRef, SearchResults } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { standInSteps } from './adapters/http/standIn.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from './adapters/musicbrainz/client.js';
import { ALBUM_GROUPS } from './adapters/record-musicbrainz.js';
import { buildApp } from './app.js';
import { type IndexRow } from './libraryIndex/rows.js';
import { applyRow, emptyCounts } from './libraryIndex/store.js';
import { albumCatalogue, type AlbumCatalogue } from './requests/albums/catalogue.js';
import type { SongMatch } from './requests/songs/match.js';
import { stepsRegistry } from './requests/steps.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createRequest, saveRequest } from './store/requests.js';
import { createSession } from './store/sessions.js';
import { upsertUser } from './store/users.js';

const ADAPTERS = fileURLToPath(new URL('./adapters/', import.meta.url));
const recording = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, 'musicbrainz', 'recordings', `${call}.json`), 'utf8')),
  );
const log = { error: () => undefined };
const T0 = Date.UTC(2026, 10, 10, 8);
const SLIP = ALBUM_GROUPS.slip.group;
const ART = Buffer.from('a front cover');

const musicBrainz = (
  fetch: FetchLike = replayFetch(['rg-search-slip', 'rg-search-nin'].map(recording)),
) =>
  new MusicBrainzClient({
    baseUrl: 'http://upstream.invalid',
    fetch,
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock: { now: () => 0, sleep: async () => undefined },
  });

const fronts: string[] = [];
const coverArt = {
  groupFront: async (id: string) => {
    fronts.push(id);
    return id === SLIP ? { mime: 'image/jpeg', bytes: ART } : null;
  },
};

function indexed(db: Db, row: Partial<IndexRow> & Pick<IndexRow, 'id' | 'kind' | 'title'>) {
  applyRow(
    db,
    {
      source: 'jellyfin',
      parentId: null,
      libraryId: 'music',
      creators: [{ name: 'Nine Inch Nails', role: 'album-artist' }],
      series: [],
      genres: [],
      position: null,
      disc: null,
      duration: 200,
      year: 2008,
      publishedAt: null,
      upstreamVersion: null,
      ids: {},
      episodeOrder: null,
      hasArt: false,
      hasLyrics: false,
      ...row,
    },
    T0,
    emptyCounts(),
  );
}

/** An album the index holds, with its tracks. */
function indexedAlbum(db: Db, id: string, tracks: string[], ids: Record<string, string> = {}) {
  indexed(db, { id, kind: 'album', title: 'The Slip', ids });
  tracks.forEach((track, i) =>
    indexed(db, {
      id: track,
      kind: 'track',
      title: `Track ${i + 1}`,
      parentId: id,
      position: i + 1,
    }),
  );
}

const match = (title: string): SongMatch => ({
  source: 'MusicBrainz',
  by: 'release',
  title,
  artist: 'Nine Inch Nails',
  artists: [{ name: 'Nine Inch Nails', id: 'b7ffd2af-418f-4be2-bdd1-22f8b48613da' }],
  album: 'The Slip',
  albumArtist: 'Nine Inch Nails',
  albumArtists: [{ name: 'Nine Inch Nails', id: 'b7ffd2af-418f-4be2-bdd1-22f8b48613da' }],
  trackNumber: 1,
  trackTotal: 10,
  discNumber: 1,
  discTotal: 1,
  date: '2008-07-22',
  originalDate: '2008-05-05',
  recordingId: `${title}-recording`,
  releaseTrackId: `${title}-track`,
  releaseId: ALBUM_GROUPS.slip.cd,
  releaseGroupId: SLIP,
  hasFrontCover: false,
});

/** A song kept from YouTube Music by `userId`, arrived as `track`. */
function keptSong(db: Db, userId: string, youtubeMusicId: string, track: string) {
  const ref: RequestRef = {
    medium: 'song',
    target: { title: youtubeMusicId, creator: null, ids: { youtubeMusicId } },
  };
  const { request } = createRequest(db, userId, ref, T0);
  saveRequest(
    db,
    request.id,
    {
      state: { status: 'inLibrary' },
      release: {
        id: youtubeMusicId,
        title: track,
        source: 'YouTube Music',
        size: 1000,
        details: { youtubeMusicId, match: match(track) },
      },
      result: { source: 'jellyfin', id: track },
    },
    T0,
  );
}

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  fronts.length = 0;
});

async function server(options: { catalogue?: AlbumCatalogue; steps?: boolean } = {}) {
  const db = openDatabase(':memory:');
  const catalogue =
    options.catalogue ??
    albumCatalogue({ musicBrainz: musicBrainz(), coverArt, now: () => T0, log });
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: {
      key: Buffer.alloc(32, 7),
      config: { absUrl: undefined, jellyfinUrl: undefined },
      fetch: replayFetch([]),
    },
    now: () => T0,
    logger: false,
    albumCatalogue: catalogue,
    ...(options.steps === false
      ? {}
      : {
          requests: {
            steps: stepsRegistry([standInSteps('album')]),
            everyMs: 3_600_000,
            notIndexedAfterMs: 60_000,
            stepTimeoutMs: 0,
            stallAfterMs: 60_000,
            holdAfterMs: 60_000,
          },
        }),
  });
  apps.push(app);
  const person = (name: string) => {
    const user = upsertUser(db, { username: name, role: 'member' });
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    const { token } = createSession(db, { userId: user.id, deviceId: device.id, kind: 'bearer' });
    return { user, headers: { authorization: `Bearer ${token}` } };
  };
  const kara = person('kara');
  const search = async (q = 'nine inch nails the slip', kinds = '', who = kara) => {
    const url = `/api/search?q=${encodeURIComponent(q)}${kinds}`;
    const answer = await app.inject({ method: 'GET', url, headers: who.headers });
    expect(answer.statusCode).toBe(200);
    return SearchResults.parse(answer.json());
  };
  return { app, db, kara, person, search };
}

describe('[M3.albums] album rows in Search', () => {
  it('[M3.albums] lists what MusicBrainz finds at score 90 or more, each with a ref that POST /requests takes', async () => {
    const { app, kara, search } = await server();
    const { albums } = await search();
    expect(albums).toEqual([
      {
        ref: {
          medium: 'album',
          target: { title: 'The Slip', creator: 'Nine Inch Nails', ids: { mbid: SLIP } },
        },
        title: 'The Slip',
        artist: 'Nine Inch Nails',
        year: 2008,
        type: 'album',
        art: `/api/search/albums/${SLIP}/art`,
        status: null,
        progress: null,
        item: null,
        kept: 0,
      },
    ]);
    const made = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers: kara.headers,
      payload: { ref: albums[0]!.ref },
    });
    expect(made.statusCode).toBeLessThan(300);
    expect(made.json()).toMatchObject({ medium: 'album', status: 'requested' });
  });

  it('[M3.albums] lists the best five, other kinds than albums and EPs saying what they are', async () => {
    const { search } = await server();
    const { albums } = await search('nine inch nails');
    expect(albums.map(({ title, type }) => [title, type])).toEqual([
      ['Maximum Nine Inch Nails: The Unauthorised Biography of Nine Inch Nails', 'other'],
      ['MSQ Performs Nine Inch Nails', 'album'],
      ['Wish (Nine Inch Nails cover)', 'single'],
      ['The Definitive Nine Inch Nails: Quiet', 'album'],
      ['Lullaby Renditions of Nine Inch Nails', 'album'],
    ]);
  });

  it('[M3.albums] drops an album the household holds, by its release group or by its title and artist', async () => {
    const byId = await server();
    indexedAlbum(byId.db, 'a1', ['t1'], { musicbrainz_release_group: SLIP });
    expect((await byId.search()).albums).toEqual([]);

    const byName = await server();
    indexed(byName.db, {
      id: 'a2',
      kind: 'album',
      title: 'the slip',
      creators: [{ name: 'NINE INCH NAILS', role: 'album-artist' }],
    });
    expect((await byName.search()).albums).toEqual([]);
  });

  it('[M3.albums] keeps an album whose every track is a kept song, saying how many the person kept', async () => {
    const { db, kara, person, search } = await server();
    const bo = person('bo');
    indexedAlbum(db, 'kept', ['t1', 't2']);
    keptSong(db, kara.user.id, 'keptSong001', 't1');
    keptSong(db, bo.user.id, 'keptSong002', 't2');
    expect((await search()).albums.map(({ title, kept }) => [title, kept])).toEqual([
      ['The Slip', 1],
    ]);
    expect((await search(undefined, '', bo)).albums[0]!.kept).toBe(1);
  });

  it('[M3.albums] drops an album that holds a household track besides its kept songs', async () => {
    const { db, kara, search } = await server();
    indexedAlbum(db, 'mixed', ['t1', 't2']);
    keptSong(db, kara.user.id, 'keptSong001', 't1');
    expect((await search()).albums).toEqual([]);
  });

  it('[M3.albums] a request in flight shows where it stands to whoever is on it', async () => {
    const { db, kara, person, search } = await server();
    const ref = (await search()).albums[0]!.ref;
    const { request } = createRequest(db, kara.user.id, ref, T0);
    saveRequest(db, request.id, { state: { status: 'downloading', progress: 0.4 } }, T0);
    expect((await search()).albums[0]).toMatchObject({ status: 'downloading', progress: 0.4 });
    const bo = person('bo');
    expect((await search(undefined, '', bo)).albums[0]).toMatchObject({ status: null });
  });

  it('[M3.albums] MusicBrainz failing gives no album rows, and the library still answers', async () => {
    const { search } = await server({
      catalogue: albumCatalogue({
        musicBrainz: musicBrainz(async () => {
          throw new TypeError('connection refused');
        }),
        coverArt,
        now: () => T0,
        log,
      }),
    });
    const answer = await search();
    expect(answer.albums).toEqual([]);
    expect(answer.query).toBe('nine inch nails the slip');
  });

  it('[M3.albums] lists no albums and asks nothing while album steps are off, or for other kinds', async () => {
    const asked: string[] = [];
    const counting: FetchLike = async (url) => {
      asked.push(url);
      throw new TypeError('connection refused');
    };
    const catalogue = albumCatalogue({
      musicBrainz: musicBrainz(counting),
      coverArt,
      now: () => T0,
      log,
    });
    const off = await server({ catalogue, steps: false });
    expect((await off.search()).albums).toEqual([]);
    const on = await server({ catalogue });
    expect((await on.search(undefined, '&kinds=book')).albums).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('[M3.albums] serves a row’s cover from the Cover Art Archive by its release group, and 404 for one with none', async () => {
    const { app, kara } = await server();
    const art = await app.inject({
      method: 'GET',
      url: `/api/search/albums/${SLIP}/art`,
      headers: kara.headers,
    });
    expect(art.statusCode).toBe(200);
    expect(art.headers['content-type']).toBe('image/jpeg');
    expect(art.rawPayload).toEqual(ART);
    const none = await app.inject({
      method: 'GET',
      url: `/api/search/albums/${ALBUM_GROUPS.ghosts.group}/art`,
      headers: kara.headers,
    });
    expect(none.statusCode).toBe(404);
    expect(fronts).toEqual([SLIP, ALBUM_GROUPS.ghosts.group]);
  });
});
