/**
 * Kept songs replaced when their album arrives, on a real temp media folder: The Slip's fixture
 * download imported (import.test.ts), with two of its songs already kept from YouTube Music, each an
 * Ogg Opus file M3.keep's remux makes of the committed clip. One was matched to the album's
 * recording on MusicBrainz and kept in `2008 - The Slip`, where the album then goes too; the other
 * was kept by YouTube Music's names alone into `The Slip`, beside the `album.nfo` and `folder.jpg`
 * Jellyfin writes into every album folder.
 *
 * Jellyfin is a stand-in built on its recorded answers: each folder, album, track and person's
 * state is a recorded row moved onto the album's ids, paths and MusicBrainz ids, as no recording can
 * list what this test makes. A person's state is the recorded `GET /UserItems/{id}/UserData`; its
 * `POST` answers the same shape, as the progress recorder's revert reads it live. MusicBrainz's CD
 * release and Jellyfin's users and library are replayed as recorded.
 */
import {
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { copyFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestRef } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import { JellyfinClient } from '../../adapters/jellyfin/client.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../../adapters/musicbrainz/client.js';
import type { QbitTorrent } from '../../adapters/qbittorrent/schemas.js';
import { ALBUM_GROUPS } from '../../adapters/record-musicbrainz.js';
import type { IndexRow } from '../../libraryIndex/rows.js';
import { applyRow, emptyCounts, indexedRow } from '../../libraryIndex/store.js';
import { remux } from '../../music/opus/remux.js';
import { claimsOf } from '../../store/claims.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createDevice } from '../../store/devices.js';
import { createRequest, getRequest, noteHandle, saveRequest } from '../../store/requests.js';
import { upsertUser } from '../../store/users.js';
import { keptTrack } from '../songs/kept.js';
import type { SongMatch } from '../songs/match.js';
import { songComments } from '../songs/tags.js';
import { albumImport, type AlbumImportDeps } from './import.js';
import { jellyfinPeople } from './replace.js';
import { recordedAlbumEditions } from './fixtures/albums.js';
import { saveLink } from '../../store/upstreamLinks.js';

const here = dirname(fileURLToPath(import.meta.url));
const adapters = join(here, '..', '..', 'adapters');
const FIXTURE = join(here, 'fixtures', 'the-slip');
const CLIP = join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm');
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const jsonOf = (recording: Recording) => (recording.response.body as { json: unknown }).json;

const { group: GROUP, cd: CD_RELEASE } = ALBUM_GROUPS.slip;
const CD = jsonOf(recorded('musicbrainz', 'release-slip-cd')) as {
  media: { tracks: { id: string; title: string; length: number; recording: { id: string } }[] }[];
};
const SLIP = CD.media[0]!.tracks;
const pad = (n: number) => String(n).padStart(2, '0');
const ALBUM_FOLDER = 'Nine Inch Nails/2008 - The Slip';
const FILES = SLIP.map((track, i) => `${ALBUM_FOLDER}/${pad(i + 1)} - ${track.title}.flac`);

const QBIT_DOWNLOADS = '/data/Downloads';
const TORRENT = 'Nine Inch Nails - The Slip (2008) [FLAC]';
const JELLYFIN_MUSIC = '/data/media/Music';
const LIBRARY_ID = recorded('jellyfin', 'items-folder-library').request.query.ParentId!;
const ARTIST_ID = 'a0000000000000000000000000000001';
/** The album Jellyfin makes of `2008 - The Slip`, and of `The Slip`. */
const ALBUM_ID = 'a0000000000000000000000000000002';
const OLD_ALBUM_ID = 'a0000000000000000000000000000003';
const HASH = '7acf8fb590b2060dd9c3146ef770169d593433b0';
const newTrack = (i: number) => `b00000000000000000000000000000${pad(i + 1)}`;
/** The kept songs' tracks, as Jellyfin indexed their Opus files. */
const KEPT_TRACK = 'c0000000000000000000000000000001';
const NAMED_TRACK = 'c0000000000000000000000000000002';
const KEPT_ID = 'keptSlip003';
const NAMED_ID = 'namedSlip04';

const KEPT_MATCH: SongMatch = {
  source: 'MusicBrainz',
  by: 'release',
  title: 'Letting You',
  artist: 'Nine Inch Nails',
  artists: [{ name: 'Nine Inch Nails', id: 'b7ffd2af-418f-4be2-bdd1-22f8b48613da' }],
  album: 'The Slip',
  albumArtist: 'Nine Inch Nails',
  albumArtists: [{ name: 'Nine Inch Nails', id: 'b7ffd2af-418f-4be2-bdd1-22f8b48613da' }],
  trackNumber: 3,
  trackTotal: 10,
  discNumber: 1,
  discTotal: 1,
  date: '2008-07-22',
  originalDate: '2008-05-05',
  recordingId: SLIP[2]!.recording.id,
  releaseTrackId: SLIP[2]!.id,
  releaseId: CD_RELEASE,
  releaseGroupId: GROUP,
  hasFrontCover: false,
};
const NAMED_MATCH: SongMatch = {
  source: 'YouTube Music',
  title: 'Discipline',
  artist: 'Nine Inch Nails',
  artists: [{ name: 'Nine Inch Nails' }],
  album: 'The Slip',
};
const KEPT_FILE = `${ALBUM_FOLDER}/03 - Letting You.opus`;
const NAMED_FOLDER = 'Nine Inch Nails/The Slip';
const NAMED_FILE = `${NAMED_FOLDER}/Discipline.opus`;

const ALBUM_REF: RequestRef = {
  medium: 'album',
  target: { title: 'The Slip', creator: 'Nine Inch Nails', ids: { mbid: GROUP } },
};
const songRef = (id: string): RequestRef => ({
  medium: 'song',
  target: { title: id, creator: null, ids: { youtubeMusicId: id } },
});

let dir: string;
let media: string;
let music: string;
let torrent: string;
let db: Db;
let ana: string;
let bo: string;
let clock: number;
const errors: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-album-replace-'));
  media = join(dir, 'media');
  music = join(media, 'Music');
  torrent = join(media, 'Downloads', TORRENT);
  mkdirSync(music, { recursive: true });
  cpSync(FIXTURE, torrent, { recursive: true });
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 10, 10, 8);
  ana = upsertUser(db, { username: 'ana', role: 'member' }).id;
  bo = upsertUser(db, { username: 'bo', role: 'member' }).id;
  errors.length = 0;
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A kept song's file as M3.keep's import builds it: the clip remuxed, tagged with its id. */
async function keptFile(relPath: string, id: string, match: SongMatch) {
  mkdirSync(join(music, dirname(relPath)), { recursive: true });
  const from = await open(CLIP, 'r');
  const to = await open(join(music, relPath), 'wx');
  try {
    await remux(from, to, songComments(id, match));
  } finally {
    await from.close();
    await to.close();
  }
}

