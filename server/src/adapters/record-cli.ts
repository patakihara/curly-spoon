/**
 * Record mode's entry point. Runs on the laptop against mediaserver over Tailscale; the keys
 * come on stdin from mediaserver's key file, and the URLs are typed on the command line, so
 * neither is ever written here:
 *
 *   ssh mediaserver cat .config/auralis/upstream-keys.env \
 *     | pnpm --filter @auralis/server record -- --abs <url> --jellyfin <url> [--only abs|jellyfin]
 *
 * `--only oidc` records one real sign-in as the service identity, and the links made for it:
 *
 *   ssh mediaserver cat .config/auralis/upstream-keys.env .config/auralis/oidc.env \
 *     | pnpm --filter @auralis/server record -- --only oidc --oidc <issuer> --oidc-version <v> \
 *         --abs <url> --jellyfin <url>
 *
 * `--only play --play-item <id>` records M1.play's calls on one small multi-file book: it played
 * directly, each file's first two bytes, then the same book transcoded to HLS, its playlist and
 * first segment. The transcode is closed as soon as it is recorded.
 *
 * `--only episode --play-item <show> --episode <id>` records one podcast episode played through its
 * show and its file's first two bytes, then closes that session at once.
 *
 * `--only jfplay --jellyfin-item <album id>` records M1.music's calls as the service identity
 * `auralis`, through a Jellyfin token minted for it by Quick Connect and logged out at the end:
 * the album and its tracks, its first track, and that track's first two bytes.
 *
 * `--only progress --play-item <book> --jellyfin-item <track>` records M1.progress's writes as the
 * service identity `auralis`: a play's sync and close and a bookmark on the book, and a track's
 * start, progress and stop, each after real listening time. It reads the test user's state
 * first, undoes the run whatever fails, and fails unless a read-back matches (record-progress.ts).
 *
 * `--only sessions --books <a,b> --shows <a,b> --jellyfin-item <track>` records M1.sessions' reads
 * as the service identity `auralis`: two books of one series, the two shows' public feeds trimmed,
 * a finished episode on the first show read back through `GET /api/me` and undone, and Jellyfin's
 * Instant Mix for the track (record-sessions.ts).
 *
 * `--only shell --play-item <book> --jellyfin-item <album>` records M1.shell's reads: the books page
 * holding the book and its books, its cover, each music library's albums page, and as `auralis`
 * the views and the album's primary image, each image as stored and at the art route's medium
 * width (record-shell.ts).
 *
 * `--only lyrics --lrclib <url> --albums <a,b,c> --jellyfin-synced <track> --jellyfin-plain <track>
 * --lrclib-synced <track> --lrclib-missing <track> --lrclib-instrumental <track>` records M2.lrclib's
 * reads: the albums holding the three LRCLIB tracks and their tracks, Jellyfin's synced, plain and
 * missing lyrics as `auralis`, and LRCLIB's synced, missing and instrumental answers, ten seconds
 * apart, every lyrics answer trimmed to four lines (record-lyrics.ts). It needs only
 * JELLYFIN_API_KEY.
 *
 * `--only lists --play-item <show> --episodes <a,b,..>` records M2.lists' played mark as the service
 * identity `auralis`: each episode marked finished (`episode-mark-finished`, then `-2`, `-3`, ..),
 * then the mark undone and read back; the run fails unless each read-back matches (record-lists.ts). It reads the show by id only and needs
 * only ABS_API_KEY.
 *
 * `--dry-run` makes the same calls but writes into a fresh temporary folder instead of the
 * committed recordings, and says where.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AbsClient, contentUrlParts, hlsSessionOf } from './audiobookshelf/client.js';
import { AdapterError, type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { recordingSchema } from './http/recording.js';
import { localNames } from './http/localNames.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange } from './http/scrub.js';
import { buildAuthorizationHeader } from './jellyfin/auth.js';
import { JellyfinClient } from './jellyfin/client.js';
import { JellyfinProvisioner, personDevice } from './jellyfin/quickConnect.js';
import { RECORD_USER_ID, recordOidc, TEST_IDENTITY } from './record-oidc.js';
import { UNDO_UNCONFIRMED } from './record-finished.js';
import { recordLists } from './record-lists.js';
import { recordLyrics } from './record-lyrics.js';
import { recordProgress } from './record-progress.js';
import { recordSessions } from './record-sessions.js';
import { recordShell } from './record-shell.js';

/**
 * The index calls record one page of two items from each library. The fifth page holds the
 * Podcasts library's two smallest shows (4 and 15 episodes); its first holds shows of 98 and 400.
 */
export const INDEX_PAGE = 4;
export const INDEX_PAGE_SIZE = 2;
/** Ids no upstream holds, for the lookups that confirm an item is gone. */
export const MISSING_ABS_ID = '00000000-0000-4000-8000-000000000000';
export const MISSING_JELLYFIN_ID = '00000000000000000000000000000000';

