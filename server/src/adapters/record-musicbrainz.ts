/**
 * Record mode's `musicbrainz`, `coverart` and `keep` parts, for M3.keep, and its
 * `albums-musicbrainz` part, for M3.albums (`recordAlbumGroups`).
 *
 * `musicbrainz` (no key, from this machine): MusicBrainz's answers for the songs the matcher is
 * tested on, through the client's own queue, 1.1 s apart. `coverart` (no key): the cover's calls.
 *
 * - The release path: `release-search-mama-africa` and the earliest release it lists,
 *   `release-mama-africa`; `release-search-dame-tu-cosita` (several artists, a single) and
 *   `release-dame-tu-cosita`.
 * - The recording path: `release-search-staying-alive` finds nothing, as the soundtrack's artist is
 *   Various Artists; `recording-search-stallone` finds the song by title, artist and length, and
 *   `release-staying-alive` is the earliest "Staying Alive" release it is on.
 * - `recording-search-none`: a title nothing has.
 * - `search-503`: the Mama Africa release search answered 503, its status and headers only. It is
 *   asked a few more times at the client's own pace, never in a burst: MusicBrainz is a free
 *   service. A run that meets no 503 keeps the committed file and says so.
 * - The Cover Art Archive's front cover of the Mama Africa release: `front-307` to archive.org,
 *   `front-302` to one of its nodes, and `front-200`, whose body is a stand-in. A node's name
 *   varies, so each recording names one recorded node instead.
 *
 * `keep` (the Jellyfin API key): `virtual-folders`, cut to the music library; one folder walk, a
 * folder at a time with each item's path: `items-folder-library` (the library's artists' folders),
 * `items-folder-artist` (the first artist's albums) and `items-folder-album` (the first album's
 * tracks); and `media-updated`, a report of a file made at a path that
 * cannot be indexed: a dot folder under the music library, which Jellyfin ignores and which does not
 * exist. That report is the one write, made once.
 *
 * Each answer is scanned before it is written, and checked to be what it was asked for.
 */
import { join } from 'node:path';
import { isCoverHost } from './coverart/client.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { RECORDED_ARCHIVE_NODE, type RawExchange } from './http/scrub.js';
import { JellyfinClient, type MusicLibrary } from './jellyfin/client.js';
import type { FolderItem } from './jellyfin/schemas.js';
import {
  type Clock,
  MusicBrainzClient,
  MUSICBRAINZ_GAP_MS,
  MUSICBRAINZ_SEARCH_LIMIT,
  MUSICBRAINZ_USER_AGENT,
  type RecordingQuery,
  releaseQuery,
  type ReleaseQuery,
} from './musicbrainz/client.js';

/** MusicBrainz's web service version, as its documentation names it. */
export const MUSICBRAINZ_VERSION = 'MusicBrainz web service 2';
export const COVERART_VERSION = 'Cover Art Archive API, unversioned';

/** The searches and lookups recorded, as the matcher is meant to ask them. */
export const MUSICBRAINZ_SONGS = {
  mamaAfrica: {
    release: { release: 'Mama Africa', artist: 'Peter Tosh' },
    /** The earliest official release of that name in the search (1983). */
    lookup: 'a8cf67cb-78ef-4768-b0b1-cd24cf61da85',
    track: 'Not Gonna Give It Up',
  },
  dameTuCosita: {
    release: { release: 'Dame Tu Cosita', artist: 'El Chombo' },
    /** The earliest of the three, the single with Cutty Ranks (2018). */
    lookup: 'a0a19da2-a9b5-4776-8bb9-438addf49126',
    track: 'Dame tu cosita',
  },
  stayingAlive: {
    release: { release: 'Staying Alive', artist: 'Frank Stallone' },
    /** YouTube Music's 3:31, within 4 s either way. */
    recording: {
      title: "I'm Never Gonna Give You Up",
      artist: 'Frank Stallone',
      fromMs: 207_000,
      toMs: 215_000,
    },
    /** The earliest official "Staying Alive" the recording search lists (1983). */
    lookup: 'ccff5ec4-efff-4aa7-a288-67a4bcfd1621',
    track: "I'm Never Gonna Give You Up",
  },
  none: {
    recording: {
      title: 'Zqxv Plorb Wendigast',
      artist: 'Nobody Atall',
      fromMs: 176_000,
      toMs: 184_000,
    },
  },
} as const satisfies Record<
  string,
  { release?: ReleaseQuery; recording?: RecordingQuery; lookup?: string; track?: string }
