/**
 * An album's import on a real temp media folder: the fixture album (scripts/fixtures/album.mjs) as a
 * finished torrent in Downloads, The Slip's editions and CD release from MusicBrainz's recordings,
 * and Jellyfin's recorded answers. Jellyfin's folder walk is its recorded pages with their first row
 * moved onto the album's folders and files, as no recording can list a path this test makes; the
 * album it names is the one whose lookup and tracks are recorded. Files are cloned by a copying
 * stand-in, as ext4 cannot clone; one test holds the real clone to its flag.
 */
import { createHash } from 'node:crypto';
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
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { copyFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestRef } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import { standInSteps } from '../../adapters/http/standIn.js';
import { JellyfinClient } from '../../adapters/jellyfin/client.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../../adapters/musicbrainz/client.js';
import { ALBUM_GROUPS } from '../../adapters/record-musicbrainz.js';
import type { QbitTorrent } from '../../adapters/qbittorrent/schemas.js';
import { indexedRow } from '../../libraryIndex/store.js';
import { flacComments, readFlac } from '../../music/flac/blocks.js';
import { frameStrings, readId3Tag, ufid } from '../../music/id3/frames.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, getRequest, noteHandle, saveRequest } from '../../store/requests.js';
import { upsertUser } from '../../store/users.js';
import { advanceRequests } from '../job.js';
import { type MediumSteps, stepsRegistry } from '../steps.js';
import { type Clone, reflinkClone } from './clone.js';
import { ALBUM_STAGING, albumImport, type AlbumImportDeps } from './import.js';
import { AlbumRefused } from './refused.js';
import { recordedAlbumEditions } from './fixtures/albums.js';

const here = dirname(fileURLToPath(import.meta.url));
const adapters = join(here, '..', '..', 'adapters');
const FIXTURE = join(here, 'fixtures', 'the-slip');
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const jsonOf = (recording: Recording) => (recording.response.body as { json: unknown }).json;

const { group: GROUP, cd: CD_RELEASE } = ALBUM_GROUPS.slip;
const TITLES = [
  '999,999',
  '1,000,000',
  'Letting You',
  'Discipline',
  'Echoplex',
  'Head Down',
  'Lights in the Sky',
  'Corona Radiata',
  'The Four of Us Are Dying',
  'Demon Seed',
];
const pad = (n: number) => String(n).padStart(2, '0');
const ALBUM_FOLDER = 'Nine Inch Nails/2008 - The Slip';
const FILES = TITLES.map((title, i) => `${ALBUM_FOLDER}/${pad(i + 1)} - ${title}.flac`);

/** Where qBittorrent sees Downloads, as recorded, and the torrent's folder in it. */
const QBIT_DOWNLOADS = '/data/Downloads';
const TORRENT = 'Nine Inch Nails - The Slip (2008) [FLAC]';
/** Where Jellyfin sees Music, as recorded. */
const JELLYFIN_MUSIC = '/data/media/Music';
const LIBRARY_ID = recorded('jellyfin', 'items-folder-library').request.query.ParentId!;
const ARTIST_ID = '5e1f0c2a9b8d4e7f6a5b4c3d2e1f0a9b';
/** The album of the recorded lookup and tracks. */
const ALBUM_ID = '65de8562c54b89ceef199f91bacd8709';
const HASH = '7acf8fb590b2060dd9c3146ef770169d593433b0';

const REF: RequestRef = {
  medium: 'album',
  target: { title: 'The Slip', creator: 'Nine Inch Nails', ids: { mbid: GROUP } },
};

let dir: string;
let media: string;
let music: string;
let torrent: string;
let db: Db;
let ana: string;
let clock: number;
const errors: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-album-import-'));
  media = join(dir, 'media');
  music = join(media, 'Music');
  torrent = join(media, 'Downloads', TORRENT);
  mkdirSync(music, { recursive: true });
  cpSync(FIXTURE, torrent, { recursive: true });
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 10, 10, 8);
  ana = upsertUser(db, { username: 'ana', role: 'member' }).id;
  errors.length = 0;
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Every file under a folder, with the hash of its bytes. */
function hashes(folder: string): Record<string, string> {
  const all: Record<string, string> = {};
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    all[relative(folder, path)] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
  return all;
}

