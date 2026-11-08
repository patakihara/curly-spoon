/**
 * Record mode's `ytmusic` part: InnerTube's answers for M3.ytmusic, all reads, with no key, cookie
 * or account.
 *
 * - `search-songs`, a song with one artist; `search-songs-several`, songs with several.
 * - `search-bad-version`, the same search told a client version InnerTube refuses, a 404.
 * - `next-radio`, the radio from the first song.
 * - `player-visionos`, YouTube's player asked for the first song as VISIONOS, with the visitor id
 *   the search named; `player-botwall`, the same asked with none; `player-unplayable`, an id that
 *   names no track.
 *
 * This machine must leave by the server's own public address, or what is recorded is not what the
 * server gets. Each asks a public echo of its address, the server through a throwaway container, and
 * the run refuses when they differ. Neither is printed, and the address joins the recorder's
 * secrets, so it is replaced wherever an answer holds it. Every answer is cut down
 * (`trimYtMusicExchange`), a format's URL rebuilt from an allowlist of its parameters as the
 * extractor's recorder does, and scanned before it is written. A visitor id is kept only where an
 * answer names it, and the scrubber replaces it there.
 */
import { join } from 'node:path';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { recordedFormatUrl } from './record-extractor.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange } from './http/scrub.js';
import {
  clientVersion,
  SONGS_FILTER,
  Visitor,
  YTMUSIC_COUNTRY,
  YtMusicClient,
} from './ytmusic/client.js';
import { PLAYER_URL, VISIONOS, YtPlayer } from './ytmusic/player.js';

/** InnerTube names no version of its API; the recording names the client it was read as. */
export const YTMUSIC_VERSION = 'InnerTube WEB_REMIX, unversioned';

/** The player's recordings name the client they asked as, and where it was copied from. */
export const PLAYER_VERSION = `InnerTube ${VISIONOS.clientName} ${VISIONOS.clientVersion}, as yt-dlp 2026.10.26 asks it`;

/** An id of the right form that names no track. */
export const NO_SUCH_TRACK = 'aaaaaaaaaaa';

/** A public page that says, among other lines, `ip=<the address that asked>`. */
export const ADDRESS_ECHO_URL = 'https://www.cloudflare.com/cdn-cgi/trace';

/** The argv that reads the echo from the server's own address, in a container gone at the end. */
export const SERVER_ECHO_ARGV = [
  'ssh',
  'mediaserver',
  'docker',
  'run',
  '--rm',
  '--network',
  'bridge',
  'node:22-alpine',
  'wget',
  '-qO-',
  ADDRESS_ECHO_URL,
];

export const SEARCH_KEPT_ROWS = 8;
export const RADIO_KEPT_ROWS = 12;

export const YTMUSIC_TRIMMED =
  'Trimmed by the recorder: rows cut to the first few, and everything Auralis never reads taken ' +
  'out (tracking values, menus, continuations, the session context but its visitor id).';

/** Keys InnerTube answers carry that Auralis never reads, tracking and session values among them. */
const DROPPED_KEYS = new Set([
  'trackingParams',
  'clickTrackingParams',
  'loggingContext',
  'itemSectionRenderer',
  'menu',
  'overlay',
  'playerOverlays',
  'videoReporting',
  'queueContextParams',
  'currentVideoEndpoint',
  'queueNavigationEndpoint',
  'continuations',
  'shuffleToggleButton',
  'badges',
]);

/** A player's format row, cut to what the audio-only guard reads, and what tells video from audio. */
const FORMAT_KEPT = [
  'itag',
  'url',
  'signatureCipher',
  'mimeType',
  'bitrate',
  'averageBitrate',
  'contentLength',
  'approxDurationMs',
  'audioQuality',
  'audioSampleRate',
  'audioChannels',
  'width',
  'height',
  'fps',
  'qualityLabel',
];
const VIDEO_DETAILS_KEPT = ['videoId', 'lengthSeconds', 'isLive', 'isLiveContent'];

function pick(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const from = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => k in from).map((k) => [k, from[k]]));
}

/** A format row with its URL rebuilt as the extractor's recorder rebuilds it: an allowlist only. */
function formatRow(row: Record<string, unknown>): Record<string, unknown> {
  return typeof row.url === 'string' ? { ...row, url: recordedFormatUrl(row.url) } : row;
}

/** The session context, cut to its visitor id: the one value of it Auralis reads. */
function visitorOnly(context: unknown): Record<string, unknown> | undefined {
  const visitor = (context as { visitorData?: unknown } | null)?.visitorData;
  return typeof visitor === 'string' ? { visitorData: visitor } : undefined;
}

/** A player answer, cut to its status, the track it names and its format rows. */
function cutPlayer(json: Record<string, unknown>): Record<string, unknown> {
  const streaming = json.streamingData as Record<string, unknown> | undefined;
  const rows = (key: string) =>
    Array.isArray(streaming?.[key])
      ? { [key]: (streaming[key] as unknown[]).map((row) => formatRow(pick(row, FORMAT_KEPT))) }
      : {};
  const context = visitorOnly(json.responseContext);
  return {
    ...(context === undefined ? {} : { responseContext: context }),
    playabilityStatus: pick(json.playabilityStatus, ['status', 'reason']),
    ...('videoDetails' in json
      ? { videoDetails: pick(json.videoDetails, VIDEO_DETAILS_KEPT) }
      : {}),
    ...(streaming === undefined
      ? {}
      : {
          streamingData: {
            ...pick(streaming, ['expiresInSeconds']),
            ...rows('formats'),
            ...rows('adaptiveFormats'),
          },
        }),
  };
}

