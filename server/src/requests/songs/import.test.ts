/**
 * A kept song's import through the real job, store, index, stream cache and clients, on a real temp
 * Music folder and on recordings: MusicBrainz's, the Cover Art Archive's and Jellyfin's. The stream
 * is the synthesized Opus clip behind the recorded stream host. Jellyfin's folders are its recorded
 * walk (the library's artists, an artist's albums, an album's tracks) with each answer's first row
 * moved onto the file's path, as no recording can list a path this test makes; the track's album is
 * the one whose lookup and tracks are recorded.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestRef } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverArtClient, type Cover } from '../../adapters/coverart/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch, standInsBeside } from '../../adapters/http/replay.js';
import { JellyfinClient } from '../../adapters/jellyfin/client.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../../adapters/musicbrainz/client.js';
import { indexedRow } from '../../libraryIndex/store.js';
import { opusPackets, readOggOpus } from '../../music/opus/remux.js';
import { parseInfo, pickFormat } from '../../music/schemas.js';
import { StreamCache, type StreamSource } from '../../music/streamCache.js';
import { claimsOf } from '../../store/claims.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, getRequest, saveRequest } from '../../store/requests.js';
import { rememberTracks, type StreamedTrack } from '../../store/streamedTracks.js';
import { upsertUser } from '../../store/users.js';
import { advanceRequests, type RequestJobDeps, retryRequest } from '../job.js';
import { type MediumSteps, stepsRegistry } from '../steps.js';
import { songDownload, stagedPath } from './download.js';
import { songImport } from './import.js';
import { songSearch } from './search.js';
import { STAGING_FOLDER } from './index.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters');
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const jsonOf = (recording: Recording) => (recording.response.body as { json: unknown }).json;

const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
const front = readFileSync(join(adapters, 'coverart', 'recordings', 'front.jpg'));
const ID = 'lYBUbBu4W08';
const SIZE = clip.byteLength;

/** Mama Africa's song as YouTube Music names it (the build plan's live table). */
const SONG: StreamedTrack = {
  id: ID,
  title: 'Not Gonna Give It Up (2002 Remaster)',
  artists: ['Peter Tosh'],
  album: 'Mama Africa',
  duration: 348,
  artUrl: null,
};
const REF: RequestRef = {
  medium: 'song',
  target: { title: SONG.title, creator: 'Peter Tosh', ids: { youtubeMusicId: ID } },
};
const ALBUM_FOLDER = 'Peter Tosh/1983 - Mama Africa';
const FILE = `${ALBUM_FOLDER}/03 - Not Gonna Give It Up.opus`;
/** Where Jellyfin sees Music: its one music library's one folder, as recorded. */
const JELLYFIN_MUSIC = '/data/media/Music';
/** The album and track of the recorded lookup and tracks, which the moved row names. */
const ALBUM_ID = '65de8562c54b89ceef199f91bacd8709';
const TRACK_ID = '7c8b8e35e6ec0f40736aadee1f8979bb';
const YOUTUBE_ART: Cover = { mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };

let dir: string;
let music: string;
/** This server's own staging folder, as `songSteps` names it by its instance id. */
let stagingDir: string;
let db: Db;
let ana: string;
let clock: number;
const errors: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-song-import-'));
  music = join(dir, 'media', 'Music');
  stagingDir = join(dir, 'media', STAGING_FOLDER, '0123456789abcdef');
  mkdirSync(music, { recursive: true });
  mkdirSync(stagingDir, { recursive: true });
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 10, 9, 8);
  ana = upsertUser(db, { username: 'ana', role: 'member' }).id;
  rememberTracks(db, [SONG], clock);
  errors.length = 0;
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** The Music library's id, as the recorded walk starts from it. */
const LIBRARY_ID = recorded('jellyfin', 'items-folder-library').request.query.ParentId!;
const ARTIST_ID = '5e1f0c2a9b8d4e7f6a5b4c3d2e1f0a9b';

/**
 * Jellyfin's answer for one folder: as recorded, its first row moved onto the file at `path` (under
 * the music folder), or as recorded alone while Jellyfin lists no such file.
 */