const USAGE = `Usage: <keys on stdin> | pnpm --filter @auralis/server record -- [options]

Records Audiobookshelf's and Jellyfin's calls into server/src/adapters/*/recordings/.

  --abs <url>        Audiobookshelf base URL
  --jellyfin <url>   Jellyfin base URL
  --jellyfin-item <id> the Jellyfin item to record, instead of the first album; for --only
                     jfplay and shell, the album; for --only progress, the track; for
                     --only sessions, the track Instant Mix is asked for
  --only <name>      record only abs, jellyfin, index, play, episode, jfplay, progress,
                     sessions, shell, lyrics or lists; or
                     oidc, a sign-in and its links
  --lrclib <url>     LRCLIB's base URL, for --only lyrics
  --albums <a,b,..>  for --only lyrics, the albums holding the three LRCLIB tracks
  --jellyfin-synced <id>, --jellyfin-plain <id>
                     for --only lyrics, a track with a synced and one with a plain lyrics file
  --lrclib-synced <id>, --lrclib-missing <id>, --lrclib-instrumental <id>
                     for --only lyrics, a track with no Jellyfin lyrics that LRCLIB has synced,
                     one LRCLIB cannot find, and one it knows as instrumental
  --books <a,b>      for --only sessions, two books of one series, in series order
  --shows <a,b>      for --only sessions, two shows, the first serial
  --play-item <id>   the multi-file book --only play, progress and shell record; for
                     --only episode and lists, the show
  --episode <id>     for --only episode, the episode played
  --episodes <a,b,..> for --only lists, the episodes of the show marked finished and put back
  --index-page <n>   the page of two the index calls record, from 0 (default ${INDEX_PAGE})
  --oidc <url>       the sign-on's issuer, for --only oidc
  --oidc-version <v> the sign-on's version, for --only oidc
  --dry-run          write into a temporary folder, not the committed recordings
  --help             show this

stdin carries ABS_API_KEY=... and JELLYFIN_API_KEY=... lines (jfplay and lyrics need only the latter,
lists only the former; progress, sessions and shell need both); for --only oidc,
OIDC_CLIENT_SECRET, OIDC_TEST_PASSWORD, ABS_PROVISION_KEY and JELLYFIN_API_KEY.
`;

const CLIENT_VERSION = '0.0.0';

/** The multi-file book's file calls' stand-in: its files are MP3. */
export const MULTI_FILE_STAND_IN = {
  bytes: 'multi-file.mp3',
  synthesized:
    'A 5 s 330 Hz sine tone, MP3 mono 44.1 kHz, made by scripts/fixtures/tone.sh. ' +
    'Status and headers are the real answer to Range: bytes=0-1; the body is not.',
} as const;

/** The transcode's segment's stand-in: ABS copies an MP3 book's audio into MPEG-TS segments. */
export const HLS_SEGMENT_STAND_IN = {
  bytes: 'hls-segment.mp2t',
  synthesized:
    'A 6 s 550 Hz sine tone, MP3 mono 44.1 kHz in MPEG-TS, made by scripts/fixtures/tone.sh. ' +
    'Status and headers are the real answer; the body is not.',
} as const;

/**
 * The file call's body is never kept: it is a household audio file. Its recording names a
 * committed tone in the same codec and container instead, made by `scripts/fixtures/tone.sh`.
 */
export const ITEM_FILE_STAND_IN = {
  bytes: 'item-file.m4a',
  synthesized:
    'A 20 s 440 Hz sine tone, AAC mono 22.05 kHz in MP4, made by scripts/fixtures/tone.sh. ' +
    'Status and headers are the real answer to Range: bytes=0-1; the body is not.',
} as const;
/** Jellyfin's static stream of a FLAC track: its body is a household music file. */
export const JELLYFIN_STREAM_STAND_IN = {
  bytes: 'jf-stream.flac',
  synthesized:
    'A 5 s 220 Hz sine tone, FLAC mono 44.1 kHz, made by scripts/fixtures/tone.sh. ' +
    'Status and headers are the real answer to Range: bytes=0-1; the body is not.',
} as const;
const here = fileURLToPath(new URL('.', import.meta.url));

export interface RecordIo {
  argv: string[];
  stdin: string;
  fetch: FetchLike;
  out: (line: string) => void;
  err: (line: string) => void;
  /** For --only oidc: the state, nonce and verifier's bytes, and the time. */
  random?: (bytes: number) => Buffer;
  now?: () => number;
  /** For --only play: waits between polls for the first segment. */
  sleep?: (ms: number) => Promise<void>;
  /** People's names from the local, uncommitted names file: the scan fails on any of them. */
  names?: readonly string[];
}

/** The `id` of a play answer, from its raw text, whether or not the rest of it parses. */
export function rawSessionId(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === 'object' && 'id' in value) {
      const { id } = value;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  } catch {
    // Not JSON: there is no id to close.
  }
  return undefined;
}

/** Reads `KEY=value` lines; anything else is ignored. */
export function parseKeys(text: string): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2]) keys[m[1]] = m[2];
  }
  return keys;
}

