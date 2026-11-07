/**
 * Record mode's `ytmusic` part: InnerTube's answers for M3.ytmusic, all reads, with no key, cookie
 * or account.
 *
 * - `search-songs`, a song with one artist; `search-songs-several`, songs with several.
 * - `search-bad-version`, the same search told a client version InnerTube refuses, a 404.
 * - `next-radio`, the radio from the first song.
 *
 * This machine must leave by the server's own public address, or what is recorded is not what the
 * server gets. Each asks a public echo of its address, the server through a throwaway container, and
 * the run refuses when they differ. Neither is printed, and the address joins the recorder's
 * secrets, so it is replaced wherever an answer holds it. Every answer is cut down
 * (`trimYtMusicExchange`), and scanned before it is written.
 */
import { join } from 'node:path';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange } from './http/scrub.js';
import { clientVersion, SONGS_FILTER, YTMUSIC_COUNTRY, YtMusicClient } from './ytmusic/client.js';

/** InnerTube names no version of its API; the recording names the client it was read as. */
export const YTMUSIC_VERSION = 'InnerTube WEB_REMIX, unversioned';

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
  'out (tracking values, menus, continuations, the session context).';

/** Keys InnerTube answers carry that Auralis never reads, tracking and session values among them. */
const DROPPED_KEYS = new Set([
  'responseContext',
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

function cut(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cut);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
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
  const json = { ...(cut(body.json) as Record<string, unknown>), trimmed: YTMUSIC_TRIMMED };
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
  const client = new YtMusicClient({
    baseUrl,
    fetch: rec.fetch,
    now,
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
  return { written };
}