function cut(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cut);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (key === 'responseContext') {
      const context = visitorOnly(field);
      if (context !== undefined) out[key] = context;
      continue;
    }
    if (DROPPED_KEYS.has(key)) continue;
    const kept = cut(field);
    if (key === 'musicShelfRenderer' || key === 'playlistPanelRenderer') {
      const limit = key === 'musicShelfRenderer' ? SEARCH_KEPT_ROWS : RADIO_KEPT_ROWS;
      const shelf = kept as { contents: unknown[] };
      out[key] = { ...shelf, contents: shelf.contents.slice(0, limit) };
    } else out[key] = kept;
  }
  return out;
}

/** The recorder's hook: cuts a JSON answer down, and says so in a top-level `trimmed` key. */
export function trimYtMusicExchange(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body)) return raw;
  const whole = body.json as Record<string, unknown>;
  const kept = 'playabilityStatus' in whole ? cutPlayer(whole) : (cut(whole) as typeof whole);
  const json = { ...kept, trimmed: YTMUSIC_TRIMMED };
  return { ...raw, response: { ...raw.response, body: { json } } };
}

/** The address a public echo names, or a failure that never prints the page. */
export function echoedAddress(page: string): string {
  const address = /^ip=(\S+)$/m.exec(page)?.[1];
  if (address === undefined) throw new Error('the address echo names no address');
  return address;
}

export interface YtMusicRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  baseUrl: string;
  now: () => number;
  /** The echo's page, as the server's own address reads it. */
  serverEcho: () => Promise<string>;
  /** YouTube's player; its own address when not given. */
  playerUrl?: string;
}

function scanned(recording: Recording) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${recording.call}: ${found}; not written`);
  }
}

export async function recordYtMusic(input: YtMusicRecordInput): Promise<{ written: string[] }> {
  const { baseUrl, now, out } = input;
  const address = echoedAddress(await (await input.fetch(ADDRESS_ECHO_URL)).text());
  if (address !== echoedAddress(await input.serverEcho())) {
    throw new Error("this machine does not leave by the server's public address: nothing recorded");
  }
  out("this machine leaves by the server's public address");

  const dir = join(input.root, 'ytmusic', 'recordings');
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'ytmusic',
    upstreamVersion: YTMUSIC_VERSION,
    secrets: [address],
    baseUrl,
    prepare: trimYtMusicExchange,
  });
  const visitor = new Visitor();
  const client = new YtMusicClient({
    baseUrl,
    fetch: rec.fetch,
    now,
    visitor,
    onBad: (what) => {
      throw new Error(`InnerTube's answer: ${what}`);
    },
  });
  const written: string[] = [];
  const done = (call: string, what: string) => {
    written.push(join(dir, `${call}.json`));
    out(`${call}: ${what}`);
  };
  const scanOnly = { verify: (_: unknown, recording: Recording) => scanned(recording) };

  const songs = await rec.capture(
    'search-songs',
    () => client.search('Never Gonna Give You Up Rick Astley'),
    scanOnly,
  );
  const [seed] = songs;
  if (seed === undefined) throw new Error('the search found nothing to make a radio from');
  done('search-songs', `${songs.length} songs`);

  const several = await rec.capture(
    'search-songs-several',
    () => client.search('Dame Tu Cosita El Chombo'),
    {
      verify: (found, recording) => {
        if (!found.some((song) => song.artists.length > 1)) {
          throw new Error('no recorded song has several artists');
        }
        scanned(recording);
      },
    },
  );
  done('search-songs-several', `${several.length} songs`);

  await rec.capture(
    'search-bad-version',
    () =>
      rec.fetch(new URL('youtubei/v1/search?prettyPrint=false', `${baseUrl}/`).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '0.0.0',
              hl: 'en',
              gl: YTMUSIC_COUNTRY,
            },
          },
          query: 'Never Gonna Give You Up Rick Astley',
          params: SONGS_FILTER,
        }),
      }),
    {
      verify: (_, recording) => {
        if (recording.response.status !== 404) {
          throw new Error(`a refused version answered ${recording.response.status}`);
        }
        scanned(recording);
      },
    },
  );
  done('search-bad-version', 'refused');

  const radio = await rec.capture('next-radio', () => client.radio(seed.id), scanOnly);
  done('next-radio', `${radio.length} songs, as of ${clientVersion(now())}`);

  const id = visitor.get();
  if (id === null) throw new Error('no InnerTube answer named a visitor id');
  const players = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'ytmusic',
    upstreamVersion: PLAYER_VERSION,
    secrets: [address, id],
    baseUrl: input.playerUrl ?? PLAYER_URL,
    prepare: trimYtMusicExchange,
  });
  const player = new YtPlayer({ baseUrl: input.playerUrl ?? PLAYER_URL, fetch: players.fetch });
  const status = (call: string, want: string) => ({
    verify: (answer: { playabilityStatus: { status: string } }, recording: Recording) => {
      if (answer.playabilityStatus.status !== want) {
        throw new Error(`${call} answered ${answer.playabilityStatus.status}, not ${want}`);
      }
      scanned(recording);
    },
  });
  await players.capture(
    'player-visionos',
    () => player.player(seed.id, id),
    status('player-visionos', 'OK'),
  );
  done('player-visionos', 'OK');
  await players.capture(
    'player-botwall',
    () => player.player(seed.id, null),
    status('player-botwall', 'LOGIN_REQUIRED'),
  );
  done('player-botwall', 'LOGIN_REQUIRED');
  const unplayable = await players.capture(
    'player-unplayable',
    () => player.player(NO_SUCH_TRACK, id),
    scanOnly,
  );
  done('player-unplayable', unplayable.playabilityStatus.status);
  return { written };
}