async function recordAbs(
  io: RecordIo,
  baseUrl: string,
  token: string,
  dir: string,
  secrets: string[],
) {
  const upstreamVersion = await new AbsClient({
    baseUrl,
    token,
    fetch: io.fetch,
  }).getServerVersion();
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion,
    secrets,
    baseUrl,
  });
  // The play answer's session id is read from the raw JSON, before zod parses it, so a session
  // is closed even when the answer fails its schema.
  let sessionId: string | undefined;
  const peekSession: FetchLike = async (url, init) => {
    const response = await rec.fetch(url, init);
    if (init?.method === 'POST' && new URL(url).pathname.endsWith('/play')) {
      sessionId = rawSessionId(await response.clone().text()) ?? sessionId;
    }
    return response;
  };
  const abs = new AbsClient({ baseUrl, token, fetch: peekSession });

  const libraries = await rec.capture('library-list', () => abs.getLibraries());
  // Never the Podcasts library: opening a podcast stub hydrates it.
  const books = libraries.find((l) => l.mediaType === 'book');
  if (!books) throw new Error('Audiobookshelf has no book library');
  const [first] = (await abs.getLibraryItems(books.id, { limit: 1, page: 0 })).results;
  if (!first) throw new Error('the book library is empty');

  await rec.capture('item-detail', () => abs.getItem(first.id));
  let closed = false;
  try {
    const session = await rec.capture('item-play', () =>
      abs.play(first.id, { deviceId: 'auralis-recorder', clientVersion: CLIENT_VERSION }),
    );
    // Two bytes of the first track's file: its real status and headers, and a stand-in body.
    const [track] = session.audioTracks;
    const file = track && contentUrlParts(track.contentUrl);
    if (!file) throw new Error('the play answer has no direct-play track to record');
    const opened = await rec.capture('item-file', () => abs.openFile(file, 'bytes=0-1'), {
      standIn: ITEM_FILE_STAND_IN,
    });
    await opened.body.cancel();
    await rec.capture('session-close', () => abs.closeSession(session.id));
    closed = true;
  } finally {
    // Never leave a playback session open on the server, whatever failed.
    if (sessionId !== undefined && !closed) {
      await abs.closeSession(sessionId).catch(() => undefined);
    }
  }
  return ['library-list', 'item-detail', 'item-play', 'item-file', 'session-close'].map((c) =>
    join(dir, `${c}.json`),
  );
}

async function recordJellyfin(
  io: RecordIo,
  baseUrl: string,
  token: string,
  dir: string,
  secrets: string[],
  itemId: string | undefined,
) {
  const upstreamVersion = await new JellyfinClient({
    baseUrl,
    token,
    fetch: io.fetch,
  }).getServerVersion();
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'jellyfin',
    upstreamVersion,
    secrets,
    baseUrl,
  });
  const jf = new JellyfinClient({ baseUrl, token, fetch: rec.fetch });

  await rec.capture('library-list', () => jf.getLibraries());
  // The API key has no user of its own, so the item is asked for as an administrator.
  const userId = await jf.findAdministratorId();
  if (!userId) throw new Error('Jellyfin has no administrator');
  const albumId = itemId ?? (await jf.getAlbums({ limit: 1, startIndex: 0 })).Items[0]?.Id;
  if (!albumId) throw new Error('Jellyfin has no music album');
  await rec.capture('item-detail', () => jf.getItem(albumId, userId));
  return ['library-list', 'item-detail'].map((c) => join(dir, `${c}.json`));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls, unrecorded, until the transcode's first segment is cut: at most 30 tries a second apart. */
async function waitForSegment(
  abs: AbsClient,
  session: string,
  wait: (ms: number) => Promise<void>,
) {
  for (let tries = 0; tries < 30; tries += 1) {
    await wait(1000);
    const ready = await abs.openHlsSegment(session, 'output-0.ts').catch(() => null);
    if (ready !== null) {
      await ready.body.cancel();
      return;
    }
  }
  throw new Error('the first segment was not cut within 30 s');
}

/**
 * M1.play's calls on one multi-file book: direct play and each file's first two bytes, then a
 * forced transcode, its playlist and first segment. Every session opened is closed, the
 * transcode's as soon as it is recorded, whatever fails. Reads one item; lists no library.
 */