function folderAnswer(parent: string, path: string | null): Response {
  const at = { [LIBRARY_ID]: 'library', [ARTIST_ID]: 'artist', [ALBUM_ID]: 'album' }[parent];
  if (at === undefined) return new Response('Error processing request.', { status: 400 });
  const page = jsonOf(recorded('jellyfin', `items-folder-${at}`)) as {
    Items: Record<string, unknown>[];
  };
  const [artist, album] = (path ?? '').slice(JELLYFIN_MUSIC.length + 1).split('/');
  const moved = {
    library: { Id: ARTIST_ID, Path: `${JELLYFIN_MUSIC}/${artist}` },
    artist: { Id: ALBUM_ID, Path: `${JELLYFIN_MUSIC}/${artist}/${album}` },
    album: { Id: TRACK_ID, AlbumId: ALBUM_ID, Path: path },
  }[at];
  const Items =
    path === null ? page.Items : page.Items.map((row, i) => (i === 0 ? { ...row, ...moved } : row));
  return Response.json({ ...page, Items });
}

/** Every upstream as recorded, each call and Jellyfin report kept; Jellyfin lists the file once `seen`. */
function upstreams(listed: () => string | null) {
  const replay = replayFetch(
    [
      ...[
        'release-search-mama-africa',
        'release-mama-africa',
        'recording-search-none',
        'release-search-staying-alive',
      ].map((call) => recorded('musicbrainz', call)),
      ...['front-307', 'front-302', 'front-200'].map((call) => recorded('coverart', call)),
      ...['virtual-folders', 'media-updated', 'index-album-lookup', 'index-album-tracks-1'].map(
        (call) => recorded('jellyfin', call),
      ),
    ],
    { readBytes: standInsBeside(adapters) },
  );
  const asked: string[] = [];
  const reports: unknown[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    asked.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    if (url.pathname === '/Library/Media/Updated') reports.push(JSON.parse(String(init?.body)));
    const parent = url.searchParams.get('ParentId');
    if (url.pathname === '/Items' && parent !== null && url.searchParams.get('Fields') === 'Path') {
      return folderAnswer(parent, listed());
    }
    return replay(input, init);
  };
  return { fetch, asked, reports };
}

/** The stream host as recorded, behind the real cache. */
function streamCache() {
  const host = replayFetch([recorded('googlevideo', 'range-chunk')], {
    readBytes: standInsBeside(adapters),
  });
  const info = (jsonOf(recorded('ytdlp', 'info-plain')) as { stdout: object }).stdout as {
    formats: Record<string, unknown>[];
  };
  const parsed = parseInfo({
    ...info,
    formats: info.formats.map((row) =>
      row.format_id === '251' ? { ...row, filesize: SIZE } : row,
    ),
  });
  const opus = pickFormat(parsed.formats)!;
  const source: StreamSource = {
    id: ID,
    url: opus.url,
    itag: opus.itag,
    mime: opus.mime,
    size: SIZE,
    duration: parsed.duration,
  };
  const cache = new StreamCache({
    dir: join(dir, 'cache'),
    db,
    capBytes: SIZE * 10,
    fetch: host,
    resolver: { resolve: () => Promise.resolve(source) },
    now: () => 1,
    chunkBytes: Math.ceil(SIZE / 4),
  });
  cache.prepare();
  return cache;
}

/** The song steps on these upstreams: the real search, download and import. */
function songSteps(
  fetch: FetchLike,
  options: { musicBrainz?: boolean; art?: Cover | null } = {},
): MediumSteps {
  const cache = streamCache();
  const musicBrainz =
    options.musicBrainz === false
      ? null
      : new MusicBrainzClient({
          baseUrl: 'http://upstream.invalid',
          fetch,
          userAgent: MUSICBRAINZ_USER_AGENT,
          clock: { now: () => 0, sleep: async () => {} },
        });
  const log = {
    error: (_details: Record<string, unknown>, message: string) => errors.push(message),
  };
  const download = songDownload({
    stream: { open: (id, range, signal) => cache.open(id, range, signal) },
    stagingDir,
    wake: () => undefined,
    log,
  });
  return {
    medium: 'song',
    prompt: true,
    search: songSearch({ db, musicBrainz, log }),
    download,
    import: songImport({
      db,
      musicDir: music,
      stagingDir,
      staging: download,
      jellyfin: new JellyfinClient({
        baseUrl: 'http://upstream.invalid',
        token: '<token>',
        fetch,
        serverKey: true,
      }),
      coverArt: new CoverArtClient({ baseUrl: 'http://upstream.invalid', fetch }),
      art: async () => options.art ?? null,
      now: () => clock,
      log,
    }),
  };
}