/** An index row of Jellyfin's, as the index job writes it. */
const indexRow = (over: Partial<IndexRow> & Pick<IndexRow, 'id' | 'kind' | 'title'>): IndexRow => ({
  source: 'jellyfin',
  parentId: null,
  libraryId: LIBRARY_ID,
  creators: [{ name: 'Nine Inch Nails', role: 'album-artist' }],
  series: [],
  genres: [],
  position: null,
  disc: null,
  duration: null,
  year: 2008,
  publishedAt: null,
  upstreamVersion: null,
  ids: {},
  episodeOrder: null,
  hasArt: false,
  hasLyrics: false,
  ...over,
});

/** A keep that has arrived, as its import left it: the request, its file, its track indexed. */
function arrivedKeep(
  userId: string,
  id: string,
  match: SongMatch,
  track: string,
  made: string[],
): string {
  const { request } = createRequest(db, userId, songRef(id), clock);
  saveRequest(
    db,
    request.id,
    {
      state: { status: 'inLibrary' },
      release: {
        id,
        title: match.title,
        source: 'YouTube Music',
        size: 1000,
        details: { youtubeMusicId: id, match },
      },
      handle: { id, size: 1000, made },
      result: { source: 'jellyfin', id: track },
    },
    clock,
  );
  return request.id;
}

