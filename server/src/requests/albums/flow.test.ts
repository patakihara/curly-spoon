/**
 * One album request through the steps `server.ts` registers: `albumSteps` built from configuration,
 * with the shared Prowlarr and MusicBrainz clients on one fake clock, driven by the real job from
 * `requested` to `inLibrary`. It checks the hand-offs between search, download, import and replace,
 * which each step's own tests only stand in for.
 *
 * Every upstream answers from its recordings: Prowlarr's `indexers` and `music-slip`, MusicBrainz's
 * The Slip (`rg-slip`, `releases-slip`, `release-slip-cd`), Jellyfin's library, users, report and
 * index answers. Where no recording holds a call, a stand-in answers the recorded shape:
 * - Prowlarr's link of the picked row redirects to a magnet as `link-magnet-music` does.
 * - qBittorrent keeps its torrents as recorded rows (`info-metadata`, then `info-done` once
 *   fetched) and its files as the fixture album's, as download.test.ts does.
 * - Jellyfin's folder walk, album and person state are recorded rows moved onto the album's ids and
 *   paths, as replace.test.ts does.
 * The fixture album (scripts/fixtures/album.mjs) is the finished download, in a temp Downloads, and
 * is copied into staging, as tmpfs and ext4 cannot clone.
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
import { type Clock, MUSICBRAINZ_GAP_MS } from '../../adapters/musicbrainz/client.js';
import { ALBUM_GROUPS } from '../../adapters/record-musicbrainz.js';
import { loadConfig } from '../../config.js';
import { applyRow, emptyCounts, indexedRow } from '../../libraryIndex/store.js';
import type { IndexRow } from '../../libraryIndex/rows.js';
import { remux } from '../../music/opus/remux.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, getRequest, saveRequest } from '../../store/requests.js';
import { saveLink } from '../../store/upstreamLinks.js';
import { upsertUser } from '../../store/users.js';
import { advanceRequests, type RequestJobDeps } from '../job.js';
import { musicBrainzOf } from '../musicBrainz.js';
import { PROWLARR_GAP_MS, prowlarrOf } from '../prowlarr.js';
import { keptTrack } from '../songs/kept.js';
import type { SongMatch } from '../songs/match.js';
import { songComments } from '../songs/tags.js';
import { stepsRegistry } from '../steps.js';
import { albumSteps } from './index.js';
import { jellyfinPeople } from './replace.js';

const here = dirname(fileURLToPath(import.meta.url));
const adapters = join(here, '..', '..', 'adapters');
const FIXTURE = join(here, 'fixtures', 'the-slip');
const CLIP = join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm');
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const jsonOf = (recording: Recording) => (recording.response.body as { json: unknown }).json;
/** A recording's answer, given to the call this request makes. */
const answerAs = (recording: Recording, input: string, init?: RequestInit, json?: unknown) => {
  const url = new URL(input);
  const request = {
    ...recording.request,
    method: init?.method ?? 'GET',
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
  };
  const response =
    json === undefined ? recording.response : { ...recording.response, body: { json } };
  return replayFetch([{ ...recording, request, response }])(input, init);
};

const { group: GROUP, cd: CD_RELEASE } = ALBUM_GROUPS.slip;
const SLIP = (
  jsonOf(recorded('musicbrainz', 'release-slip-cd')) as {
    media: { tracks: { id: string; title: string; length: number; recording: { id: string } }[] }[];
  }
).media[0]!.tracks;
const pad = (n: number) => String(n).padStart(2, '0');
const ALBUM_FOLDER = 'Nine Inch Nails/2008 - The Slip';
const FILES = SLIP.map((track, i) => `${ALBUM_FOLDER}/${pad(i + 1)} - ${track.title}.flac`);