/** The torrent's files as qBittorrent lists them, all fetched. */
function listed() {
  return readdirSync(torrent, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry, index) => ({
      index,
      name: `${TORRENT}/${relative(torrent, join(entry.parentPath, entry.name))}`,
      size: entry.isFile() ? statSync(join(entry.parentPath, entry.name)).size : 1,
      priority: 1,
    }));
}

/** The recorded finished torrent's row, moved onto the album's hash and Downloads. */
const row = (): QbitTorrent =>
  ({
    ...(jsonOf(recorded('qbittorrent', 'info-done')) as QbitTorrent[])[0]!,
    hash: HASH,
    category: 'auralis-music',
    save_path: QBIT_DOWNLOADS,
  }) as QbitTorrent;

/**
 * Jellyfin's answer for one folder: as recorded, its first row moved onto the album's artist, its
 * folder, or (one each) the files it lists; or as recorded alone while it lists nothing of ours.
 */
function folderAnswer(parent: string, paths: readonly string[]): Response {
  const at = { [LIBRARY_ID]: 'library', [ARTIST_ID]: 'artist', [ALBUM_ID]: 'album' }[parent];
  if (at === undefined) return new Response('Error processing request.', { status: 400 });
  const page = jsonOf(recorded('jellyfin', `items-folder-${at}`)) as {
    Items: Record<string, unknown>[];
  };
  if (paths.length === 0) return Response.json(page);
  const [artist, album] = paths[0]!.slice(JELLYFIN_MUSIC.length + 1).split('/');
  const [first, ...rest] = page.Items;
  const moved =
    at === 'album'
      ? paths.map((path, i) => ({ ...first, Id: `track${i}`, AlbumId: ALBUM_ID, Path: path }))
      : [
          {
            ...first,
            ...(at === 'library'
              ? { Id: ARTIST_ID, Path: `${JELLYFIN_MUSIC}/${artist}` }
              : { Id: ALBUM_ID, Path: `${JELLYFIN_MUSIC}/${artist}/${album}` }),
          },
        ];
  return Response.json({ ...page, Items: [...moved, ...rest] });
}

/** Jellyfin and MusicBrainz as recorded; Jellyfin lists what `shown` says, and reports are kept. */
function upstreams(shown: () => readonly string[]) {
  const replay = replayFetch([
    recorded('musicbrainz', 'release-slip-cd'),
    ...['virtual-folders', 'media-updated', 'index-album-lookup', 'index-album-tracks-1'].map(
      (call) => recorded('jellyfin', call),
    ),
  ]);
  const asked: string[] = [];
  const reports: { Updates: { Path: string; UpdateType: string }[] }[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    asked.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    if (url.pathname === '/Library/Media/Updated') reports.push(JSON.parse(String(init?.body)));
    const parent = url.searchParams.get('ParentId');
    if (url.pathname === '/Items' && parent !== null && url.searchParams.get('Fields') === 'Path') {
      return folderAnswer(parent, shown());
    }
    return replay(input, init);
  };
  return { fetch, asked, reports };
}

/** Copies, as ext4 cannot clone. */
const copying: Clone = (from, to) => copyFile(from, to, constants.COPYFILE_EXCL);

function importDeps(fetch: FetchLike, more: Partial<AlbumImportDeps> = {}): AlbumImportDeps {
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
    jellyfin: new JellyfinClient({
      baseUrl: 'http://upstream.invalid',
      token: '<token>',
      fetch,
      serverKey: true,
    }),
    people: () => [],
    clone: copying,
    now: () => clock,
    log: { error: (_details, message) => errors.push(message) },
    ...more,
  };
}

/** A request at `importing`, its torrent's handle as the download left it. */
function importing(): string {
  const { request } = createRequest(db, ana, REF, clock);
  saveRequest(
    db,
    request.id,
    {
      state: { status: 'importing' },
      release: {
        id: 'slip',
        title: TORRENT,
        source: 'indexer-a',
        size: 1,
        details: {},
      },
      handle: { hash: HASH, key: 'k', addedAt: clock, releaseGroupId: GROUP, pack: false },
    },
    clock,
  );
  return request.id;
}