/** Both songs kept, before the album is asked for. */
async function keptSongs() {
  await keptFile(KEPT_FILE, KEPT_ID, KEPT_MATCH);
  await keptFile(NAMED_FILE, NAMED_ID, NAMED_MATCH);
  writeFileSync(join(music, NAMED_FOLDER, 'album.nfo'), '<album />');
  writeFileSync(join(music, NAMED_FOLDER, 'folder.jpg'), 'a picture');
  const kept = arrivedKeep(ana, KEPT_ID, KEPT_MATCH, KEPT_TRACK, ['Nine Inch Nails', ALBUM_FOLDER]);
  const named = arrivedKeep(bo, NAMED_ID, NAMED_MATCH, NAMED_TRACK, [NAMED_FOLDER]);
  applyRow(db, indexRow({ id: ALBUM_ID, kind: 'album', title: 'The Slip' }), clock, emptyCounts());
  applyRow(
    db,
    indexRow({
      id: KEPT_TRACK,
      kind: 'track',
      parentId: ALBUM_ID,
      title: 'Letting You',
      duration: SLIP[2]!.length / 1000,
      ids: { musicbrainz_recording: SLIP[2]!.recording.id },
    }),
    clock,
    emptyCounts(),
  );
  applyRow(
    db,
    indexRow({ id: OLD_ALBUM_ID, kind: 'album', title: 'The Slip' }),
    clock,
    emptyCounts(),
  );
  applyRow(
    db,
    indexRow({
      id: NAMED_TRACK,
      kind: 'track',
      parentId: OLD_ALBUM_ID,
      title: 'Discipline',
      duration: SLIP[3]!.length / 1000 + 2,
    }),
    clock,
    emptyCounts(),
  );
  return { kept, named };
}

/** Ana's device playing the kept song, with it in her history and a list. */
function anaListening() {
  const device = createDevice(db, { userId: ana, kind: 'web' }, clock).id;
  db.prepare(
    `INSERT INTO listening_sessions (device_id, user_id, active, rev, updated_at)
     VALUES (?, ?, 'music', 0, ?)`,
  ).run(device, ana, clock);
  db.prepare(
    `INSERT INTO queue_items (device_id, queue, segment, ord, item_id, source, upstream_id)
     VALUES (?, 'music', 'current', 0, '00000000-0000-4000-8000-000000000001', 'jellyfin', ?)`,
  ).run(device, KEPT_TRACK);
  db.prepare(
    `INSERT INTO play_history (device_id, seq, queue, source, upstream_id, played_at)
     VALUES (?, 0, 'music', 'jellyfin', ?, ?)`,
  ).run(device, KEPT_TRACK, clock);
  db.prepare(
    `INSERT INTO lists (id, user_id, kind, name, created_at, updated_at)
     VALUES ('list', ?, 'listening', 'Mine', ?, ?)`,
  ).run(ana, clock, clock);
  db.prepare(
    `INSERT INTO list_items (list_id, ord, source, upstream_id) VALUES ('list', 0, 'jellyfin', ?)`,
  ).run(KEPT_TRACK);
  db.prepare(
    `INSERT INTO library_claims (user_id, source, item_id, reason, created_at)
     VALUES (?, 'jellyfin', ?, 'requested', ?), (?, 'jellyfin', ?, 'requested', ?)`,
  ).run(ana, KEPT_TRACK, clock, bo, OLD_ALBUM_ID, clock);
  return device;
}

interface UserState {
  PlayCount: number;
  IsFavorite: boolean;
  Played: boolean;
  LastPlayedDate?: string;
}

/**
 * Jellyfin as it stands: the album's folder walk, its lookup and tracks, the old album's, and each
 * person's state. `seen` says whether Jellyfin has acted on the deletes it was told of.
 */