async function recordPlay(
  io: RecordIo,
  baseUrl: string,
  token: string,
  dir: string,
  secrets: string[],
  itemId: string,
) {
  const upstreamVersion = await new AbsClient({
    baseUrl,
    token,
    fetch: io.fetch,
  }).getServerVersion();
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion,
    secrets,
    baseUrl,
  });
  const open = new Set<string>();
  const peekSession: FetchLike = async (url, init) => {
    const response = await rec.fetch(url, init);
    if (init?.method === 'POST' && new URL(url).pathname.endsWith('/play')) {
      const id = rawSessionId(await response.clone().text());
      if (id !== undefined) open.add(id);
    }
    return response;
  };
  const abs = new AbsClient({ baseUrl, token, fetch: peekSession });
  const device = { deviceId: 'auralis-recorder', clientVersion: CLIENT_VERSION };
  const calls: string[] = [];
  const close = async (call: string, sessionId: string) => {
    await rec.capture(call, () => abs.closeSession(sessionId));
    open.delete(sessionId);
    calls.push(call);
  };

  try {
    const item = await rec.capture('multi-detail', () => abs.getItem(itemId));
    calls.push('multi-detail');
    if (item.mediaType !== 'book') throw new Error(`${itemId} is not a book`);

    const direct = await rec.capture('multi-play', () => abs.play(itemId, device));
    calls.push('multi-play');
    const files = direct.audioTracks.map((t) => contentUrlParts(t.contentUrl));
    if (files.length < 2 || files.some((f) => f === null)) {
      throw new Error('the play answer is not a direct-play book of two or more files');
    }
    for (const [n, file] of files.entries()) {
      const call = `multi-file-${n + 1}`;
      const opened = await rec.capture(call, () => abs.openFile(file!, 'bytes=0-1'), {
        standIn: MULTI_FILE_STAND_IN,
      });
      await opened.body.cancel();
      calls.push(call);
    }
    await close('multi-close', direct.id);

    const transcode = await rec.capture('hls-play', () =>
      abs.play(itemId, device, { forceTranscode: true }),
    );
    calls.push('hls-play');
    const [track, ...rest] = transcode.audioTracks;
    const session = track === undefined || rest.length > 0 ? null : hlsSessionOf(track.contentUrl);
    if (session === null) throw new Error('the transcode did not answer one HLS track');
    await rec.capture('hls-playlist', () => abs.getHlsPlaylist(session));
    calls.push('hls-playlist');
    // Asked at once, the first segment is not cut yet, and ABS answers 404 until it is.
    const pending = await rec.capture('hls-segment-pending', () =>
      abs.openHlsSegment(session, 'output-0.ts').then(
        async (early) => {
          await early.body.cancel();
          throw new Error('the first segment was ready at once; record again');
        },
        (error: unknown) => error,
      ),
    );
    if (!(pending instanceof AdapterError && pending.status === 404)) throw pending;
    calls.push('hls-segment-pending');
    await waitForSegment(abs, session, io.sleep ?? sleep);
    const segment = await rec.capture(
      'hls-segment',
      () => abs.openHlsSegment(session, 'output-0.ts'),
      { standIn: HLS_SEGMENT_STAND_IN },
    );
    await segment.body.cancel();
    calls.push('hls-segment');
    await close('hls-close', transcode.id);
  } finally {
    // Never leave a playback session, or its transcode, open on the server, whatever failed.
    for (const id of open) await abs.closeSession(id).catch(() => undefined);
  }
  return calls.map((c) => join(dir, `${c}.json`));
}

/**
 * M1.music's calls on one album, as the service identity: the album and its tracks, the first
 * track, and its first two bytes. The person's token is minted unrecorded through Quick Connect,
 * as sign-in does, and logged out whatever fails. Reads only; no play is reported.
 */
async function recordJellyfinPlay(
  io: RecordIo,
  baseUrl: string,
  apiKey: string,
  dir: string,
  albumId: string,
) {
  const upstreamVersion = await new JellyfinClient({
    baseUrl,
    token: apiKey,
    fetch: io.fetch,
  }).getServerVersion();
  const provisioner = new JellyfinProvisioner({ baseUrl, apiKey, fetch: io.fetch });
  const identity = (await provisioner.accounts()).find((a) => a.username === TEST_IDENTITY);
  if (!identity) throw new Error(`Jellyfin has no user ${TEST_IDENTITY}`);
  const { token } = await provisioner.mint(identity.id, RECORD_USER_ID);
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'jellyfin',
    upstreamVersion,
    secrets: [apiKey, token],
    baseUrl,
  });
  const jf = new JellyfinClient({
    baseUrl,
    token,
    device: personDevice(RECORD_USER_ID),
    fetch: rec.fetch,
  });
  try {
    const album = await rec.capture('jf-album', () => jf.getPlayable(albumId));
    if (album.Type !== 'MusicAlbum') throw new Error(`${albumId} is not an album`);
    const tracks = await rec.capture('jf-album-tracks', () => jf.getAlbumPlayables(albumId));
    const [first] = tracks;
    if (!first) throw new Error('the album has no tracks');
    await rec.capture('jf-track', () => jf.getPlayable(first.Id));
    const opened = await rec.capture('jf-stream', () => jf.openAudio(first.Id, 'bytes=0-1'), {
      standIn: JELLYFIN_STREAM_STAND_IN,
    });
    await opened.body.cancel();
  } finally {
    const res = await io.fetch(new URL('Sessions/Logout', `${baseUrl}/`).toString(), {
      method: 'POST',
      headers: { authorization: buildAuthorizationHeader(personDevice(RECORD_USER_ID), token) },
    });
    io.out(`logged out the minted Jellyfin token: ${res.status}`);
  }
  return ['jf-album', 'jf-album-tracks', 'jf-track', 'jf-stream'].map((c) =>
    join(dir, `${c}.json`),
  );
}

/** What an episode's show notes are replaced with in a recording. */
export const SHOW_NOTES_DROPPED =
  'Show notes dropped by the recorder: they carry third-party links.';

