/**
 * Record mode's `lyrics` part: the upstream answers M2.lrclib's lyrics reads, all reads.
 *
 * - Jellyfin, with the API key as the index asks: each given album (`lyrics-album-<n>`) and its
 *   tracks (`lyrics-album-<n>-tracks`), the rows LRCLIB's queries are built from.
 * - Jellyfin, as `auralis` through a token minted by Quick Connect and logged out at once: the
 *   lyrics of a track with a synced file (`jf-lyrics-synced`), of one with a plain file
 *   (`jf-lyrics-plain`), and of the LRCLIB-synced track, which has none (`jf-lyrics-none`, a 404).
 * - LRCLIB's `GET /api/get` for a track it has synced lyrics for (`lrclib-get-synced`), one it
 *   cannot find (`lrclib-get-missing`) and one it knows as instrumental (`lrclib-get-instrumental`),
 *   each asked as `lyricsQuery` asks from the recorded rows, ten seconds apart. A busy LRCLIB (503)
 *   is asked again up to three times, 30 s apart; after that the run fails, so a busy answer is
 *   never recorded as a missing one.
 *
 * Song lyrics are copyrighted and the repo is public: every recorded lyrics answer keeps only its
 * first four lines of each kind, and says so (`trimLyricsExchange`). Each answer is scanned, and
 * each chosen track's answer checked to be of the kind it was chosen for, before its recording is
 * written: the run fails otherwise, leaving no unscanned file behind. A failed logout never hides
 * the failure before it; both are reported.
 */
import { join } from 'node:path';
import { AdapterError, type FetchLike } from './http/fetch.js';
import { createRecorder, withCleanup } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange } from './http/scrub.js';
import { buildAuthorizationHeader } from './jellyfin/auth.js';
import { JellyfinClient } from './jellyfin/client.js';
import { JellyfinProvisioner, personDevice } from './jellyfin/quickConnect.js';
import { type JellyfinLyrics } from './jellyfin/schemas.js';
import { LRCLIB_USER_AGENT, LrclibClient, type LrclibQuery } from './lrclib/client.js';
import { type LrclibRecord } from './lrclib/schemas.js';
import { RECORD_USER_ID, TEST_IDENTITY } from './record-oidc.js';
import { albumRow, type IndexRow, trackRows } from '../libraryIndex/rows.js';
import { lyricsQuery } from '../lyrics/query.js';

/** LRCLIB names no version of its API; the recording names the API it was read as. */
export const LRCLIB_VERSION = 'LRCLIB API, unversioned';

/** How many lines of each lyrics a recording keeps. */
export const LYRICS_KEPT_LINES = 4;

/** What a trimmed lyrics answer says about itself, in its own `trimmed` key. */
export const LYRICS_TRIMMED =
  'Trimmed by the recorder: song lyrics are copyrighted, so only the first four lines of each ' +
  "are kept, and LRCLIB's lyricsfile copy is dropped.";

/** The wait between two LRCLIB calls, and before asking a busy LRCLIB again. */
export const LRCLIB_GAP_MS = 10_000;
export const LRCLIB_BUSY_WAIT_MS = 30_000;
/** How many more times a busy LRCLIB is asked before the run fails. */
export const LRCLIB_BUSY_RETRIES = 3;

/** The album rows' library: LRCLIB's query reads no library, so none is looked up. */
const NO_LIBRARY = '';

/** The first `LYRICS_KEPT_LINES` lines of `text`, each line end as sent; shorter text as it is. */
function firstLines(text: string): string {
  const parts = text.split(/(?<=\n)/);
  if (parts.length <= LYRICS_KEPT_LINES) return text;
  return parts
    .slice(0, LYRICS_KEPT_LINES)
    .join('')
    .replace(/\r?\n$/, '');
}

/**
 * The recorder's hook: cuts a Jellyfin lyrics answer's `Lyrics`, and an LRCLIB record's
 * `syncedLyrics` and `plainLyrics`, to their first four lines, drops LRCLIB's `lyricsfile`, and
 * says so in a top-level `trimmed` key. Any other answer, a 404's included, is left as it is.
 */