const KEY = 'key-1';
const call = (deps: AlbumImportDeps, id: string, key = KEY) =>
  albumImport(deps)(getRequest(db, id)!, key);

const mode = (path: string) => statSync(path).mode & 0o777;
const pathsOf = (rels: readonly string[]) => rels.map((rel) => `${JELLYFIN_MUSIC}/${rel}`);

async function flacTags(path: string) {
  const file = await open(path, 'r');
  try {
    const comments = flacComments(await readFlac(file))!.comments;
    return (key: string) => comments.filter((c) => c.key === key).map(({ value }) => value);
  } finally {
    await file.close();
  }
}

/** A release track id of the recorded CD, by its place. */
const releaseTracks = (
  jsonOf(recorded('musicbrainz', 'release-slip-cd')) as {
    media: { tracks: { id: string; recording: { id: string } }[] }[];
  }
).media[0]!.tracks;

describe('[M3.albums/c] a downloaded album is imported with Auralis’s tagging', () => {
  it('[M3.albums/c] The Slip is filed in Music, tagged from the recorded CD release, its torrent’s files unchanged, reported once and indexed', async () => {
    const before = hashes(torrent);
    let shown: string[] = [];
    const { fetch, reports } = upstreams(() => shown);
    const id = importing();
    const deps = importDeps(fetch);
    const step = albumImport(deps);

    expect(await step(getRequest(db, id)!, KEY)).toEqual({ kind: 'waiting' });
    expect(readdirSync(join(music, ALBUM_FOLDER)).sort()).toEqual(
      [...FILES.map((f) => f.split('/').at(-1)!), 'cover.jpg'].sort(),
    );
    const first = await flacTags(join(music, FILES[0]!));
    expect(first('TITLE')).toEqual(['999,999']);
    expect(first('ALBUM')).toEqual(['The Slip']);
    expect(first('ALBUMARTIST')).toEqual(['Nine Inch Nails']);
    expect(first('TRACKNUMBER')).toEqual(['1']);
    expect(first('TRACKTOTAL')).toEqual(['10']);
    expect(first('DISCTOTAL')).toEqual(['1']);
    expect(first('DATE')).toEqual(['2008-07-22']);
    expect(first('ORIGINALDATE')).toEqual(['2008-05-05']);
    expect(first('MUSICBRAINZ_ALBUMID')).toEqual([CD_RELEASE]);
    expect(first('MUSICBRAINZ_RELEASEGROUPID')).toEqual([GROUP]);
    expect(first('MUSICBRAINZ_TRACKID')).toEqual([releaseTracks[0]!.recording.id]);
    expect(first('MUSICBRAINZ_RELEASETRACKID')).toEqual([releaseTracks[0]!.id]);
    expect(first('REPLAYGAIN_TRACK_GAIN')).toEqual(['-6.00 dB']);
    const last = await flacTags(join(music, FILES[9]!));
    expect(last('TITLE')).toEqual(['Demon Seed']);
    expect(last('TRACKNUMBER')).toEqual(['10']);

    expect(mode(join(music, 'Nine Inch Nails'))).toBe(0o775);
    expect(mode(join(music, ALBUM_FOLDER))).toBe(0o775);
    for (const file of FILES) expect(mode(join(music, file))).toBe(0o664);
    expect(readFileSync(join(music, ALBUM_FOLDER, 'cover.jpg'))).toEqual(
      readFileSync(join(torrent, 'cover.jpg')),
    );
    expect(hashes(torrent)).toEqual(before);
    expect(existsSync(join(media, ALBUM_STAGING, KEY))).toBe(false);

    expect(reports).toEqual([
      { Updates: pathsOf(FILES).map((Path) => ({ Path, UpdateType: 'Created' })) },
    ]);

    shown = pathsOf(FILES.slice(0, 9));
    expect(await step(getRequest(db, id)!, KEY)).toEqual({ kind: 'waiting' });
    expect(indexedRow(db, 'jellyfin', ALBUM_ID)).toBeUndefined();

    shown = pathsOf(FILES);
    expect(await step(getRequest(db, id)!, KEY)).toEqual({
      kind: 'arrived',
      ref: { source: 'jellyfin', id: ALBUM_ID },
    });
    expect(indexedRow(db, 'jellyfin', ALBUM_ID)).toBeDefined();
    expect(reports).toHaveLength(1);
  });

  it('[M3.albums/c] of a track there as both FLAC and MP3, only the FLAC is imported', async () => {
    const { fetch } = upstreams(() => []);
    await call(importDeps(fetch), importing());
    const placed = readdirSync(join(music, ALBUM_FOLDER));
    expect(placed).toContain('01 - 999,999.flac');
    expect(placed.filter((name) => name.endsWith('.mp3'))).toEqual([]);
  });

  it('[M3.albums/c] an MP3 track is tagged as ID3v2.4', async () => {
    rmSync(join(torrent, '01 - 999,999.flac'));
    const { fetch } = upstreams(() => []);
    await call(importDeps(fetch), importing());
    const tag = readId3Tag(readFileSync(join(music, ALBUM_FOLDER, '01 - 999,999.mp3')))!;
    const text = (frame: string) =>
      tag.frames.filter((f) => f.id === frame).map((f) => frameStrings(f)[0]);
    expect(tag.major).toBe(4);
    expect(text('TIT2')).toEqual(['999,999']);
    expect(text('TALB')).toEqual(['The Slip']);
    expect(text('TRCK')).toEqual(['1/10']);
    expect(tag.frames.filter((f) => f.id === 'UFID').map((f) => ufid(f).id)).toEqual([
      releaseTracks[0]!.recording.id,
    ]);
  });

  it('[M3.albums/c] the torrent’s own cover is preferred; with none, the Cover Art Archive’s release front', async () => {
    rmSync(join(torrent, 'cover.jpg'));
    const front = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const releaseFront = vi.fn(async () => ({ mime: 'image/jpeg', bytes: front }));
    const groupFront = vi.fn(async () => null);
    const { fetch } = upstreams(() => []);
    await call(importDeps(fetch, { coverArt: { releaseFront, groupFront } }), importing());
    expect(releaseFront).toHaveBeenCalledWith(CD_RELEASE);
    expect(readFileSync(join(music, ALBUM_FOLDER, 'cover.jpg'))).toEqual(front);
  });

  it('[M3.albums/c] nine files fit no edition: wrongRelease, and nothing reaches Music', async () => {
    rmSync(join(torrent, '10 - Demon Seed.flac'));
    const { fetch, reports } = upstreams(() => []);
    expect(await call(importDeps(fetch), importing())).toEqual({
      kind: 'failed',
      reason: 'wrongRelease',
    });
    expect(readdirSync(music)).toEqual([]);
    expect(reports).toEqual([]);
  });

  it('[M3.albums/c] a file set aside in qBittorrent is not read', async () => {
    const { fetch } = upstreams(() => []);
    const files = async () =>
      listed().map((file) => (file.name.includes('Demon Seed') ? { ...file, priority: 0 } : file));
    const deps = importDeps(fetch, { qbittorrent: { withHashes: async () => [row()], files } });
    expect(await call(deps, importing())).toEqual({ kind: 'failed', reason: 'wrongRelease' });
  });

  it('[M3.albums/c] a household file of the track in the album’s folder stays, and ours is skipped', async () => {
    const theirs = 'Nine Inch Nails/The Slip (2008)/03 - Letting You.mp3';
    mkdirSync(join(music, dirname(theirs)), { recursive: true });
    writeFileSync(join(music, theirs), 'the household’s');
    let shown: string[] = [];
    const { fetch, reports } = upstreams(() => shown);
    const id = importing();
    const step = albumImport(importDeps(fetch));
    await step(getRequest(db, id)!, KEY);

    expect(readFileSync(join(music, theirs), 'utf8')).toBe('the household’s');
    const ours = TITLES.map(
      (title, i) => `Nine Inch Nails/The Slip (2008)/${pad(i + 1)} - ${title}.flac`,
    ).filter((path) => !path.includes('Letting You'));
    expect(readdirSync(join(music, 'Nine Inch Nails/The Slip (2008)')).sort()).toEqual(
      [...ours.map((p) => p.split('/').at(-1)!), '03 - Letting You.mp3', 'cover.jpg'].sort(),
    );
    expect(reports[0]!.Updates.map(({ Path }) => Path)).toEqual(pathsOf(ours));

    shown = pathsOf([...ours, theirs]);
    expect(await step(getRequest(db, id)!, KEY)).toMatchObject({ kind: 'arrived' });
  });

  it('[M3.albums/c] a repeat of the key places nothing twice, even after a crash mid-placing', async () => {
    const { fetch, reports } = upstreams(() => []);
    const id = importing();
    const step = albumImport(importDeps(fetch));
    await step(getRequest(db, id)!, KEY);
    const inodes = FILES.map((file) => statSync(join(music, file)).ino);
    const handle = getRequest(db, id)!.handle as Record<string, unknown>;
    expect(handle.placing).toEqual(FILES);
    expect(handle.made).toEqual(['Nine Inch Nails', ALBUM_FOLDER]);

    await step(getRequest(db, id)!, KEY);
    // A crash after the links, before the placing was noted done.
    const { placed: _placed, folders: _folders, ...cut } = handle;
    noteHandle(db, id, cut);
    await step(getRequest(db, id)!, KEY);

    expect(readdirSync(join(music, ALBUM_FOLDER))).toHaveLength(FILES.length + 1);
    expect(FILES.map((file) => statSync(join(music, file)).ino)).toEqual(inodes);
    expect(reports.flatMap((report) => report.Updates.map(({ Path }) => Path))).toEqual(
      pathsOf(FILES),
    );
  });

  it('[M3.albums/c] a `../` name or a link among the files stops the import before anything is made', async () => {
    const { fetch } = upstreams(() => []);
    const escape = async () => [
      ...listed(),
      { index: 99, name: `${TORRENT}/../outside.flac`, size: 1, priority: 1 },
    ];
    const deps = importDeps(fetch, {
      qbittorrent: { withHashes: async () => [row()], files: escape },
    });
    await expect(call(deps, importing())).rejects.toMatchObject({ reason: 'unsafePath' });

    rmSync(join(torrent, '05 - Echoplex.flac'));
    writeFileSync(join(dir, 'elsewhere.flac'), readFileSync(join(FIXTURE, '05 - Echoplex.flac')));
    symlinkSync(join(dir, 'elsewhere.flac'), join(torrent, '05 - Echoplex.flac'));
    await expect(call(importDeps(fetch), importing())).rejects.toMatchObject({
      reason: 'unsafePath',
    });
    expect(readdirSync(music)).toEqual([]);
  });
});