/** The row search picks for The Slip (search.test.ts), and the link Prowlarr resolves it by. */
const PICKED = 'Nine Inch Nails The Slip Album  24Bit 44 1kHz FLAC Beats⭐';
const PICKED_LINK = '/1/download?link=link-b79454e43ee8';
const MAGNET = recorded('prowlarr', 'link-magnet-music').response.headers['location']!;
const HASH = /btih:([0-9A-Fa-f]{40})/.exec(MAGNET)![1]!.toLowerCase();

const QBIT_DOWNLOADS = '/data/Downloads';
const TORRENT = 'Nine Inch Nails - The Slip (2008) [FLAC]';
const JELLYFIN_MUSIC = '/data/media/Music';
const LIBRARY_ID = recorded('jellyfin', 'items-folder-library').request.query.ParentId!;
const ARTIST_ID = 'a0000000000000000000000000000001';
const ALBUM_ID = 'a0000000000000000000000000000002';
const newTrack = (i: number) => `b00000000000000000000000000000${pad(i + 1)}`;
const KEPT_TRACK = 'c0000000000000000000000000000001';
const KEPT_ID = 'keptSlip003';
const KEPT_FILE = `${ALBUM_FOLDER}/03 - Letting You.opus`;
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

/** The job's turns come closer than the Prowlarr gap, so the link waits on it. */
const TURN_MS = 2_000;