export function trimLyricsExchange(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body)) return raw;
  const answer = body.json;
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return raw;
  const fields = answer as Record<string, unknown>;
  const jellyfin = Array.isArray(fields.Lyrics);
  const lrclib = ['syncedLyrics', 'plainLyrics', 'lyricsfile'].some((k) => k in fields);
  if (!jellyfin && !lrclib) return raw;
  const json: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'lyricsfile') continue;
    if (key === 'Lyrics' && Array.isArray(value)) json[key] = value.slice(0, LYRICS_KEPT_LINES);
    else if ((key === 'syncedLyrics' || key === 'plainLyrics') && typeof value === 'string') {
      json[key] = firstLines(value);
    } else json[key] = value;
  }
  json.trimmed = LYRICS_TRIMMED;
  return { ...raw, response: { ...raw.response, body: { json } } };
}

export interface LyricsRecordTracks {
  /** A track whose Jellyfin lyrics file is synced. */
  jellyfinSynced: string;
  /** A track whose Jellyfin lyrics file is plain. */
  jellyfinPlain: string;
  /** A track with no Jellyfin lyrics that LRCLIB has synced lyrics for. */
  lrclibSynced: string;
  /** A track LRCLIB cannot find. */
  lrclibMissing: string;
  /** A track LRCLIB knows as instrumental. */
  lrclibInstrumental: string;
}

export interface LyricsRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  root: string;
  jellyfinUrl: string;
  jellyfinKey: string;
  lrclibUrl: string;
  /** The albums holding the three LRCLIB tracks. */
  albums: string[];
  tracks: LyricsRecordTracks;
}

function url(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

/** Fails on any scan finding, before the recording is written. */
function scanned(recording: Recording) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${recording.call}: ${found}; not written`);
  }
}
const scanOnly = { verify: (_: unknown, recording: Recording) => scanned(recording) };

const timed = (l: JellyfinLyrics) => l.Lyrics.filter((line) => line.Start != null).length;

/** Fails unless Jellyfin's answer for the track is of the kind it was chosen for. */
function expectJellyfin(kind: 'synced' | 'plain' | 'none', answer: JellyfinLyrics | null) {
  const found =
    answer === null
      ? 'none'
      : answer.Lyrics.length > 0 && timed(answer) === answer.Lyrics.length
        ? 'synced'
        : answer.Lyrics.length > 0 && timed(answer) === 0
          ? 'plain'
          : 'mixed';
  if (found !== kind) throw new Error(`the ${kind} track's Jellyfin lyrics are ${found}`);
}

/** Fails unless LRCLIB's answer for the track is of the kind it was chosen for. */
function expectLrclib(kind: 'synced' | 'missing' | 'instrumental', answer: LrclibRecord | null) {
  const found =
    answer === null
      ? 'missing'
      : answer.instrumental
        ? 'instrumental'
        : answer.syncedLyrics !== null
          ? 'synced'
          : 'plain';
  if (found !== kind) throw new Error(`the ${kind} track's LRCLIB answer is ${found}`);
}