function job(steps: MediumSteps): RequestJobDeps {
  return {
    db,
    steps: stepsRegistry([steps]),
    log: { error: (_details, message) => errors.push(message) },
    now: () => clock,
    notIndexedAfterMs: 60 * 60_000,
    stepTimeoutMs: 10_000,
    stallAfterMs: 10 * 60_000,
    holdAfterMs: 60 * 60_000,
  };
}

const statusOf = (id: string) => getRequest(db, id)!.state.status;

/** Turns the job until the request is at `status`, the download's background read let through. */
async function walk(deps: RequestJobDeps, id: string, status: string) {
  await vi.waitFor(
    async () => {
      await advanceRequests(deps);
      clock += 1_000;
      expect(statusOf(id)).toBe(status);
    },
    { timeout: 4_000, interval: 5 },
  );
}

/** A request at `importing`, its stream staged by hand, matched as the search would. */
async function atImport(steps: MediumSteps, staged: Buffer = clip) {
  const { request } = createRequest(db, ana, REF, clock);
  const searched = await steps.search(request);
  if (searched.kind !== 'picked') throw new Error('no pick');
  writeFileSync(stagedPath(stagingDir, ID), staged);
  saveRequest(
    db,
    request.id,
    {
      state: { status: 'importing' },
      release: searched.release,
      handle: { id: ID, size: staged.byteLength },
    },
    clock,
  );
  return request.id;
}

const packets = async (path: string) => {
  const file = await open(path, 'r');
  try {
    const all: Buffer[] = [];
    for await (const packet of opusPackets(file)) all.push(packet);
    return all;
  } finally {
    await file.close();
  }
};

const oggOf = async (path: string) => {
  const file = await open(path, 'r');
  try {
    return await readOggOpus(file);
  } finally {
    await file.close();
  }
};

const comment = (comments: readonly { key: string; value: string }[], key: string) =>
  comments.filter((one) => one.key === key).map(({ value }) => value);

const mode = (path: string) => statSync(path).mode & 0o777;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFRESH = /\/Library\/Refresh|\/Items\/[^/]+\/Refresh/;