let dir: string;
let media: string;
let db: Db;
let ana: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-album-flow-'));
  media = join(dir, 'media');
  mkdirSync(join(media, 'Music'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(
    join(dir, 'keys.env'),
    ['PROWLARR_API_KEY', 'QBITTORRENT_API_KEY'].map((name) => `${name}=a-${name}`).join('\n'),
  );
  writeFileSync(join(dir, 'jellyfin.key'), 'a-jellyfin-key');
  db = openDatabase(':memory:');
  ana = upsertUser(db, { username: 'ana', role: 'member' }).id;
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const config = () =>
  loadConfig({
    DATA_DIR: join(dir, 'data'),
    SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
    LRCLIB_URL: '',
    PROWLARR_URL: 'http://prowlarr.invalid',
    PROWLARR_API_KEY_FILE: join(dir, 'keys.env'),
    QBITTORRENT_URL: 'http://qbittorrent.invalid',
    QBITTORRENT_API_KEY_FILE: join(dir, 'keys.env'),
    QBITTORRENT_DOWNLOADS_PATH: QBIT_DOWNLOADS,
    MEDIA_DIR: media,
    JELLYFIN_URL: 'http://jellyfin.invalid',
    JELLYFIN_API_KEY_FILE: join(dir, 'jellyfin.key'),
    MUSICBRAINZ_URL: 'http://musicbrainz.invalid',
    COVERART_URL: '',
  });

/** One clock for the job and both shared clients: a sleep moves it on, and is noted. */
function fakeClock(): Clock & { slept: number[] } {
  let now = Date.UTC(2026, 10, 13, 8);
  const slept: number[] = [];
  return {
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
    slept,
  };
}

/** Prowlarr's search and indexers as recorded; the picked row's link as `link-magnet-music`. */
function prowlarrUpstream(clock: Clock) {
  const replay = replayFetch(['indexers', 'music-slip'].map((call) => recorded('prowlarr', call)));
  const asked: string[] = [];
  /** When each search and link was asked: the calls that reach the indexers' sites. */
  const sites: number[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    url.searchParams.delete('apikey');
    asked.push(`${url.pathname}${url.search}`);
    if (url.pathname !== '/api/v1/indexer') sites.push(clock.now());
    if (`${url.pathname}${url.search}` === PICKED_LINK) {
      return answerAs(recorded('prowlarr', 'link-magnet-music'), input, init);
    }
    return replay(input, init);
  };
  return { fetch, asked, sites };
}

/** The fixture album's files as qBittorrent lists them under the torrent's folder. */
function fixtureFiles() {
  return readdirSync(FIXTURE, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry, index) => ({
      index,
      name: `${TORRENT}/${relative(FIXTURE, join(entry.parentPath, entry.name))}`,
      size: statSync(join(entry.parentPath, entry.name)).size,
    }));
}

/**
 * qBittorrent as its recordings answer, keeping what each call does. `advance` is the world between
 * two turns: the metadata comes in (stopped there, as asked), and a started torrent finishes, its
 * files in Downloads.
 */
function qbittorrentUpstream() {
  let torrent: {
    row: Record<string, unknown>;
    listed: boolean;
    priorities: Map<number, number>;
  } | null = null;
  const asked: { path: string; form: Record<string, string> }[] = [];
  const recordedAs = (call: string, input: string, init?: RequestInit) =>
    answerAs(recorded('qbittorrent', call), input, init);
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const path = url.pathname.replace('/api/v2/', '');
    const form = Object.fromEntries(
      new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
    );
    asked.push({ path, form });
    switch (path) {
      case 'torrents/info': {
        const hashes = (url.searchParams.get('hashes') ?? '').split('|');
        const rows = torrent !== null && hashes.includes(HASH) ? [torrent.row] : [];
        return answerAs(recorded('qbittorrent', 'info-metadata'), input, init, rows);
      }
      case 'torrents/createCategory':
        return recordedAs('create-category', input, init);
      case 'torrents/add': {
        const [template] = jsonOf(recorded('qbittorrent', 'info-metadata')) as Record<
          string,
          unknown
        >[];
        torrent = {
          row: { ...template, hash: HASH, category: form['category'], tags: form['tags'] },
          listed: false,
          priorities: new Map(),
        };
        return recordedAs('add-magnet', input, init);
      }
      case 'torrents/files': {
        const [template] = jsonOf(recorded('qbittorrent', 'files')) as Record<string, unknown>[];
        const json = torrent?.listed
          ? fixtureFiles().map((file) => ({
              ...template,
              ...file,
              priority: torrent!.priorities.get(file.index) ?? 1,
              progress: torrent!.row['progress'],
            }))
          : [];
        return answerAs(recorded('qbittorrent', 'files'), input, init, json);
      }
      case 'torrents/filePrio':
        for (const id of (form['id'] ?? '').split('|')) {
          torrent?.priorities.set(Number(id), Number(form['priority']));
        }
        return recordedAs('add-tag-missing', input, init);
      case 'torrents/start':
        if (torrent?.row['state'] === 'stoppedDL') torrent.row['state'] = 'downloading';
        return recordedAs('start-missing', input, init);
      case 'torrents/addTags':
        if (torrent !== null)
          torrent.row['tags'] = `${String(torrent.row['tags'])}, ${form['tags']}`;
        return recordedAs('add-tag-missing', input, init);
      default:
        throw new Error(`no stand-in for qBittorrent's ${path}`);
    }
  };
  const advance = () => {
    if (torrent === null) return;
    if (!torrent.listed) {
      torrent.listed = true;
      torrent.row = { ...torrent.row, state: 'stoppedDL', progress: 0 };
    } else if (torrent.row['state'] === 'downloading') {
      cpSync(FIXTURE, join(media, 'Downloads', TORRENT), { recursive: true });
      const [done] = jsonOf(recorded('qbittorrent', 'info-done')) as Record<string, unknown>[];
      const { hash, category, tags } = torrent.row;
      torrent.row = { ...done, hash, category, tags, save_path: QBIT_DOWNLOADS };
    }
  };
  return { fetch, asked, advance, torrent: () => torrent };
}

interface UserState {
  PlayCount: number;
  IsFavorite: boolean;
  Played: boolean;
  LastPlayedDate?: string;
}

/**
 * Jellyfin: the library, users and report as recorded; the folder walk, album and tracks as recorded
 * rows moved onto the album. It lists the kept song in the album until it has acted on a Deleted
 * report of it, and the album's own tracks once their Created report came.
 */