function jellyfinStandIn() {
  const state = {
    seen: false,
    failNext: null as null | 'userData' | 'deleted' | 'oldAlbum',
    reports: [] as { Path: string; UpdateType: string }[][],
    posted: [] as { token: string; item: string; body: Record<string, unknown> }[],
    users: new Map<string, UserState>(),
  };
  const replay = replayFetch([
    recorded('musicbrainz', 'release-slip-cd'),
    recorded('jellyfin', 'virtual-folders'),
    recorded('jellyfin', 'users-list'),
  ]);
  const folderPage = (at: string) =>
    jsonOf(recorded('jellyfin', `items-folder-${at}`)) as { Items: Record<string, unknown>[] };
  const trackPage = jsonOf(recorded('jellyfin', 'index-album-tracks-1')) as {
    Items: Record<string, unknown>[];
  };
  const lookup = jsonOf(recorded('jellyfin', 'index-album-lookup')) as {
    Items: Record<string, unknown>[];
  };
  const userData = jsonOf(recorded('jellyfin', 'jf-userdata')) as Record<string, unknown>;
  const artist = { Name: 'Nine Inch Nails', Id: ARTIST_ID };
  const albumTrack = (id: string, i: number, path: string, extra: Record<string, unknown>) => ({
    ...trackPage.Items[0],
    Id: id,
    Name: SLIP[i]!.title,
    IndexNumber: i + 1,
    RunTimeTicks: SLIP[i]!.length * 10_000,
    AlbumId: ALBUM_ID,
    Album: 'The Slip',
    AlbumArtist: 'Nine Inch Nails',
    AlbumArtists: [artist],
    ArtistItems: [artist],
    Artists: ['Nine Inch Nails'],
    Path: path,
    ...extra,
  });
  const tracksOf = (album: string) => {
    if (album === ALBUM_ID) {
      const ours = SLIP.map((track, i) =>
        albumTrack(newTrack(i), i, `${JELLYFIN_MUSIC}/${FILES[i]}`, {
          ProviderIds: {
            MusicBrainzRecording: track.recording.id,
            MusicBrainzTrack: track.id,
            MusicBrainzAlbum: CD_RELEASE,
            MusicBrainzReleaseGroup: GROUP,
          },
        }),
      );
      const kept = albumTrack(KEPT_TRACK, 2, `${JELLYFIN_MUSIC}/${KEPT_FILE}`, {
        ProviderIds: { MusicBrainzRecording: SLIP[2]!.recording.id },
        Container: 'ogg',
      });
      return state.seen ? ours : [...ours, kept];
    }
    if (album === OLD_ALBUM_ID && !state.seen) {
      return [
        albumTrack(NAMED_TRACK, 3, `${JELLYFIN_MUSIC}/${NAMED_FILE}`, {
          AlbumId: OLD_ALBUM_ID,
          IndexNumber: null,
          ProviderIds: {},
        }),
      ];
    }
    return [];
  };
  const albumItem = (id: string, path: string) => ({
    ...lookup.Items[0],
    Id: id,
    Name: 'The Slip',
    ProductionYear: 2008,
    AlbumArtist: 'Nine Inch Nails',
    AlbumArtists: [artist],
    ArtistItems: [artist],
    Artists: ['Nine Inch Nails'],
    ProviderIds: id === ALBUM_ID ? { MusicBrainzReleaseGroup: GROUP } : {},
    Path: path,
  });
  const fail = (step: NonNullable<typeof state.failNext>) => {
    if (state.failNext !== step) return false;
    state.failNext = null;
    return true;
  };
  const unavailable = () => new Response('Service Unavailable', { status: 503 });

  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    const query = url.searchParams;
    const token = /Token="([^"]*)"/.exec(
      new Headers(init?.headers).get('authorization') ?? '',
    )?.[1];
    if (url.pathname === '/Library/Media/Updated') {
      const { Updates } = JSON.parse(String(init?.body)) as {
        Updates: { Path: string; UpdateType: string }[];
      };
      if (Updates[0]?.UpdateType === 'Deleted' && fail('deleted')) return unavailable();
      state.reports.push(Updates);
      return new Response(null, { status: 204 });
    }
    const userItem = /^\/UserItems\/([^/]+)\/UserData$/.exec(url.pathname)?.[1];
    if (userItem !== undefined) {
      const key = `${token}|${userItem}`;
      if (method === 'POST') {
        if (fail('userData')) return unavailable();
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        state.posted.push({ token: token!, item: userItem, body });
        state.users.set(key, body as unknown as UserState);
      }
      const now = state.users.get(key) ?? { PlayCount: 0, IsFavorite: false, Played: false };
      const { LastPlayedDate: _recorded, ...base } = userData;
      return Response.json({ ...base, PlaybackPositionTicks: 0, ...now, ItemId: userItem });
    }
    if (url.pathname === '/Items' && query.get('Fields') === 'Path') {
      const parent = query.get('ParentId');
      const items =
        parent === LIBRARY_ID
          ? [
              {
                ...folderPage('library').Items[0],
                Id: ARTIST_ID,
                Path: `${JELLYFIN_MUSIC}/Nine Inch Nails`,
              },
            ]
          : parent === ARTIST_ID
            ? [
                albumItem(ALBUM_ID, `${JELLYFIN_MUSIC}/${ALBUM_FOLDER}`),
                ...(state.seen
                  ? []
                  : [albumItem(OLD_ALBUM_ID, `${JELLYFIN_MUSIC}/${NAMED_FOLDER}`)]),
              ]
            : tracksOf(parent ?? '');
      return Response.json({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });
    }
    if (url.pathname === '/Items' && query.get('IncludeItemTypes') === 'MusicAlbum') {
      const id = query.get('Ids');
      if (id === OLD_ALBUM_ID && fail('oldAlbum')) return unavailable();
      const there = id === ALBUM_ID || (id === OLD_ALBUM_ID && !state.seen);
      const items = there ? [albumItem(id!, '')] : [];
      return Response.json({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });
    }
    if (url.pathname === '/Items' && query.get('IncludeItemTypes') === 'Audio') {
      const items = tracksOf(query.get('ParentId') ?? '');
      return Response.json({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });
    }
    return replay(input, init);
  };
  return { fetch, state };
}