describe('[M3.albums/c] each file is cloned, never copied', () => {
  it('[M3.albums/c] the real clone asks for COPYFILE_FICLONE_FORCE and never replaces', async () => {
    const copy = vi.fn(async () => undefined);
    await reflinkClone(copy as unknown as typeof copyFile)('/from', '/to');
    expect(copy).toHaveBeenCalledWith(
      '/from',
      '/to',
      constants.COPYFILE_FICLONE_FORCE | constants.COPYFILE_EXCL,
    );
  });

  it('[M3.albums/c] a filesystem that cannot clone fails importFailed, with nothing in Music', async () => {
    const refuses: Clone = async () => {
      throw Object.assign(new Error('operation not supported'), { code: 'EOPNOTSUPP' });
    };
    const { fetch } = upstreams(() => []);
    const id = importing();
    const deps = importDeps(fetch, { clone: refuses });
    await expect(call(deps, id)).rejects.toEqual(new AlbumRefused('cloneRefused'));

    const steps: MediumSteps = { ...standInSteps('album'), import: albumImport(deps) };
    await advanceRequests({
      db,
      steps: stepsRegistry([steps]),
      log: { error: (_details, message) => errors.push(message) },
      now: () => clock,
      notIndexedAfterMs: 60 * 60_000,
      stepTimeoutMs: 10_000,
      stallAfterMs: 10 * 60_000,
      holdAfterMs: 60 * 60_000,
    });
    expect(getRequest(db, id)!.state).toEqual({
      status: 'failed',
      failedStep: 'importing',
      reason: 'importFailed',
    });
    expect(readdirSync(music)).toEqual([]);
    expect(readdirSync(join(media, ALBUM_STAGING))).toEqual([]);
  });
});