function jellyfinUpstream() {
  const state = {
    created: false,
    seen: false,
    reports: [] as { Path: string; UpdateType: string }[][],
    posted: [] as { token: string; item: string; body: Record<string, unknown> }[],
    users: new Map<string, UserState>(),
  };
  const replay = replayFetch([
    recorded('jellyfin', 'virtual-folders'),
    recorded('jellyfin', 'users-list'),
  ]);
  const folderPage = jsonOf(recorded('jellyfin', 'items-folder-library')) as {
    Items: Record<string, unknown>[];
  };
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
  const tracks = () => {
    const ours = state.created
      ? SLIP.map((track, i) =>
          albumTrack(newTrack(i), i, `${JELLYFIN_MUSIC}/${FILES[i]}`, {
            ProviderIds: {
              MusicBrainzRecording: track.recording.id,
              MusicBrainzTrack: track.id,
              MusicBrainzAlbum: CD_RELEASE,
              MusicBrainzReleaseGroup: GROUP,
            },
          }),
        )
      : [];
    const kept = albumTrack(KEPT_TRACK, 2, `${JELLYFIN_MUSIC}/${KEPT_FILE}`, {
      ProviderIds: { MusicBrainzRecording: SLIP[2]!.recording.id },
      Container: 'ogg',
    });
    return state.seen ? ours : [...ours, kept];
  };
  const albumItem = {
    ...lookup.Items[0],
    Id: ALBUM_ID,
    Name: 'The Slip',
    ProductionYear: 2008,
    AlbumArtist: 'Nine Inch Nails',
    AlbumArtists: [artist],
    ArtistItems: [artist],
    Artists: ['Nine Inch Nails'],
    ProviderIds: { MusicBrainzReleaseGroup: GROUP },
    Path: `${JELLYFIN_MUSIC}/${ALBUM_FOLDER}`,
  };
  const page = (items: unknown[]) =>
    Response.json({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });

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
      state.reports.push(Updates);
      return answerAs(recorded('jellyfin', 'media-updated'), input, init);
    }
    const userItem = /^\/UserItems\/([^/]+)\/UserData$/.exec(url.pathname)?.[1];
    if (userItem !== undefined) {
      const key = `${token}|${userItem}`;
      if (method === 'POST') {
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
      if (parent === LIBRARY_ID) {
        return page([
          { ...folderPage.Items[0], Id: ARTIST_ID, Path: `${JELLYFIN_MUSIC}/Nine Inch Nails` },
        ]);
      }
      if (parent === ARTIST_ID) return page([albumItem]);
      return page(parent === ALBUM_ID ? tracks() : []);
    }
    if (url.pathname === '/Items' && query.get('IncludeItemTypes') === 'MusicAlbum') {
      return page(query.get('Ids') === ALBUM_ID ? [albumItem] : []);
    }
    if (url.pathname === '/Items' && query.get('IncludeItemTypes') === 'Audio') {
      return page(query.get('ParentId') === ALBUM_ID ? tracks() : []);
    }
    return replay(input, init);
  };
  /** Jellyfin acts on what it was told between two turns. */
  const advance = () => {
    const types = state.reports.flat().map((one) => one.UpdateType);
    if (types.includes('Created')) state.created = true;
    if (types.includes('Deleted')) state.seen = true;
  };
  return { fetch, state, advance };
}

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