describe('[M3.keep/a] a kept song is saved as its own Opus stream, with MusicBrainz tags', () => {
  it('[M3.keep/a] a keep of Mama Africa’s song ends as track 3 in its album’s folder, the stream’s packets unchanged and tagged', async () => {
    let seen = false;
    const { fetch } = upstreams(() => (seen ? `${JELLYFIN_MUSIC}/${FILE}` : null));
    const { request } = createRequest(db, ana, REF, clock);
    const deps = job(songSteps(fetch));

    await walk(deps, request.id, 'importing');
    await advanceRequests(deps);
    const placed = join(music, FILE);
    expect(existsSync(placed)).toBe(true);

    expect(await packets(placed)).toEqual(await packets(stagedPath(stagingDir, ID)));
    const { tags } = await oggOf(placed);
    const { comments } = tags;
    expect(comment(comments, 'TITLE')).toEqual(['Not Gonna Give It Up']);
    expect(comment(comments, 'ARTIST')).toEqual(['Peter Tosh']);
    expect(comment(comments, 'ARTISTS')).toEqual(['Peter Tosh']);
    expect(comment(comments, 'ALBUM')).toEqual(['Mama Africa']);
    expect(comment(comments, 'ALBUMARTIST')).toEqual(['Peter Tosh']);
    expect(comment(comments, 'TRACKNUMBER')).toEqual(['3']);
    expect(comment(comments, 'TRACKTOTAL')).toEqual(['9']);
    expect(comment(comments, 'DATE')).toEqual(['1983']);
    expect(comment(comments, 'YOUTUBE_MUSIC_ID')).toEqual([ID]);
    for (const key of [
      'MUSICBRAINZ_TRACKID',
      'MUSICBRAINZ_RELEASETRACKID',
      'MUSICBRAINZ_ALBUMID',
      'MUSICBRAINZ_RELEASEGROUPID',
      'MUSICBRAINZ_ARTISTID',
      'MUSICBRAINZ_ALBUMARTISTID',
    ]) {
      expect(comment(comments, key)).toEqual([expect.stringMatching(UUID)]);
    }
    expect(comment(comments, 'MUSICBRAINZ_ALBUMID')).toEqual([
      'a8cf67cb-78ef-4768-b0b1-cd24cf61da85',
    ]);
    expect(tags.picture).toMatchObject({ mime: 'image/jpeg', data: front });

    expect(mode(join(music, 'Peter Tosh'))).toBe(0o775);
    expect(mode(join(music, ALBUM_FOLDER))).toBe(0o775);
    expect(mode(placed)).toBe(0o664);
    expect(readFileSync(join(music, ALBUM_FOLDER, 'cover.jpg'))).toEqual(front);
    expect(mode(join(music, ALBUM_FOLDER, 'cover.jpg'))).toBe(0o664);
    expect(readdirSync(stagingDir)).toEqual([`${ID}.webm`]);

    seen = true;
    await walk(deps, request.id, 'inLibrary');
    expect(readdirSync(stagingDir)).toEqual([]);
  });

  it('[M3.keep/a] the stream staged is the clip itself, byte for byte, read through the cache', async () => {
    const { fetch } = upstreams(() => null);
    const { request } = createRequest(db, ana, REF, clock);
    await walk(job(songSteps(fetch)), request.id, 'importing');
    expect(readFileSync(stagedPath(stagingDir, ID))).toEqual(clip);
  });

  it('[M3.keep/a] a cover.jpg already in the album’s folder stays as it was', async () => {
    mkdirSync(join(music, ALBUM_FOLDER), { recursive: true });
    writeFileSync(join(music, ALBUM_FOLDER, 'cover.jpg'), 'the household’s cover');
    const { fetch } = upstreams(() => null);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    await advanceRequests(job(steps));
    expect(existsSync(join(music, FILE))).toBe(true);
    expect(readFileSync(join(music, ALBUM_FOLDER, 'cover.jpg'), 'utf8')).toBe(
      'the household’s cover',
    );
    expect(statusOf(id)).toBe('importing');
  });

  it('[M3.keep/a] an album’s folder the household made, as `<album> (<year>)`, is filed into and given no cover.jpg', async () => {
    const theirs = 'Peter Tosh/Mama Africa (1983)';
    mkdirSync(join(music, theirs), { recursive: true });
    writeFileSync(join(music, theirs, '01 - Mama Africa.flac'), 'the household’s');
    const ours = `${theirs}/03 - Not Gonna Give It Up.opus`;
    const { fetch, reports } = upstreams(() => `${JELLYFIN_MUSIC}/${ours}`);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    await walk(job(steps), id, 'inLibrary');
    expect(readdirSync(join(music, 'Peter Tosh'))).toEqual(['Mama Africa (1983)']);
    expect(readdirSync(join(music, theirs)).sort()).toEqual([
      '01 - Mama Africa.flac',
      '03 - Not Gonna Give It Up.opus',
    ]);
    expect(reports).toEqual([
      { Updates: [{ Path: `${JELLYFIN_MUSIC}/${ours}`, UpdateType: 'Created' }] },
    ]);
  });

  it('[M3.keep/a] the household’s own file of the track, of any kind, answers the request, and nothing is added or reported', async () => {
    const theirs = `${ALBUM_FOLDER}/03 - Not Gonna Give It Up.flac`;
    mkdirSync(join(music, ALBUM_FOLDER), { recursive: true });
    writeFileSync(join(music, theirs), 'the household’s file');
    const { fetch, reports } = upstreams(() => `${JELLYFIN_MUSIC}/${theirs}`);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    await walk(job(steps), id, 'inLibrary');
    expect(readdirSync(join(music, ALBUM_FOLDER))).toEqual(['03 - Not Gonna Give It Up.flac']);
    expect(readFileSync(join(music, theirs), 'utf8')).toBe('the household’s file');
    expect(reports).toEqual([]);
    expect(getRequest(db, id)!.result).toEqual({ source: 'jellyfin', id: TRACK_ID });
  });

  it('[M3.keep/a] a folder made but whose mode was never set, by a try cut short, is finished by the next', async () => {
    const { fetch } = upstreams(() => null);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    mkdirSync(join(music, ALBUM_FOLDER), { recursive: true });
    chmodSync(join(music, 'Peter Tosh'), 0o755);
    chmodSync(join(music, ALBUM_FOLDER), 0o755);
    const handle = { id: ID, size: SIZE, made: ['Peter Tosh', ALBUM_FOLDER] };
    saveRequest(db, id, { state: { status: 'importing' }, handle }, clock);
    await advanceRequests(job(steps));
    expect(existsSync(join(music, FILE))).toBe(true);
    expect(mode(join(music, 'Peter Tosh'))).toBe(0o775);
    expect(mode(join(music, ALBUM_FOLDER))).toBe(0o775);
    expect(existsSync(join(music, ALBUM_FOLDER, 'cover.jpg'))).toBe(true);
    expect(getRequest(db, id)!.handle).toEqual(handle);
  });

  it('[M3.keep/a] the folders an import makes are noted on the request as it makes them', async () => {
    const { fetch } = upstreams(() => null);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    await advanceRequests(job(steps));
    expect(getRequest(db, id)!.handle).toEqual({
      id: ID,
      size: SIZE,
      made: ['Peter Tosh', ALBUM_FOLDER],
    });
  });

  it('[M3.keep/a] a repeat of the key builds and places nothing twice, and finds its own file', async () => {
    const { fetch, reports } = upstreams(() => `${JELLYFIN_MUSIC}/${FILE}`);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    const request = getRequest(db, id)!;
    const first = await steps.import(request, 'one-key');
    writeFileSync(stagedPath(stagingDir, ID), clip);
    const again = await steps.import(request, 'one-key');
    expect(again).toEqual(first);
    expect(readdirSync(join(music, ALBUM_FOLDER)).sort()).toEqual([
      '03 - Not Gonna Give It Up.opus',
      'cover.jpg',
    ]);
    expect(reports).toHaveLength(1);
  });

  it('[M3.keep/a] a song MusicBrainz does not know is kept on YouTube Music’s names and art, with no ids', async () => {
    const { fetch } = upstreams(() => null);
    const steps = songSteps(fetch, { musicBrainz: false, art: YOUTUBE_ART });
    await atImport(steps);
    await advanceRequests(job(steps));
    const placed = join(music, 'Peter Tosh/Mama Africa/Not Gonna Give It Up (2002 Remaster).opus');
    const { tags } = await oggOf(placed);
    expect(tags.comments).toEqual([
      { key: 'TITLE', value: 'Not Gonna Give It Up (2002 Remaster)' },
      { key: 'ARTIST', value: 'Peter Tosh' },
      { key: 'ARTISTS', value: 'Peter Tosh' },
      { key: 'ALBUM', value: 'Mama Africa' },
      { key: 'ALBUMARTIST', value: 'Peter Tosh' },
      { key: 'YOUTUBE_MUSIC_ID', value: ID },
    ]);
    expect(tags.picture).toMatchObject({ mime: 'image/jpeg', data: YOUTUBE_ART.bytes });
    expect(await packets(placed)).toEqual(await packets(clipPath()));
  });

  it('[M3.keep/a] a staged stream that is not Opus fails the import and is deleted, leaving nothing in Music; the retry stages it afresh', async () => {
    const at = clip.indexOf('A_OPUS');
    expect(at).toBeGreaterThan(0);
    const vorbis = Buffer.from(clip);
    vorbis.write('A_VORB', at, 'latin1');
    const { fetch, asked } = upstreams(() => `${JELLYFIN_MUSIC}/${FILE}`);
    const steps = songSteps(fetch);
    const id = await atImport(steps, vorbis);
    const deps = job(steps);
    await advanceRequests(deps);
    expect(getRequest(db, id)!.state).toMatchObject({ status: 'failed', reason: 'importFailed' });
    expect(readdirSync(music)).toEqual([]);
    expect(readdirSync(stagingDir)).toEqual([]);
    expect(asked.filter((call) => call.startsWith('POST'))).toEqual([]);

    await retryRequest(deps, id);
    await walk(deps, id, 'inLibrary');
    expect(await packets(join(music, FILE))).toEqual(await packets(clipPath()));
  });

  it('[M3.keep/a] a staged stream past its size fails the import and is deleted; the retry stages it afresh', async () => {
    const { fetch } = upstreams(() => `${JELLYFIN_MUSIC}/${FILE}`);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    writeFileSync(stagedPath(stagingDir, ID), Buffer.concat([clip, clip.subarray(0, 10)]));
    const deps = job(steps);
    await advanceRequests(deps);
    expect(getRequest(db, id)!.state).toMatchObject({ status: 'failed', reason: 'importFailed' });
    expect(readdirSync(music)).toEqual([]);
    expect(readdirSync(stagingDir)).toEqual([]);

    await retryRequest(deps, id);
    await walk(deps, id, 'inLibrary');
    expect(await packets(join(music, FILE))).toEqual(await packets(clipPath()));
  });

  it('[M3.keep/a] a stream staged short is staged on, the import waiting meanwhile, then placed', async () => {
    const { fetch } = upstreams(() => `${JELLYFIN_MUSIC}/${FILE}`);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    writeFileSync(stagedPath(stagingDir, ID), clip.subarray(0, SIZE - 10));
    const deps = job(steps);
    await advanceRequests(deps);
    expect(statusOf(id)).toBe('importing');
    expect(readdirSync(music)).toEqual([]);
    await walk(deps, id, 'inLibrary');
    expect(await packets(join(music, FILE))).toEqual(await packets(clipPath()));
  });
});