/**
 * Replaces each episode's `description` in a recorded show, or in the show a play session carries
 * as its `libraryItem`. Show notes are published HTML full of sponsors' and networks' links and
 * addresses, which the scan rightly fails; nothing reads them. Everything else in the answer stays
 * as recorded.
 */
export function dropShowNotes(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body)) return raw;
  const answer = body.json as { libraryItem?: unknown } | null;
  const json =
    answer !== null && typeof answer === 'object' && 'libraryItem' in answer
      ? { ...answer, libraryItem: withoutShowNotes(answer.libraryItem) }
      : withoutShowNotes(answer);
  return { ...raw, response: { ...raw.response, body: { json } } };
}

function withoutShowNotes(show: unknown): unknown {
  const item = show as { media?: { episodes?: unknown } } | null;
  const episodes = item?.media?.episodes;
  if (!Array.isArray(episodes)) return show;
  const media = {
    ...item?.media,
    episodes: episodes.map((e: unknown) =>
      e !== null && typeof e === 'object' && 'description' in e
        ? { ...e, description: SHOW_NOTES_DROPPED }
        : e,
    ),
  };
  return { ...item, media };
}

/**
 * The index's Audiobookshelf calls, all reads: one page of each library, minified, and each
 * listed book or show as the index reads it. The Podcasts library is listed and read, never
 * scanned, and no file is opened, so no podcast stub is hydrated.
 */
async function recordIndexAbs(
  io: RecordIo,
  baseUrl: string,
  token: string,
  dir: string,
  secrets: string[],
  page: number,
) {
  const upstreamVersion = await new AbsClient({
    baseUrl,
    token,
    fetch: io.fetch,
  }).getServerVersion();
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion,
    secrets,
    baseUrl,
    prepare: dropShowNotes,
  });
  const abs = new AbsClient({ baseUrl, token, fetch: rec.fetch });
  const calls: string[] = [];
  for (const library of await abs.getLibraries()) {
    const kind = library.mediaType === 'book' ? 'book' : 'show';
    const listing = `index-${kind}s-page`;
    const { results } = await rec.capture(listing, () =>
      abs.getLibraryItems(library.id, { limit: INDEX_PAGE_SIZE, page, sort: 'addedAt' }),
    );
    calls.push(listing);
    for (const [n, item] of results.entries()) {
      const call = `index-${kind}-${n + 1}`;
      await rec.capture(call, () => abs.getItemSummary(item.id));
      calls.push(call);
    }
  }
  await rec.capture('index-item-gone', () => abs.findItemSummary(MISSING_ABS_ID));
  calls.push('index-item-gone');
  return calls.map((c) => join(dir, `${c}.json`));
}

/**
 * The index's Jellyfin calls: each listed album's tracks, and the lookups that confirm an album is
 * still there or gone. The albums are those on the page of each music library; the pages
 * themselves are `--only shell`'s `jf-library-albums-<n>`, so they are read here unrecorded.
 */
async function recordIndexJellyfin(
  io: RecordIo,
  baseUrl: string,
  token: string,
  dir: string,
  secrets: string[],
  page: number,
) {
  const plain = new JellyfinClient({ baseUrl, token, fetch: io.fetch });
  const upstreamVersion = await plain.getServerVersion();
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'jellyfin',
    upstreamVersion,
    secrets,
    baseUrl,
  });
  const jf = new JellyfinClient({ baseUrl, token, fetch: rec.fetch });
  const albums = [];
  for (const library of await plain.getLibraries()) {
    if (library.CollectionType !== 'music') continue;
    const listed = await plain.getAlbums({
      limit: INDEX_PAGE_SIZE,
      startIndex: page * INDEX_PAGE_SIZE,
      parentId: library.Id,
    });
    albums.push(...listed.Items);
  }
  const calls: string[] = [];
  for (const [n, album] of albums.entries()) {
    const call = `index-album-tracks-${n + 1}`;
    await rec.capture(call, () => jf.getAlbumTracks(album.Id));
    calls.push(call);
  }
  const [first] = albums;
  if (first) {
    await rec.capture('index-album-lookup', () => jf.findAlbum(first.Id));
    calls.push('index-album-lookup');
  }
  await rec.capture('index-album-gone', () => jf.findAlbum(MISSING_JELLYFIN_ID));
  calls.push('index-album-gone');
  return calls.map((c) => join(dir, `${c}.json`));
}