/** Ana's keep of Letting You, arrived as M3.keep leaves it: its Opus file, request and track. */
async function keptLettingYou(now: number): Promise<string> {
  const path = join(media, 'Music', KEPT_FILE);
  mkdirSync(dirname(path), { recursive: true });
  const from = await open(CLIP, 'r');
  const to = await open(path, 'wx');
  try {
    await remux(from, to, songComments(KEPT_ID, KEPT_MATCH));
  } finally {
    await from.close();
    await to.close();
  }
  const { request } = createRequest(
    db,
    ana,
    { medium: 'song', target: { title: KEPT_ID, creator: null, ids: { youtubeMusicId: KEPT_ID } } },
    now,
  );
  saveRequest(
    db,
    request.id,
    {
      state: { status: 'inLibrary' },
      release: {
        id: KEPT_ID,
        title: 'Letting You',
        source: 'YouTube Music',
        size: 1000,
        details: { youtubeMusicId: KEPT_ID, match: KEPT_MATCH },
      },
      handle: { id: KEPT_ID, size: 1000, made: ['Nine Inch Nails', ALBUM_FOLDER] },
      result: { source: 'jellyfin', id: KEPT_TRACK },
    },
    now,
  );
  applyRow(db, indexRow({ id: ALBUM_ID, kind: 'album', title: 'The Slip' }), now, emptyCounts());
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
    now,
    emptyCounts(),
  );
  return request.id;
}