describe('[M3.keep/c] Jellyfin is told of each saved file, and the song arrives', () => {
  it('[M3.keep/c] after the file is placed, one report names its Jellyfin path as Created, and nothing asks for a refresh', async () => {
    let seen = false;
    const { fetch, asked, reports } = upstreams(() => (seen ? `${JELLYFIN_MUSIC}/${FILE}` : null));
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    const deps = job(steps);

    for (let turn = 0; turn < 3; turn += 1) await advanceRequests(deps);
    expect(statusOf(id)).toBe('importing');
    expect(reports).toEqual([
      { Updates: [{ Path: `${JELLYFIN_MUSIC}/${FILE}`, UpdateType: 'Created' }] },
    ]);

    seen = true;
    await walk(deps, id, 'inLibrary');
    expect(reports).toHaveLength(1);
    expect(asked.filter((call) => REFRESH.test(call))).toEqual([]);
    expect(asked.filter((call) => call.startsWith('POST'))).toEqual([
      'POST /Library/Media/Updated',
    ]);
  });

  it('[M3.keep/c] the file is found by walking Jellyfin’s folders down to it, however many other tracks arrived', async () => {
    const { fetch, asked } = upstreams(() => `${JELLYFIN_MUSIC}/${FILE}`);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    await walk(job(steps), id, 'inLibrary');
    const parents = asked
      .filter((call) => call.startsWith('GET /Items?'))
      .map((call) => new URLSearchParams(call.split('?')[1]).get('ParentId'));
    expect(parents.slice(0, 3)).toEqual([LIBRARY_ID, ARTIST_ID, ALBUM_ID]);
    expect(
      asked.some((call) => /SortBy=DateCreated|Recursive=true&IncludeItemTypes=Audio/.test(call)),
    ).toBe(false);
  });

  it('[M3.keep/c] once Jellyfin lists the file, its album is indexed and the request names the track, claiming the album', async () => {
    const { fetch } = upstreams(() => `${JELLYFIN_MUSIC}/${FILE}`);
    const steps = songSteps(fetch);
    const id = await atImport(steps);
    await walk(job(steps), id, 'inLibrary');
    expect(getRequest(db, id)!.result).toEqual({ source: 'jellyfin', id: TRACK_ID });
    expect(indexedRow(db, 'jellyfin', TRACK_ID)?.parentId).toBe(ALBUM_ID);
    expect(indexedRow(db, 'jellyfin', ALBUM_ID)).toBeDefined();
    expect(claimsOf(db, ana)).toEqual([
      { ref: { source: 'jellyfin', id: ALBUM_ID }, reason: 'added' },
    ]);
  });
});

function clipPath(): string {
  return join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm');
}