export async function recordLyrics(input: LyricsRecordInput): Promise<{ written: string[] }> {
  const { jellyfinUrl, jellyfinKey, lrclibUrl, out, tracks } = input;
  const written: string[] = [];
  const jellyfinDir = join(input.root, 'jellyfin', 'recordings');
  const lrclibDir = join(input.root, 'lrclib', 'recordings');

  const jellyfinVersion = await new JellyfinClient({
    baseUrl: jellyfinUrl,
    token: jellyfinKey,
    fetch: input.fetch,
  }).getServerVersion();
  const indexRec = createRecorder({
    fetch: input.fetch,
    dir: jellyfinDir,
    upstream: 'jellyfin',
    upstreamVersion: jellyfinVersion,
    secrets: [jellyfinKey],
    baseUrl: jellyfinUrl,
  });
  const jfIndex = new JellyfinClient({
    baseUrl: jellyfinUrl,
    token: jellyfinKey,
    fetch: indexRec.fetch,
  });
  const rows = new Map<string, { track: IndexRow; album: IndexRow }>();
  for (const [n, albumId] of input.albums.entries()) {
    const call = `lyrics-album-${n + 1}`;
    const album = await indexRec.capture(call, () => jfIndex.findAlbum(albumId), scanOnly);
    if (!album) throw new Error(`Jellyfin has no album ${albumId}`);
    written.push(join(jellyfinDir, `${call}.json`));
    const listed = await indexRec.capture(
      `${call}-tracks`,
      () => jfIndex.getAlbumTracks(albumId),
      scanOnly,
    );
    written.push(join(jellyfinDir, `${call}-tracks.json`));
    const albumIndexRow = albumRow(album, NO_LIBRARY);
    for (const track of trackRows(album.Id, NO_LIBRARY, listed)) {
      rows.set(track.id, { track, album: albumIndexRow });
    }
  }
  const queries = {
    synced: tracks.lrclibSynced,
    missing: tracks.lrclibMissing,
    instrumental: tracks.lrclibInstrumental,
  };
  const asked: [keyof typeof queries, LrclibQuery][] = [];
  for (const [kind, id] of Object.entries(queries) as [keyof typeof queries, string][]) {
    const found = rows.get(id);
    if (!found) throw new Error(`the ${kind} LRCLIB track ${id} is on none of the recorded albums`);
    const query = lyricsQuery(found.track, found.album);
    if (!query) throw new Error(`the ${kind} LRCLIB track ${id} has no length or no artist`);
    asked.push([kind, query]);
  }

  const provisioner = new JellyfinProvisioner({
    baseUrl: jellyfinUrl,
    apiKey: jellyfinKey,
    fetch: input.fetch,
  });
  const identity = (await provisioner.accounts()).find((a) => a.username === TEST_IDENTITY);
  if (!identity) throw new Error(`Jellyfin has no user ${TEST_IDENTITY}`);
  const device = personDevice(RECORD_USER_ID);
  const { token } = await provisioner.mint(identity.id, RECORD_USER_ID);
  const logOut = async () => {
    const res = await input.fetch(url(jellyfinUrl, 'Sessions/Logout'), {
      method: 'POST',
      headers: { authorization: buildAuthorizationHeader(device, token) },
    });
    out(`logged out the minted Jellyfin token: ${res.status}`);
  };
  const failedLogOut = (error: unknown) =>
    out(`logging out the minted Jellyfin token failed: ${String(error)}`);
  await withCleanup(
    async () => {
      const jfRec = createRecorder({
        fetch: input.fetch,
        dir: jellyfinDir,
        upstream: 'jellyfin',
        upstreamVersion: jellyfinVersion,
        secrets: [jellyfinKey, token],
        baseUrl: jellyfinUrl,
        prepare: trimLyricsExchange,
      });
      const jf = new JellyfinClient({ baseUrl: jellyfinUrl, token, device, fetch: jfRec.fetch });
      const jellyfinCalls = [
        ['jf-lyrics-synced', 'synced', tracks.jellyfinSynced],
        ['jf-lyrics-plain', 'plain', tracks.jellyfinPlain],
        ['jf-lyrics-none', 'none', tracks.lrclibSynced],
      ] as const;
      for (const [call, kind, id] of jellyfinCalls) {
        const answer = await jfRec.capture(call, () => jf.getLyrics(id), {
          verify: (found, recording) => {
            expectJellyfin(kind, found);
            scanned(recording);
          },
        });
        written.push(join(jellyfinDir, `${call}.json`));
        out(`${call}: ${answer === null ? 'no lyrics' : `${answer.Lyrics.length} lines`}`);
      }
    },
    logOut,
    failedLogOut,
  );

  const lrclibRec = createRecorder({
    fetch: input.fetch,
    dir: lrclibDir,
    upstream: 'lrclib',
    upstreamVersion: LRCLIB_VERSION,
    secrets: [jellyfinKey],
    baseUrl: lrclibUrl,
    prepare: trimLyricsExchange,
  });
  const lrclib = new LrclibClient({
    baseUrl: lrclibUrl,
    fetch: lrclibRec.fetch,
    userAgent: LRCLIB_USER_AGENT,
  });
  for (const [n, [kind, query]] of asked.entries()) {
    if (n > 0) await input.sleep(LRCLIB_GAP_MS);
    const call = `lrclib-get-${kind}`;
    const answer = await askPatiently(input, () =>
      lrclibRec.capture(call, () => lrclib.get(query), {
        verify: (found, recording) => {
          expectLrclib(kind, found);
          scanned(recording);
        },
      }),
    );
    written.push(join(lrclibDir, `${call}.json`));
    out(`${call}: ${answer === null ? 'not found' : `record ${answer.id}`}`);
  }
  return { written };
}

/** Runs `ask`, asking again after a wait each time LRCLIB answers 503, up to the retries. */
async function askPatiently<T>(input: LyricsRecordInput, ask: () => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await ask();
    } catch (error) {
      const busy = error instanceof AdapterError && error.status === 503;
      if (!busy || retry >= LRCLIB_BUSY_RETRIES) throw error;
      input.out(`LRCLIB is busy; asking again in ${LRCLIB_BUSY_WAIT_MS / 1000} s`);
      await input.sleep(LRCLIB_BUSY_WAIT_MS);
    }
  }
}