describe('[M3.albums/c] one album request through the registered steps', () => {
  it('[M3.albums/c] The Slip goes from requested to inLibrary on albumSteps(config), and the kept Letting You gives way to its FLAC', async () => {
    const clock = fakeClock();
    const prowlarr = prowlarrUpstream(clock);
    const qbittorrent = qbittorrentUpstream();
    const jellyfin = jellyfinUpstream();
    const musicBrainz = replayFetch(
      ['rg-slip', 'releases-slip', 'release-slip-cd'].map((call) => recorded('musicbrainz', call)),
    );
    const musicBrainzAsked: number[] = [];
    const byHost: Record<string, FetchLike> = {
      'prowlarr.invalid': prowlarr.fetch,
      'qbittorrent.invalid': qbittorrent.fetch,
      'jellyfin.invalid': jellyfin.fetch,
      'musicbrainz.invalid': (input, init) => {
        musicBrainzAsked.push(clock.now());
        return musicBrainz(input, init);
      },
    };
    const fetch: FetchLike = (input, init) => {
      const to = byHost[new URL(input).hostname];
      if (to === undefined) throw new Error(`no upstream at ${input}`);
      return to(input, init);
    };

    const kept = await keptLettingYou(clock.now());
    const KEY = Buffer.alloc(32, 7);
    saveLink(db, KEY, {
      userId: ana,
      service: 'jellyfin',
      upstreamUserId: 'user-1',
      token: 'ana-token',
      state: 'linked',
    });
    jellyfin.state.users.set(`ana-token|${KEPT_TRACK}`, {
      PlayCount: 3,
      IsFavorite: true,
      Played: true,
      LastPlayedDate: '2026-11-01T10:00:00.0000000Z',
    });

    const configured = config();
    const errors: string[] = [];
    const log = { error: (_details: unknown, message: string) => void errors.push(message) };
    const made = albumSteps(configured, {
      db,
      fetch,
      log,
      now: clock.now,
      people: () =>
        jellyfinPeople(
          db,
          () =>
            new JellyfinClient({ baseUrl: 'http://jellyfin.invalid', token: 'ana-token', fetch }),
        ),
      musicBrainz: musicBrainzOf(configured, fetch, clock),
      prowlarr: prowlarrOf(configured, fetch, clock),
      clone: (from, to) => copyFile(from, to, constants.COPYFILE_EXCL),
    });
    if (!('steps' in made)) throw new Error(`albums are off: ${made.off}`);

    const job: RequestJobDeps = {
      db,
      steps: stepsRegistry([made.steps]),
      log,
      now: clock.now,
      notIndexedAfterMs: 60 * 60_000,
      stepTimeoutMs: 60_000,
      stallAfterMs: 60 * 60_000,
      holdAfterMs: 60 * 60_000,
    };
    const ref: RequestRef = {
      medium: 'album',
      target: { title: 'The Slip', creator: 'Nine Inch Nails', ids: { mbid: GROUP } },
    };
    const { request } = createRequest(db, ana, ref, clock.now());

    const statuses: string[] = [];
    for (let turn = 0; turn < 20; turn += 1) {
      const status = getRequest(db, request.id)!.state.status;
      if (statuses.at(-1) !== status) statuses.push(status);
      if (status === 'inLibrary' || status === 'failed') break;
      await advanceRequests(job);
      qbittorrent.advance();
      jellyfin.advance();
      await clock.sleep(TURN_MS);
    }

    const done = getRequest(db, request.id)!;
    expect(done.state).toEqual({ status: 'inLibrary' });
    expect(statuses[0]).toBe('requested');
    expect(statuses).toContain('downloading');
    expect(statuses).toContain('importing');
    expect(done.release?.title).toBe(PICKED);
    expect(done.result).toEqual({ source: 'jellyfin', id: ALBUM_ID });

    // Search's pick reached the download: its link resolved, the torrent added stopped and gated.
    expect(prowlarr.asked.filter((one) => one.startsWith('/api/v1/search'))).toHaveLength(1);
    expect(prowlarr.asked).toContain(PICKED_LINK);
    const add = qbittorrent.asked.find((one) => one.path === 'torrents/add')!;
    expect(add.form).toMatchObject({
      urls: MAGNET,
      category: 'auralis-music',
      stopCondition: 'MetadataReceived',
    });
    expect(String(qbittorrent.torrent()!.row['tags'])).toContain('auralis-fit');
    // The download's handle reached the import: the group and pack the gate noted.
    expect(done.handle).toMatchObject({ hash: HASH, releaseGroupId: GROUP, pack: false });

    // The 10 s gap kept the link a turn behind the search; MusicBrainz's calls 1.1 s apart.
    expect(prowlarr.sites).toHaveLength(2);
    expect(prowlarr.sites[1]! - prowlarr.sites[0]!).toBeGreaterThanOrEqual(PROWLARR_GAP_MS);
    expect(clock.slept).toContain(PROWLARR_GAP_MS - TURN_MS);
    for (const [i, at] of musicBrainzAsked.entries()) {
      if (i > 0) expect(at - musicBrainzAsked[i - 1]!).toBeGreaterThanOrEqual(MUSICBRAINZ_GAP_MS);
    }
    expect(musicBrainzAsked.length).toBeGreaterThanOrEqual(3);

    // The album is in Music, tagged files only, and in the index.
    const music = join(media, 'Music');
    expect(readdirSync(join(music, ALBUM_FOLDER)).sort()).toEqual(
      [...FILES.map((file) => file.split('/').at(-1)!), 'cover.jpg'].sort(),
    );
    const staging = join(media, '.auralis-albums');
    expect(existsSync(staging) ? readdirSync(staging) : []).toEqual([]);
    expect(indexedRow(db, 'jellyfin', ALBUM_ID)?.kind).toBe('album');
    expect(indexedRow(db, 'jellyfin', newTrack(2))?.parentId).toBe(ALBUM_ID);

    // The kept song gave way: its file gone and reported, its keep and Ana's state on the FLAC.
    expect(existsSync(join(music, KEPT_FILE))).toBe(false);
    expect(jellyfin.state.reports.filter((one) => one[0]?.UpdateType === 'Deleted')).toEqual([
      [{ Path: `${JELLYFIN_MUSIC}/${KEPT_FILE}`, UpdateType: 'Deleted' }],
    ]);
    expect(getRequest(db, kept)!.result).toEqual({ source: 'jellyfin', id: newTrack(2) });
    expect(keptTrack(db, KEPT_ID)).toEqual({ source: 'jellyfin', id: newTrack(2) });
    expect(indexedRow(db, 'jellyfin', KEPT_TRACK)).toBeUndefined();
    expect(jellyfin.state.posted).toEqual([
      {
        token: 'ana-token',
        item: newTrack(2),
        body: expect.objectContaining({ PlayCount: 3, IsFavorite: true, Played: true }),
      },
    ]);
    expect(errors).not.toContain('no torrent deleted');
  });
});