>;

/** The cover recorded: Mama Africa's 1983 release, which has a front (checked live). */
export const COVER_RELEASE = MUSICBRAINZ_SONGS.mamaAfrica.lookup;

/** The front cover's body is the archive's art; a flat square stands in for it. */
export const COVER_STAND_IN = {
  bytes: 'front.jpg',
  synthesized:
    "A 64 x 64 px mid grey baseline JPEG, made by scripts/fixtures/still.sh (Jellyfin's primary.jpg). " +
    'Status and headers are the real answer; the body is not.',
} as const;

/** How many times the busy answer is asked for, each 1.1 s after the call before. */
export const BUSY_TRIES = 3;
/** How many times a call answered busy is captured, and the wait before each try again. */
export const RECORD_TRIES = 6;
export const BUSY_WAIT_MS = 10_000;

/** Where the `media-updated` report points, under the music library: ignored and absent. */
export const UNINDEXED_PROBE = '.auralis-probe/recording-probe.opus';

function scanned(recording: Recording) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${recording.call}: ${found}; not written`);
  }
}

const ARCHIVE_NODE = /\b[a-z0-9-]+\.[a-z]{2}\.archive\.org\b/gi;

/** The cover recorder's hook: each Internet Archive node named becomes the one recorded node. */
export function oneArchiveNode(raw: RawExchange): RawExchange {
  const json = JSON.stringify(raw).replace(ARCHIVE_NODE, RECORDED_ARCHIVE_NODE);
  return JSON.parse(json) as RawExchange;
}

/** The `search-503` hook: the busy answer's status and headers; its text names other hosts. */
export function statusAndHeaders(raw: RawExchange): RawExchange {
  return { ...raw, response: { ...raw.response, body: null } };
}

function check(ok: boolean, what: string) {
  if (!ok) throw new Error(what);
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type Recorder = ReturnType<typeof createRecorder>;

/**
 * Captures one call at a time. A busy answer the client asks again makes two requests in one
 * capture, which writes nothing: the call is captured again after a wait, so only a call answered
 * at once is recorded. Each file written is added to `written`.
 */
function politely(
  rec: Recorder,
  dir: string,
  clock: Clock,
  out: (line: string) => void,
  written: string[],
) {
  return async <T>(call: string, ask: () => Promise<T>, expect: (found: T) => void) => {
    for (let tries = 1; ; tries += 1) {
      try {
        const found = await rec.capture(call, ask, {
          verify: (answer, recording) => {
            expect(answer);
            scanned(recording);
          },
        });
        written.push(join(dir, `${call}.json`));
        return found;
      } catch (error) {
        const twice = error instanceof Error && /exactly one request/.test(error.message);
        if (!twice || tries >= RECORD_TRIES) throw error;
        out(`${call}: MusicBrainz was busy; asking again in ${BUSY_WAIT_MS / 1000} s`);
        await clock.sleep(BUSY_WAIT_MS);
      }
    }
  };
}

export interface MusicBrainzRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  musicBrainzUrl: string;
  clock?: Clock;
}

export async function recordMusicBrainz(
  input: MusicBrainzRecordInput,
): Promise<{ written: string[] }> {
  const { out } = input;
  const clock = input.clock ?? realClock;
  const written: string[] = [];
  const dir = join(input.root, 'musicbrainz', 'recordings');
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'musicbrainz',
    upstreamVersion: MUSICBRAINZ_VERSION,
    secrets: [],
    baseUrl: input.musicBrainzUrl,
  });
  const mb = new MusicBrainzClient({
    baseUrl: input.musicBrainzUrl,
    fetch: rec.fetch,
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock,
  });
  const record = politely(rec, dir, clock, out, written);

  const { mamaAfrica, dameTuCosita, stayingAlive, none } = MUSICBRAINZ_SONGS;
  for (const [name, song] of [
    ['mama-africa', mamaAfrica],
    ['dame-tu-cosita', dameTuCosita],
  ] as const) {
    const search = await record(
      `release-search-${name}`,
      () => mb.searchReleases(song.release),
      (found) =>
        check(
          found.releases.some((r) => r.id === song.lookup),
          `${name}: not listed`,
        ),
    );
    out(`release-search-${name}: ${search.count} releases`);
    await record(
      `release-${name}`,
      () => mb.release(song.lookup),
      (found) =>
        check(
          found?.media.some((m) => m.tracks.some((t) => t.title === song.track)) === true,
          `${name}: the release has no ${song.track}`,
        ),
    );
  }

  await record(
    'release-search-staying-alive',
    () => mb.searchReleases(stayingAlive.release),
    (found) => check(found.count === 0, 'staying-alive: the release search found something'),
  );
  await record(
    'recording-search-stallone',
    () => mb.searchRecordings(stayingAlive.recording),
    (found) =>
      check(
        found.recordings.some((r) => r.releases.some((x) => x.id === stayingAlive.lookup)),
        'stallone: the recording search does not list the release',
      ),
  );
  await record(
    'release-staying-alive',
    () => mb.release(stayingAlive.lookup),
    (found) =>
      check(
        found?.media.some((m) => m.tracks.some((t) => t.title === stayingAlive.track)) === true,
        'staying-alive: the release has no such track',
      ),
  );
  await record(
    'recording-search-none',
    () => mb.searchRecordings(none.recording),
    (found) => check(found.count === 0, 'none: the nonsense title was found'),
  );

  // The busy answer: the same release search, asked again at the client's pace until one is busy.
  const url = new URL('ws/2/release', `${input.musicBrainzUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('query', releaseQuery(mamaAfrica.release));
  url.searchParams.set('limit', String(MUSICBRAINZ_SEARCH_LIMIT));
  url.searchParams.set('fmt', 'json');
  const init = { headers: { accept: 'application/json', 'user-agent': MUSICBRAINZ_USER_AGENT } };
  const busyRec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'musicbrainz',
    upstreamVersion: MUSICBRAINZ_VERSION,
    secrets: [],
    baseUrl: input.musicBrainzUrl,
    prepare: statusAndHeaders,
  });
  for (let tries = 1; tries <= BUSY_TRIES; tries += 1) {
    await clock.sleep(MUSICBRAINZ_GAP_MS);
    try {
      await busyRec.capture(
        'search-503',
        async () => {
          const answer = await busyRec.fetch(url.toString(), init);
          await answer.body?.cancel();
          return answer.status;
        },
        {
          verify: (status, recording) => {
            check(status === 503, `answered ${status}`);
            scanned(recording);
          },
        },
      );
      written.push(join(dir, 'search-503.json'));
      return { written };
    } catch (error) {
      out(`search-503: try ${tries}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  out(`search-503: MusicBrainz was never busy in ${BUSY_TRIES} tries; the committed file is kept`);
  return { written };
}

/**
 * The release groups M3.albums is tested on: freely licensed albums only, as the repo is public
 * (Nine Inch Nails' The Slip and Ghosts I–IV, CC BY-NC-SA; Jonathan Coulton's Artificial Heart,
 * CC BY-NC), and the releases an import tags from.
 */
export const ALBUM_GROUPS = {
  slip: {
    group: '5990b23f-6412-3eaf-989c-a4831f4f95f7',
    title: 'The Slip',
    /** The US CD (2008-07-22), whose DVD holds the videos. */
    cd: '6842b8f3-b108-3c13-8998-6886e3b84300',
  },
  ghosts: {
    group: '550bf4b9-92ca-30ba-9ea2-8b45f9d081f1',
    title: 'Ghosts I–IV',
    /** The digital release of all 36 tracks on one medium (2008-03-02). */
    digital: '3af7ec8c-3bf4-4e6d-9bb3-1885d22b2b6a',
  },
  artificialHeart: {
    group: 'c99bcaea-d214-4cb9-b15d-3f1558b1c1b3',
    title: 'Artificial Heart',
  },
  /** An id MusicBrainz has never given out. */
  gone: { group: '00000000-0000-4000-8000-000000000000' },
} as const;

/** The release-group searches recorded, as a person might type them into Search. */
export const ALBUM_GROUP_SEARCHES = [
  ['rg-search-slip', 'nine inch nails the slip'],
  ['rg-search-nin', 'nine inch nails'],
] as const;

/** What a release-group search row keeps: the fields the schema reads. Tags name sites. */
const GROUP_ROW_FIELDS = [
  'id',
  'score',
  'title',
  'primary-type',
  'secondary-types',
  'first-release-date',
  'artist-credit',
];

/** The `rg-search-*` hook: each row cut to `GROUP_ROW_FIELDS`; its tags name review sites. */
export function groupRowsCut(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body)) return raw;
  const answer = body.json as { 'release-groups'?: unknown[] } | null;
  if (answer === null || !Array.isArray(answer['release-groups'])) return raw;
  const rows = answer['release-groups'].map((row) =>
    Object.fromEntries(
      Object.entries(row as Record<string, unknown>).filter(([key]) =>
        GROUP_ROW_FIELDS.includes(key),
      ),
    ),
  );
  const json = { ...answer, 'release-groups': rows };
  return { ...raw, response: { ...raw.response, body: { json } } };
}

/** The pause before each call of the albums part, on top of the client's own 1.1 s. */
export const ALBUM_GROUP_GAP_MS = 3_000;

/**
 * Record mode's `albums-musicbrainz` part, for M3.albums (no key): each group's lookup
 * (`rg-slip`, `rg-ghosts`, `rg-artificial-heart`, `rg-gone`, which answers 404), its official
 * releases with their media and recordings (`releases-slip`, `releases-ghosts`,
 * `releases-artificial-heart`), the two releases an import tags from (`release-slip-cd`,
 * `release-ghosts-digital`) and two release-group searches. One call at a time through the
 * client's queue, with a further pause before each: MusicBrainz is a free service.
 */
export async function recordAlbumGroups(
  input: MusicBrainzRecordInput,
): Promise<{ written: string[] }> {
  const { out } = input;
  const clock = input.clock ?? realClock;
  const written: string[] = [];
  const dir = join(input.root, 'musicbrainz', 'recordings');
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'musicbrainz',
    upstreamVersion: MUSICBRAINZ_VERSION,
    secrets: [],
    baseUrl: input.musicBrainzUrl,
  });
  const mb = new MusicBrainzClient({
    baseUrl: input.musicBrainzUrl,
    fetch: rec.fetch,
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock,
  });
  const searches = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'musicbrainz',
    upstreamVersion: MUSICBRAINZ_VERSION,
    secrets: [],
    baseUrl: input.musicBrainzUrl,
    prepare: groupRowsCut,
  });
  const captured = politely(rec, dir, clock, out, written);
  const record: typeof captured = async (call, ask, expect) => {
    await clock.sleep(ALBUM_GROUP_GAP_MS);
    return captured(call, ask, expect);
  };

  const { slip, ghosts, artificialHeart, gone } = ALBUM_GROUPS;
  for (const [name, album] of [
    ['slip', slip],
    ['ghosts', ghosts],
    ['artificial-heart', artificialHeart],
  ] as const) {
    await record(
      `rg-${name}`,
      () => mb.releaseGroup(album.group),
      (found) => check(found?.title === album.title, `rg-${name}: not ${album.title}`),
    );
    const releases = await record(
      `releases-${name}`,
      () => mb.releasesOfGroup(album.group),
      (found) => check(found.length > 0, `releases-${name}: none`),
    );
    out(`releases-${name}: ${releases.length} official releases`);
  }
  await record(
    'rg-gone',
    () => mb.releaseGroup(gone.group),
    (found) => check(found === null, 'rg-gone: found'),
  );
  for (const [call, id] of [
    ['release-slip-cd', slip.cd],
    ['release-ghosts-digital', ghosts.digital],
  ] as const) {
    await record(
      call,
      () => mb.release(id),
      (found) => check(found?.id === id, `${call}: not the release`),
    );
  }
  const searchMb = new MusicBrainzClient({
    baseUrl: input.musicBrainzUrl,
    fetch: searches.fetch,
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock,
  });
  const searched = politely(searches, dir, clock, out, written);
  for (const [call, words] of ALBUM_GROUP_SEARCHES) {
    await clock.sleep(ALBUM_GROUP_GAP_MS);
    const found = await searched(
      call,
      () => searchMb.searchReleaseGroups(words),
      (answer) => check(answer.releaseGroups.length > 0, `${call}: nothing found`),
    );
    out(`${call}: ${found.count} groups`);
  }
  return { written };
}

export interface CoverArtRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  coverArtUrl: string;
}

export async function recordCoverArt(input: CoverArtRecordInput): Promise<{ written: string[] }> {
  const { out } = input;
  const written: string[] = [];
  const coverDir = join(input.root, 'coverart', 'recordings');
  const covers = createRecorder({
    fetch: input.fetch,
    dir: coverDir,
    upstream: 'coverart',
    upstreamVersion: COVERART_VERSION,
    secrets: [],
    baseUrl: input.coverArtUrl,
    prepare: oneArchiveNode,
  });
  let at = new URL(
    `release/${COVER_RELEASE}/front-500`,
    `${input.coverArtUrl.replace(/\/$/, '')}/`,
  );
  for (const [call, status] of [
    ['front-307', 307],
    ['front-302', 302],
  ] as const) {
    const location = await covers.capture(
      call,
      async () => {
        const answer = await covers.fetch(at.toString(), { redirect: 'manual' });
        await answer.body?.cancel();
        check(answer.status === status, `${call}: answered ${answer.status}`);
        return answer.headers.get('location');
      },
      {
        verify: (found, recording) => {
          check(
            found !== null && isCoverHost(new URL(found, at).hostname),
            `${call}: off the archive`,
          );
          scanned(recording);
        },
      },
    );
    written.push(join(coverDir, `${call}.json`));
    at = new URL(location!, at);
  }
  await covers.capture(
    'front-200',
    async () => {
      const answer = await covers.fetch(at.toString(), { redirect: 'manual' });
      await answer.body?.cancel();
      return answer;
    },
    {
      standIn: COVER_STAND_IN,
      verify: (answer, recording) => {
        check(answer.status === 200, `front-200: answered ${answer.status}`);
        check(answer.headers.get('content-type') === 'image/jpeg', 'front-200: not a JPEG');
        scanned(recording);
      },
    },
  );
  written.push(join(coverDir, 'front-200.json'));
  out('recorded the front cover: two redirects, then the image');
  return { written };
}

/** The `virtual-folders` hook: only the music libraries stay; the household's others go. */
export function onlyMusicLibraries(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body) || !Array.isArray(body.json)) return raw;
  const json = body.json.filter(
    (folder) =>
      folder !== null &&
      typeof folder === 'object' &&
      (folder as Record<string, unknown>).CollectionType === 'music',
  );
  return { ...raw, response: { ...raw.response, body: { json } } };
}

/** How many items each `items-folder-*` recording keeps: the household's names stay out. */
export const FOLDER_KEPT = 5;

export const FOLDER_TRIMMED =
  'Trimmed by the recorder: only the first five items are kept, as the rest hold household names.';

/** The `items-folder-*` hook: the first few items, saying so. */
export function firstItems(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body)) return raw;
  const answer = body.json as { Items?: unknown[] } | null;
  if (answer === null || !Array.isArray(answer.Items)) return raw;
  const json = { ...answer, Items: answer.Items.slice(0, FOLDER_KEPT), trimmed: FOLDER_TRIMMED };
  return { ...raw, response: { ...raw.response, body: { json } } };
}

export interface KeepRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  jellyfinUrl: string;
  jellyfinKey: string;
  /** False records the reads alone, for a run after the one report was made. */
  report?: boolean;
}

export async function recordKeep(input: KeepRecordInput): Promise<{ written: string[] }> {
  const { fetch, jellyfinUrl: baseUrl, jellyfinKey: token, out } = input;
  const dir = join(input.root, 'jellyfin', 'recordings');
  const version = await new JellyfinClient({ baseUrl, token, fetch }).getServerVersion();
  const recorder = (prepare?: (raw: RawExchange) => RawExchange) =>
    createRecorder({
      fetch,
      dir,
      upstream: 'jellyfin',
      upstreamVersion: version,
      secrets: [token],
      baseUrl,
      ...(prepare ? { prepare } : {}),
    });
  const scanOnly = { verify: (_: unknown, recording: Recording) => scanned(recording) };

  const folders = recorder(onlyMusicLibraries);
  const library: MusicLibrary | null = await folders.capture(
    'virtual-folders',
    () => new JellyfinClient({ baseUrl, token, fetch: folders.fetch }).musicLibrary(),
    {
      verify: (found, recording) => {
        check(found !== null && found.locations.length === 1, 'not one music library, one place');
        scanned(recording);
      },
    },
  );
  const reads = recorder(firstItems);
  const folder = (call: string, parentId: string, type: string) =>
    reads.capture(
      call,
      () => new JellyfinClient({ baseUrl, token, fetch: reads.fetch }).folderItems(parentId),
      {
        verify: (found, recording) => {
          const kept = found.slice(0, FOLDER_KEPT);
          check(
            kept.some((item) => item.Type === type && item.Path),
            `${call}: no ${type}`,
          );
          scanned(recording);
        },
      },
    );
  const pick = (items: FolderItem[], type: string) =>
    items.slice(0, FOLDER_KEPT).find((item) => item.Type === type && item.Path)!;
  const artists = await folder('items-folder-library', library!.id, 'MusicArtist');
  const albums = await folder('items-folder-artist', pick(artists, 'MusicArtist').Id, 'MusicAlbum');
  const tracks = await folder('items-folder-album', pick(albums, 'MusicAlbum').Id, 'Audio');
  out(`items-folder-*: ${artists.length}, ${albums.length} and ${tracks.length} items read`);
  const calls = [
    'virtual-folders',
    'items-folder-library',
    'items-folder-artist',
    'items-folder-album',
  ];
  if (input.report !== false) {
    const rec = recorder();
    const jf = new JellyfinClient({ baseUrl, token, fetch: rec.fetch });
    const probe = `${library!.locations[0]!.replace(/\/$/, '')}/${UNINDEXED_PROBE}`;
    await rec.capture('media-updated', () => jf.reportCreated([probe]), scanOnly);
    out('media-updated: reported a path Jellyfin ignores');
    calls.push('media-updated');
  }
  return { written: calls.map((c) => join(dir, `${c}.json`)) };
}