/** Runs record mode; resolves to the process exit code. */
export async function runRecord(io: RecordIo): Promise<number> {
  const { values } = parseArgs({
    args: io.argv,
    options: {
      abs: { type: 'string' },
      jellyfin: { type: 'string' },
      'jellyfin-item': { type: 'string' },
      'play-item': { type: 'string' },
      episode: { type: 'string' },
      episodes: { type: 'string' },
      books: { type: 'string' },
      shows: { type: 'string' },
      'index-page': { type: 'string' },
      lrclib: { type: 'string' },
      albums: { type: 'string' },
      'jellyfin-synced': { type: 'string' },
      'jellyfin-plain': { type: 'string' },
      'lrclib-synced': { type: 'string' },
      'lrclib-missing': { type: 'string' },
      'lrclib-instrumental': { type: 'string' },
      only: { type: 'string' },
      oidc: { type: 'string' },
      'oidc-version': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    io.out(USAGE);
    return 0;
  }
  const only = values.only;
  if (
    only !== undefined &&
    ![
      'abs',
      'jellyfin',
      'index',
      'play',
      'episode',
      'jfplay',
      'progress',
      'sessions',
      'shell',
      'lyrics',
      'lists',
      'oidc',
    ].includes(only)
  ) {
    io.err(
      `--only is abs, jellyfin, index, play, episode, jfplay, progress, sessions, shell, lyrics, lists or oidc, not ${only}`,
    );
    return 2;
  }
  const indexPage = Number(values['index-page'] ?? INDEX_PAGE);
  if (!Number.isInteger(indexPage) || indexPage < 0) {
    io.err(`--index-page is a page number from 0, not ${values['index-page']}`);
    return 2;
  }
  const root = values['dry-run'] ? mkdtempSync(join(tmpdir(), 'auralis-record-')) : here;
  if (only === 'oidc') return runOidc(io, values, parseKeys(io.stdin), root);
  if (only === 'play') return runPlay(io, values, parseKeys(io.stdin), root);
  if (only === 'episode') return runEpisode(io, values, parseKeys(io.stdin), root);
  if (only === 'jfplay') return runJellyfinPlay(io, values, parseKeys(io.stdin), root);
  if (only === 'progress') return runProgress(io, values, parseKeys(io.stdin), root);
  if (only === 'sessions') return runSessions(io, values, parseKeys(io.stdin), root);
  if (only === 'shell') return runShell(io, values, parseKeys(io.stdin), root);
  if (only === 'lyrics') return runLyrics(io, values, parseKeys(io.stdin), root);
  if (only === 'lists') return runLists(io, values, parseKeys(io.stdin), root);
  const wantIndex = only === undefined || only === 'index';
  const wantAbs = only !== 'jellyfin';
  const wantJellyfin = only !== 'abs';
  const keys = parseKeys(io.stdin);
  const absKey = keys.ABS_API_KEY;
  const jellyfinKey = keys.JELLYFIN_API_KEY;
  const missing = [
    wantAbs && !values.abs && '--abs',
    wantAbs && !absKey && 'ABS_API_KEY on stdin',
    wantJellyfin && !values.jellyfin && '--jellyfin',
    wantJellyfin && !jellyfinKey && 'JELLYFIN_API_KEY on stdin',
  ].filter(Boolean);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }

  const secrets = [absKey, jellyfinKey].filter((k): k is string => Boolean(k));
  const written: string[] = [];
  const absDir = join(root, 'audiobookshelf', 'recordings');
  const jellyfinDir = join(root, 'jellyfin', 'recordings');
  if (wantAbs && only !== 'index') {
    written.push(...(await recordAbs(io, values.abs as string, absKey as string, absDir, secrets)));
  }
  if (wantJellyfin && only !== 'index') {
    written.push(
      ...(await recordJellyfin(
        io,
        values.jellyfin as string,
        jellyfinKey as string,
        jellyfinDir,
        secrets,
        values['jellyfin-item'],
      )),
    );
  }
  if (wantIndex) {
    const [absUrl, jellyfinUrl] = [values.abs as string, values.jellyfin as string];
    written.push(
      ...(await recordIndexAbs(io, absUrl, absKey as string, absDir, secrets, indexPage)),
      ...(await recordIndexJellyfin(
        io,
        jellyfinUrl,
        jellyfinKey as string,
        jellyfinDir,
        secrets,
        indexPage,
      )),
    );
  }

  return scanWritten(io, written, []);
}

/** Scans every written recording; any finding, a name seen while recording included, fails. */
function scanWritten(io: RecordIo, written: string[], seen: readonly string[]): number {
  const names = [...seen, ...(io.names ?? [])];
  let findings = 0;
  for (const file of written) {
    const recording = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    for (const f of scanRecording(recording, { names })) {
      findings += 1;
      io.err(`${file}: ${f.kind} at ${f.path}`);
    }
    io.out(`wrote ${file}`);
  }
  if (findings > 0) {
    io.err(`${findings} finding(s): do not commit these recordings`);
    return 1;
  }
  return 0;
}

async function runPlay(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const [absUrl, itemId, key] = [values.abs, values['play-item'], keys.ABS_API_KEY];
  const missing = [
    typeof absUrl !== 'string' && '--abs',
    typeof itemId !== 'string' && '--play-item',
    key === undefined && 'ABS_API_KEY on stdin',
  ].filter(Boolean);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const dir = join(root, 'audiobookshelf', 'recordings');
  const written = await recordPlay(io, absUrl as string, key!, dir, [key!], itemId as string);
  return scanWritten(io, written, []);
}

async function runEpisode(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const [baseUrl, showId, episodeId, token] = [
    values.abs,
    values['play-item'],
    values.episode,
    keys.ABS_API_KEY,
  ];
  const missing = [
    typeof baseUrl !== 'string' && '--abs',
    typeof showId !== 'string' && '--play-item',
    typeof episodeId !== 'string' && '--episode',
    token === undefined && 'ABS_API_KEY on stdin',
  ].filter(Boolean);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const dir = join(root, 'audiobookshelf', 'recordings');
  const upstreamVersion = await new AbsClient({
    baseUrl: baseUrl as string,
    token: token!,
    fetch: io.fetch,
  }).getServerVersion();
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion,
    secrets: [token!],
    baseUrl: baseUrl as string,
    prepare: dropShowNotes,
  });
  const abs = new AbsClient({ baseUrl: baseUrl as string, token: token!, fetch: rec.fetch });
  const device = { deviceId: 'auralis-recorder', clientVersion: CLIENT_VERSION };
  const played = await rec.capture('episode-play', () =>
    abs.playEpisode(showId as string, episodeId as string, device),
  );
  try {
    const [track, ...rest] = played.audioTracks;
    const file = track === undefined || rest.length > 0 ? null : contentUrlParts(track.contentUrl);
    if (file === null) throw new Error('the play answer is not a direct play of one file');
    const opened = await rec.capture('episode-file', () => abs.openFile(file, 'bytes=0-1'), {
      standIn: MULTI_FILE_STAND_IN,
    });
    await opened.body.cancel();
  } finally {
    await rec.capture('episode-close', () => abs.closeSession(played.id));
  }
  return scanWritten(
    io,
    ['episode-play', 'episode-file', 'episode-close'].map((c) => join(dir, `${c}.json`)),
    [],
  );
}