const row = (): QbitTorrent =>
  ({
    ...(jsonOf(recorded('qbittorrent', 'info-done')) as QbitTorrent[])[0]!,
    hash: HASH,
    category: 'auralis-music',
    save_path: QBIT_DOWNLOADS,
  }) as QbitTorrent;

function listed() {
  return readdirSync(torrent, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry, index) => ({
      index,
      name: `${TORRENT}/${relative(torrent, join(entry.parentPath, entry.name))}`,
      size: statSync(join(entry.parentPath, entry.name)).size,
      priority: 1,
    }));
}

const KEY = Buffer.alloc(32, 7);

function importDeps(fetch: FetchLike): AlbumImportDeps {
  const client = (token: string, serverKey = false) =>
    new JellyfinClient({ baseUrl: 'http://upstream.invalid', token, fetch, serverKey });
  saveLink(db, KEY, {
    userId: ana,
    service: 'jellyfin',
    upstreamUserId: 'user-1',
    token: 'ana-token',
    state: 'linked',
  });
  saveLink(db, KEY, {
    userId: bo,
    service: 'jellyfin',
    upstreamUserId: 'user-2',
    token: 'bo-token',
    state: 'linked',
  });
  const tokens: Record<string, string> = { [ana]: 'ana-token', [bo]: 'bo-token' };
  return {
    db,
    mediaDir: media,
    downloadsPath: QBIT_DOWNLOADS,
    qbittorrent: { withHashes: async () => [row()], files: async () => listed() },
    editions: recordedAlbumEditions(db),
    musicBrainz: new MusicBrainzClient({
      baseUrl: 'http://upstream.invalid',
      fetch,
      userAgent: MUSICBRAINZ_USER_AGENT,
      clock: { now: () => 0, sleep: async () => undefined },
    }),
    coverArt: null,
    jellyfin: client('<token>', true),
    people: () => jellyfinPeople(db, (userId) => client(tokens[userId]!)),
    clone: (from, to) => copyFile(from, to, constants.COPYFILE_EXCL),
    now: () => clock,
    log: { error: (_details, message) => errors.push(message) },
  };
}