async function runJellyfinPlay(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const [url, albumId, key] = [values.jellyfin, values['jellyfin-item'], keys.JELLYFIN_API_KEY];
  const missing = [
    typeof url !== 'string' && '--jellyfin',
    typeof albumId !== 'string' && '--jellyfin-item',
    key === undefined && 'JELLYFIN_API_KEY on stdin',
  ].filter(Boolean);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const dir = join(root, 'jellyfin', 'recordings');
  const written = await recordJellyfinPlay(io, url as string, key!, dir, albumId as string);
  return scanWritten(io, written, []);
}

async function runProgress(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const need = {
    '--abs': values.abs,
    '--jellyfin': values.jellyfin,
    '--play-item': values['play-item'],
    '--jellyfin-item': values['jellyfin-item'],
    'ABS_API_KEY on stdin': keys.ABS_API_KEY,
    'JELLYFIN_API_KEY on stdin': keys.JELLYFIN_API_KEY,
  };
  const missing = Object.entries(need)
    .filter(([, v]) => typeof v !== 'string' || v === '')
    .map(([k]) => k);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const { written, matches } = await recordProgress({
    fetch: io.fetch,
    out: io.out,
    sleep: io.sleep ?? sleep,
    root,
    absUrl: values.abs as string,
    jellyfinUrl: values.jellyfin as string,
    absKey: keys.ABS_API_KEY as string,
    jellyfinKey: keys.JELLYFIN_API_KEY as string,
    bookId: values['play-item'] as string,
    trackId: values['jellyfin-item'] as string,
  });
  const scanned = scanWritten(io, written, []);
  if (!matches) {
    io.err("the test user's state is not as it was before the run: do not commit");
    return 1;
  }
  return scanned;
}

/** Two comma-separated ids, or undefined. */
function pair(value: string | boolean | undefined): [string, string] | undefined {
  if (typeof value !== 'string') return undefined;
  const ids = value.split(',').map((v) => v.trim());
  return ids.length === 2 && ids.every((v) => v !== '') ? [ids[0]!, ids[1]!] : undefined;
}

async function runSessions(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const books = pair(values.books);
  const shows = pair(values.shows);
  const need = {
    '--abs': values.abs,
    '--jellyfin': values.jellyfin,
    '--jellyfin-item': values['jellyfin-item'],
    '--books (two ids)': books && 'ok',
    '--shows (two ids)': shows && 'ok',
    'ABS_API_KEY on stdin': keys.ABS_API_KEY,
    'JELLYFIN_API_KEY on stdin': keys.JELLYFIN_API_KEY,
  };
  const missing = Object.entries(need)
    .filter(([, v]) => typeof v !== 'string' || v === '')
    .map(([k]) => k);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const { written, matches } = await recordSessions({
    fetch: io.fetch,
    out: io.out,
    root,
    absUrl: values.abs as string,
    jellyfinUrl: values.jellyfin as string,
    absKey: keys.ABS_API_KEY as string,
    jellyfinKey: keys.JELLYFIN_API_KEY as string,
    books: books!,
    shows: shows!,
    mixTrack: values['jellyfin-item'] as string,
  });
  const scanned = scanWritten(io, written, []);
  if (!matches) {
    io.err(UNDO_UNCONFIRMED);
    return 1;
  }
  return scanned;
}