/** The album's request at `importing`, its torrent finished. */
function importing(): string {
  const { request } = createRequest(db, ana, ALBUM_REF, clock);
  saveRequest(
    db,
    request.id,
    {
      state: { status: 'importing' },
      release: { id: 'slip', title: TORRENT, source: 'indexer-a', size: 1, details: {} },
      handle: { hash: HASH, key: 'k', addedAt: clock, releaseGroupId: GROUP, pack: false },
    },
    clock,
  );
  return request.id;
}

const IMPORT_KEY = 'key-1';

type StandIn = ReturnType<typeof jellyfinStandIn>['state'];

/**
 * Calls the import as the job would, turn after turn, until the album arrives; Jellyfin acts on the
 * deletes it is told of between one turn and the next. A turn that throws is named by its error.
 */
async function importAll(deps: AlbumImportDeps, id: string, state: StandIn) {
  const step = albumImport(deps);
  const answers: unknown[] = [];
  for (let turn = 0; turn < 6; turn += 1) {
    try {
      const answer = await step(getRequest(db, id)!, IMPORT_KEY);
      answers.push(answer);
      if ((answer as { kind: string }).kind === 'arrived') return answers;
    } catch (error) {
      answers.push((error as Error).name);
    }
    if (deletedReports(state).length > 0) state.seen = true;
  }
  return answers;
}

const lettingYou = newTrack(2);
const discipline = newTrack(3);
const jf = (id: string) => ({ source: 'jellyfin', id });
/** Each Deleted report Jellyfin was sent, its paths in name order. */
const deletedReports = (state: StandIn) =>
  state.reports
    .filter((report) => report[0]?.UpdateType === 'Deleted')
    .map((report) => [...report].sort((a, b) => a.Path.localeCompare(b.Path)));
const DELETED = [KEPT_FILE, NAMED_FILE, NAMED_FOLDER].sort().map((relPath) => ({
  Path: `${JELLYFIN_MUSIC}/${relPath}`,
  UpdateType: 'Deleted',
}));

/** Each person's state as Jellyfin held it before the album came. */
function seedStates(state: StandIn) {
  state.users.set(`ana-token|${KEPT_TRACK}`, {
    PlayCount: 3,
    IsFavorite: true,
    Played: true,
    LastPlayedDate: '2026-11-01T10:00:00.0000000Z',
  });
  state.users.set(`ana-token|${lettingYou}`, {
    PlayCount: 1,
    IsFavorite: false,
    Played: true,
    LastPlayedDate: '2026-11-09T10:00:00.0000000Z',
  });
  state.users.set(`bo-token|${NAMED_TRACK}`, {
    PlayCount: 2,
    IsFavorite: false,
    Played: true,
    LastPlayedDate: '2026-10-01T10:00:00.0000000Z',
  });
}