async function runShell(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const need = {
    '--abs': values.abs,
    '--jellyfin': values.jellyfin,
    '--play-item': values['play-item'],
    '--jellyfin-item': values['jellyfin-item'],
    'ABS_API_KEY on stdin': keys.ABS_API_KEY,
    'JELLYFIN_API_KEY on stdin': keys.JELLYFIN_API_KEY,
  };
  const missing = Object.entries(need)
    .filter(([, v]) => typeof v !== 'string' || v === '')
    .map(([k]) => k);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const { written } = await recordShell({
    fetch: io.fetch,
    out: io.out,
    root,
    absUrl: values.abs as string,
    jellyfinUrl: values.jellyfin as string,
    absKey: keys.ABS_API_KEY as string,
    jellyfinKey: keys.JELLYFIN_API_KEY as string,
    bookId: values['play-item'] as string,
    albumId: values['jellyfin-item'] as string,
    pageSize: INDEX_PAGE_SIZE,
  });
  return scanWritten(io, written, []);
}

async function runLyrics(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const albums =
    typeof values.albums === 'string' ? values.albums.split(',').map((v) => v.trim()) : undefined;
  const need = {
    '--jellyfin': values.jellyfin,
    '--lrclib': values.lrclib,
    '--albums': albums?.every((a) => a !== '') ? 'ok' : undefined,
    '--jellyfin-synced': values['jellyfin-synced'],
    '--jellyfin-plain': values['jellyfin-plain'],
    '--lrclib-synced': values['lrclib-synced'],
    '--lrclib-missing': values['lrclib-missing'],
    '--lrclib-instrumental': values['lrclib-instrumental'],
    'JELLYFIN_API_KEY on stdin': keys.JELLYFIN_API_KEY,
  };
  const missing = Object.entries(need)
    .filter(([, v]) => typeof v !== 'string' || v === '')
    .map(([k]) => k);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const { written } = await recordLyrics({
    fetch: io.fetch,
    out: io.out,
    sleep: io.sleep ?? sleep,
    root,
    jellyfinUrl: values.jellyfin as string,
    jellyfinKey: keys.JELLYFIN_API_KEY as string,
    lrclibUrl: values.lrclib as string,
    albums: albums!,
    tracks: {
      jellyfinSynced: values['jellyfin-synced'] as string,
      jellyfinPlain: values['jellyfin-plain'] as string,
      lrclibSynced: values['lrclib-synced'] as string,
      lrclibMissing: values['lrclib-missing'] as string,
      lrclibInstrumental: values['lrclib-instrumental'] as string,
    },
  });
  return scanWritten(io, written, []);
}

async function runLists(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const episodes =
    typeof values.episodes === 'string'
      ? values.episodes.split(',').map((v) => v.trim())
      : undefined;
  const need = {
    '--abs': values.abs,
    '--play-item': values['play-item'],
    '--episodes': episodes?.every((e) => e !== '') ? 'ok' : undefined,
    'ABS_API_KEY on stdin': keys.ABS_API_KEY,
  };
  const missing = Object.entries(need)
    .filter(([, v]) => typeof v !== 'string' || v === '')
    .map(([k]) => k);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const { written, matches } = await recordLists({
    fetch: io.fetch,
    out: io.out,
    root,
    absUrl: values.abs as string,
    absKey: keys.ABS_API_KEY as string,
    showId: values['play-item'] as string,
    episodeIds: episodes!,
  });
  const scanned = scanWritten(io, written, []);
  if (!matches) {
    io.err(UNDO_UNCONFIRMED);
    return 1;
  }
  return scanned;
}

async function runOidc(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const need = {
    '--oidc': values.oidc,
    '--oidc-version': values['oidc-version'],
    '--abs': values.abs,
    '--jellyfin': values.jellyfin,
    'OIDC_CLIENT_SECRET on stdin': keys.OIDC_CLIENT_SECRET,
    'OIDC_TEST_PASSWORD on stdin': keys.OIDC_TEST_PASSWORD,
    'ABS_PROVISION_KEY on stdin': keys.ABS_PROVISION_KEY,
    'JELLYFIN_API_KEY on stdin': keys.JELLYFIN_API_KEY,
  };
  const missing = Object.entries(need)
    .filter(([, v]) => typeof v !== 'string' || v === '')
    .map(([k]) => k);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const { written, names } = await recordOidc({
    fetch: io.fetch,
    out: io.out,
    root,
    issuer: values.oidc as string,
    oidcVersion: values['oidc-version'] as string,
    absUrl: values.abs as string,
    jellyfinUrl: values.jellyfin as string,
    keys: {
      clientSecret: keys.OIDC_CLIENT_SECRET as string,
      password: keys.OIDC_TEST_PASSWORD as string,
      absProvisionKey: keys.ABS_PROVISION_KEY as string,
      jellyfinApiKey: keys.JELLYFIN_API_KEY as string,
    },
    ...(io.random ? { random: io.random } : {}),
    ...(io.now ? { now: io.now } : {}),
  });
  return scanWritten(io, written, names);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const stdin = argv.includes('--help') ? '' : await readStdin();
  runRecord({
    argv,
    stdin,
    fetch: (url, init) => globalThis.fetch(url, init),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    names: localNames(process.env, homedir()),
  }).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