describe('[M3.albums/c] kept songs from an album are replaced when it arrives', () => {
  it('[M3.albums/c] both kept songs give way to the album’s FLACs: files, folders, each person’s state, every reference, and one Deleted report', async () => {
    const { kept, named } = await keptSongs();
    const device = anaListening();
    const { fetch, state } = jellyfinStandIn();
    seedStates(state);
    const id = importing();

    const answers = await importAll(importDeps(fetch), id, state);

    expect(answers).toEqual([
      { kind: 'waiting' },
      { kind: 'arrived', ref: { source: 'jellyfin', id: ALBUM_ID } },
    ]);
    expect(existsSync(join(music, KEPT_FILE))).toBe(false);
    expect(existsSync(join(music, NAMED_FILE))).toBe(false);
    expect(existsSync(join(music, NAMED_FOLDER))).toBe(false);
    expect(readdirSync(join(music, ALBUM_FOLDER)).sort()).toEqual(
      [...FILES.map((file) => file.split('/').at(-1)!), 'cover.jpg'].sort(),
    );
    expect(readdirSync(join(music, 'Nine Inch Nails'))).toEqual(['2008 - The Slip']);

    expect(state.posted.sort((a, b) => a.token.localeCompare(b.token))).toEqual([
      {
        token: 'ana-token',
        item: lettingYou,
        body: {
          PlaybackPositionTicks: 0,
          PlayCount: 3,
          Played: true,
          IsFavorite: true,
          LastPlayedDate: '2026-11-09T10:00:00.0000000Z',
        },
      },
      {
        token: 'bo-token',
        item: discipline,
        body: {
          PlaybackPositionTicks: 0,
          PlayCount: 2,
          Played: true,
          IsFavorite: false,
          LastPlayedDate: '2026-10-01T10:00:00.0000000Z',
        },
      },
    ]);
    expect(errors).toEqual([
      'Jellyfin users with no Auralis account kept their state on the replaced songs only',
    ]);

    const one = (sql: string) => db.prepare(sql).all(device);
    expect(one('SELECT upstream_id FROM queue_items WHERE device_id = ?')).toEqual([
      { upstream_id: lettingYou },
    ]);
    expect(one('SELECT upstream_id FROM play_history WHERE device_id = ?')).toEqual([
      { upstream_id: lettingYou },
    ]);
    expect(db.prepare('SELECT upstream_id FROM list_items').all()).toEqual([
      { upstream_id: lettingYou },
    ]);
    expect(claimsOf(db, ana)).toEqual(
      expect.arrayContaining([
        { ref: jf(lettingYou), reason: 'requested' },
        { ref: jf(ALBUM_ID), reason: 'added' },
      ]),
    );
    expect(claimsOf(db, ana)).toHaveLength(2);
    expect(claimsOf(db, bo)).toEqual([{ ref: jf(ALBUM_ID), reason: 'requested' }]);

    expect(getRequest(db, kept)!.result).toEqual(jf(lettingYou));
    expect(getRequest(db, named)!.result).toEqual(jf(discipline));
    expect(keptTrack(db, KEPT_ID)).toEqual(jf(lettingYou));
    expect(keptTrack(db, NAMED_ID)).toEqual(jf(discipline));

    expect(deletedReports(state)).toEqual([DELETED]);
    expect(indexedRow(db, 'jellyfin', OLD_ALBUM_ID)).toBeUndefined();
    expect(indexedRow(db, 'jellyfin', NAMED_TRACK)).toBeUndefined();
    expect(indexedRow(db, 'jellyfin', KEPT_TRACK)).toBeUndefined();
    expect(indexedRow(db, 'jellyfin', lettingYou)?.parentId).toBe(ALBUM_ID);
  });

  it('[M3.albums/c] a keep the household’s own file answered is not replaced: its file, folder, state and references stay', async () => {
    const { named } = await keptSongs();
    rmSync(join(music, NAMED_FILE));
    writeFileSync(join(music, NAMED_FILE), 'the household’s own');
    anaListening();
    const { fetch, state } = jellyfinStandIn();
    seedStates(state);
    const id = importing();

    await importAll(importDeps(fetch), id, state);

    expect(getRequest(db, named)!.result).toEqual(jf(NAMED_TRACK));
    expect(keptTrack(db, NAMED_ID)).toEqual(jf(NAMED_TRACK));
    expect(state.posted.map(({ item }) => item)).toEqual([lettingYou]);
    expect(claimsOf(db, bo)).toEqual([{ ref: jf(OLD_ALBUM_ID), reason: 'requested' }]);
    expect(indexedRow(db, 'jellyfin', OLD_ALBUM_ID)).toBeDefined();
    expect(readFileSync(join(music, NAMED_FILE), 'utf8')).toBe('the household’s own');
    expect(readdirSync(join(music, NAMED_FOLDER)).sort()).toEqual([
      'Discipline.opus',
      'album.nfo',
      'folder.jpg',
    ]);
    expect(existsSync(join(music, KEPT_FILE))).toBe(false);
    expect(deletedReports(state)).toEqual([[DELETED.find(({ Path }) => Path.endsWith(KEPT_FILE))]]);
  });

  it('[M3.albums/c] a folder the keep made that holds anything else stays', async () => {
    await keptSongs();
    writeFileSync(join(music, NAMED_FOLDER, 'notes.txt'), 'someone’s');
    const { fetch, state } = jellyfinStandIn();
    const id = importing();

    await importAll(importDeps(fetch), id, state);

    expect(existsSync(join(music, NAMED_FILE))).toBe(false);
    expect(readdirSync(join(music, NAMED_FOLDER)).sort()).toEqual([
      'album.nfo',
      'folder.jpg',
      'notes.txt',
    ]);
    expect(deletedReports(state)).toEqual([DELETED.filter(({ Path }) => Path.endsWith('.opus'))]);
  });

  it('[M3.albums/c] a kept song the album has no track for stays as it is', async () => {
    const { named } = await keptSongs();
    const other: SongMatch = { ...NAMED_MATCH, title: 'Not on The Slip' };
    db.prepare('UPDATE requests SET release = ? WHERE id = ?').run(
      JSON.stringify({
        id: NAMED_ID,
        title: other.title,
        source: 'YouTube Music',
        size: 1000,
        details: { youtubeMusicId: NAMED_ID, match: other },
      }),
      named,
    );
    const { fetch, state } = jellyfinStandIn();
    const id = importing();

    await importAll(importDeps(fetch), id, state);

    expect(existsSync(join(music, NAMED_FILE))).toBe(true);
    expect(getRequest(db, named)!.result).toEqual(jf(NAMED_TRACK));
    expect(deletedReports(state)).toEqual([[DELETED.find(({ Path }) => Path.endsWith(KEPT_FILE))]]);
  });

  it('[M3.albums/c] with no kept songs, the album arrives and nothing is deleted', async () => {
    const { fetch, state } = jellyfinStandIn();
    const id = importing();
    expect(await importAll(importDeps(fetch), id, state)).toEqual([
      { kind: 'arrived', ref: { source: 'jellyfin', id: ALBUM_ID } },
    ]);
    expect(deletedReports(state)).toEqual([]);
  });
});

describe('[M3.albums/c] a repeat after a crash finishes the replacing once', () => {
  it.each(['userData', 'deleted', 'oldAlbum'] as const)(
    '[M3.albums/c] Jellyfin away at %s',
    async (step) => {
      await keptSongs();
      const { fetch, state } = jellyfinStandIn();
      seedStates(state);
      state.failNext = step;
      const id = importing();

      const answers = await importAll(importDeps(fetch), id, state);

      expect(answers).toContain('StepUnavailable');
      expect(answers.at(-1)).toEqual({
        kind: 'arrived',
        ref: { source: 'jellyfin', id: ALBUM_ID },
      });
      expect(state.posted.map(({ item }) => item).sort()).toEqual([lettingYou, discipline].sort());
      expect(deletedReports(state)).toEqual([DELETED]);
      expect(existsSync(join(music, NAMED_FOLDER))).toBe(false);
      expect(keptTrack(db, KEPT_ID)).toEqual(jf(lettingYou));
    },
  );

  it('[M3.albums/c] a path noted before its delete is reported, though the try stopped before noting it gone', async () => {
    await keptSongs();
    const { fetch, state } = jellyfinStandIn();
    const id = importing();
    const deps = importDeps(fetch);
    deps.jellyfin = new Proxy(deps.jellyfin, {
      get(target, name, receiver) {
        if (name !== 'reportDeleted') return Reflect.get(target, name, receiver);
        return async () => {
          throw new Error('the server stopped');
        };
      },
    });
    await importAll(deps, id, state);
    const handle = getRequest(db, id)!.handle as { replacing: Record<string, unknown> };
    expect((handle.replacing.deleted as string[]).sort()).toEqual(
      [KEPT_FILE, NAMED_FILE, NAMED_FOLDER].sort(),
    );
    // As if the try stopped after its first delete, before the rest was noted.
    const { deleted: _deleted, reported: _reported, ...cut } = handle.replacing;
    noteHandle(db, id, { ...handle, replacing: { ...cut, deleting: [KEPT_FILE] } });

    const answers = await importAll(importDeps(fetch), id, state);

    expect(answers.at(-1)).toEqual({ kind: 'arrived', ref: { source: 'jellyfin', id: ALBUM_ID } });
    expect(deletedReports(state)).toEqual([[DELETED.find(({ Path }) => Path.endsWith(KEPT_FILE))]]);
  });
});
