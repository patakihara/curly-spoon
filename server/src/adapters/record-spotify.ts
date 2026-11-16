/**
 * Record mode's `spotify` part: M3.spotify's signed-out Spotify reads, from this machine, with no
 * account. Every call waits its turn in the client's queue, at least 1 s after the last ended.
 *
 * - One editorial playlist of more than 100 tracks: its embed page (`embed-playlist`), its order
 *   in two pages of 100 (`order-page-1`, `order-page-2`), and each track's metadata
 *   (`track-001` onwards, one file per track, so the leak scan reads each).
 * - A playlist id that does not exist (`embed-not-found`: a 200 whose page says 404), and a track
 *   id with no metadata (`metadata-404`), each written only when Spotify says it has none.
 * - The Web API's answer to the anonymous token, asked once (`webapi-429`), written only when it
 *   is the 429 it gave live: the shape of a busy Spotify.
 *
 * Scrubbed before writing: the embed page is cut to its playlist's name and cover, how many rows
 * its `trackList` held, and its session, with the token replaced by `<anonymous-token>` and its
 * expiry kept. `spclient` answers are cut to the fields parsed; correlation and decision ids go
 * with the rest. No request's `Authorization` is written. The token is a recorder secret too.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MATCH_ROWS } from '../music/import/match.js';
import {
  pacedSearch,
  type ResolveDeps,
  resolveEntries,
  type Unmatched,
} from '../music/import/resolve.js';
import { openDatabase } from '../store/connection.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type Recording, recordingSchema } from './http/recording.js';
import { replayFetch } from './http/replay.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange } from './http/scrub.js';
import {
  SPOTIFY_EMBED_URL,
  SPOTIFY_SPCLIENT_URL,
  SpotifyClient,
  SpotifyError,
} from './spotify/client.js';
import { embedPageSchema } from './spotify/schemas.js';
import { ADDRESS_ECHO_URL, echoedAddress, YTMUSIC_VERSION } from './record-ytmusic.js';
import { YtMusicClient } from './ytmusic/client.js';
import { searchRowSchema } from './ytmusic/schemas.js';

/** Spotify names no version of these routes; the recording names the routes it read. */
export const SPOTIFY_VERSION = 'signed-out embed page, spclient playlist/v2 and metadata/4';
export const SPOTIFY_WEB_API_URL = 'https://api.spotify.com';

/** What a recording holds in place of the anonymous session token. */
export const ANONYMOUS_TOKEN = '<anonymous-token>';

/** All Out 80s: editorial, 150 tracks, read live on 13 Nov. */
export const RECORDED_PLAYLIST = '37i9dQZF1DX4UtSsGT1Sbe';
/** A well-formed playlist id that names nothing. */
export const MISSING_PLAYLIST = '0000000000000000000000';
/** A well-formed track id that names nothing. */
export const MISSING_TRACK = '0000000000000000000000';

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v !== null && typeof v === 'object' ? (v as Json) : {});

/** The request with its `Authorization` gone. */
function unsigned(raw: RawExchange): RawExchange {
  const headers = Object.fromEntries(
    Object.entries(raw.request.headers).filter(([k]) => k.toLowerCase() !== 'authorization'),
  );
  return { ...raw, request: { ...raw.request, headers } };
}

function withBody(raw: RawExchange, body: RawExchange['response']['body']): RawExchange {
  return { ...raw, response: { ...raw.response, body } };
}

/** The embed page cut to the name, the cover, the trackList's length and the session. */
export function cutEmbed(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  const html = body !== null && 'text' in body ? body.text : '';
  const found = NEXT_DATA.exec(html);
  if (raw.response.status !== 200 || !found?.[1]) return withBody(unsigned(raw), null);
  const data = obj(JSON.parse(found[1]));
  const state = obj(obj(obj(data.props).pageProps).state);
  const entity = obj(obj(state.data).entity);
  const session = obj(obj(state.settings).session);
  const pageProps = obj(obj(data.props).pageProps);
  if ('status' in pageProps) {
    const missing = { props: { pageProps: { status: pageProps.status, title: pageProps.title } } };
    const text =
      '<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">' +
      `${JSON.stringify(missing)}</script></body></html>`;
    return withBody(unsigned(raw), { text });
  }
  const cut = {
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              name: entity.name,
              coverArt: entity.coverArt,
              trackListLength: Array.isArray(entity.trackList) ? entity.trackList.length : 0,
            },
          },
          settings: {
            session: {
              accessToken: ANONYMOUS_TOKEN,
              accessTokenExpirationTimestampMs: session.accessTokenExpirationTimestampMs,
              isAnonymous: session.isAnonymous,
            },
          },
        },
      },
    },
  };
  const text =
    '<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">' +
    `${JSON.stringify(cut)}</script></body></html>`;
  return withBody(unsigned(raw), { text });
}

/** A `spclient` answer cut to the fields parsed: a page of the order, or one track. */
export function cutSpclient(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body)) return unsigned(raw);
  const a = obj(body.json);
  if ('contents' in a) {
    const contents = obj(a.contents);
    const items = Array.isArray(contents.items) ? contents.items : [];
    const json: Json = {
      length: a.length,
      attributes: { name: obj(a.attributes).name },
      ownerUsername: a.ownerUsername,
      ...('isUserCreated' in a ? { isUserCreated: a.isUserCreated } : {}),
      contents: {
        ...('pos' in contents ? { pos: contents.pos } : {}),
        ...('truncated' in contents ? { truncated: contents.truncated } : {}),
        items: items.map((i) => ({ uri: obj(i).uri })),
      },
    };
    return withBody(unsigned(raw), { json });
  }
  if ('duration' in a) {
    const json: Json = {
      name: a.name,
      artist: (Array.isArray(a.artist) ? a.artist : []).map((x) => ({ name: obj(x).name })),
      album: { name: obj(a.album).name },
      duration: a.duration,
      external_id: a.external_id ?? [],
    };
    return withBody(unsigned(raw), { json });
  }
  return unsigned(raw);
}

export interface SpotifyRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  playlist?: string;
}

function scanned(recording: Recording) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${recording.call}: ${found}; not written`);
  }
}

export async function recordSpotify(input: SpotifyRecordInput): Promise<{ written: string[] }> {
  const { out } = input;
  const dir = join(input.root, 'spotify', 'recordings');
  const written: string[] = [];
  const secrets: string[] = [];
  /** The embed page's token, learned as it passes, so the recorders scrub it and the Web API is asked with it. */
  const learning: FetchLike = async (url, init) => {
    const response = await input.fetch(url, init);
    if (url.includes('/embed/playlist/') && response.ok) {
      const parsed = embedPageSchema.safeParse(await response.clone().text());
      if (parsed.success && parsed.data && !secrets.includes(parsed.data.token))
        secrets.push(parsed.data.token);
    }
    return response;
  };
  const embedRec = createRecorder({
    fetch: learning,
    dir,
    upstream: 'spotify',
    upstreamVersion: SPOTIFY_VERSION,
    secrets,
    baseUrl: SPOTIFY_EMBED_URL,
    prepare: cutEmbed,
  });
  const spRec = createRecorder({
    fetch: embedRec.fetch,
    dir,
    upstream: 'spotify',
    upstreamVersion: SPOTIFY_VERSION,
    secrets,
    baseUrl: SPOTIFY_SPCLIENT_URL,
    prepare: cutSpclient,
  });
  const client = new SpotifyClient({
    embedUrl: SPOTIFY_EMBED_URL,
    spclientUrl: SPOTIFY_SPCLIENT_URL,
    fetch: spRec.fetch,
    log: out,
  });
  const keep = (call: string) => written.push(join(dir, `${call}.json`));
  const scanOnly = { verify: (_: unknown, r: Recording) => scanned(r) };
  const id = input.playlist ?? RECORDED_PLAYLIST;

  const header = await embedRec.capture(
    'embed-playlist',
    () => client.playlistHeader(id),
    scanOnly,
  );
  keep('embed-playlist');
  out(`embed-playlist: ${header.name}`);

  const uris: string[] = [];
  let length = 0;
  for (let n = 1; ; n += 1) {
    const call = `order-page-${n}`;
    const page = await spRec.capture(call, () => client.orderPage(id, uris.length), scanOnly);
    keep(call);
    length = page.length;
    uris.push(...page.contents.items.map((i) => i.uri));
    out(`${call}: from ${page.contents.pos}, ${page.contents.items.length} of ${length}`);
    if (page.contents.items.length === 0 || uris.length >= length) break;
  }

  let unavailable = 0;
  for (const [n, uri] of uris.entries()) {
    const track = /^spotify:track:(\w{22})$/.exec(uri)?.[1];
    if (!track) {
      out(`position ${n}: ${uri.split(':')[1] ?? 'unknown'}, not a track`);
      continue;
    }
    const call = `track-${String(n + 1).padStart(3, '0')}`;
    const read = await spRec.capture(call, () => client.track(track), scanOnly);
    keep(call);
    if (read === null) unavailable += 1;
  }
  out(`tracks: ${uris.length} entries, ${unavailable} without metadata`);

  const missingTrack = await spRec
    .capture('metadata-404', () => client.track(MISSING_TRACK), {
      verify: (found, r) => {
        if (found !== null || r.response.status !== 404) throw new Error('not a 404');
        scanned(r);
      },
    })
    .then(() => 'written')
    .catch((e: unknown) => `not written: ${e instanceof Error ? e.message : 'failed'}`);
  if (missingTrack === 'written') keep('metadata-404');
  out(`metadata-404: ${missingTrack}`);

  const missing = await embedRec
    .capture(
      'embed-not-found',
      () =>
        client.playlistHeader(MISSING_PLAYLIST).then(
          () => null,
          (e: unknown) => e,
        ),
      {
        verify: (error, r) => {
          if (!(error instanceof SpotifyError) || error.code !== 'playlist_not_found') {
            throw new Error(`answered ${r.response.status}, not a 404`);
          }
          scanned(r);
        },
      },
    )
    .then(() => 'written')
    .catch((e: unknown) => `not written: ${e instanceof Error ? e.message : 'failed'}`);
  if (missing === 'written') keep('embed-not-found');
  out(`embed-not-found: ${missing}`);

  // The Web API, asked once with the anonymous token: live it answered 429 QUOTA_EXCEEDED.
  const token = secrets[secrets.length - 1] ?? '';
  const webRec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'spotify',
    upstreamVersion: SPOTIFY_VERSION,
    secrets,
    baseUrl: SPOTIFY_WEB_API_URL,
    prepare: unsigned,
  });
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const busy = await webRec
    .capture(
      'webapi-429',
      () =>
        webRec.fetch(`${SPOTIFY_WEB_API_URL}/v1/playlists/${id}/tracks?limit=1`, {
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        }),
      {
        verify: (_, r) => {
          if (r.response.status !== 429) throw new Error(`answered ${r.response.status}`);
          scanned(r);
        },
      },
    )
    .then(() => 'written')
    .catch((e: unknown) => `not written: ${e instanceof Error ? e.message : 'failed'}`);
  if (busy === 'written') keep('webapi-429');
  out(`webapi-429: ${busy}`);
  return { written };
}

/** Where the YouTube Music answers to the recorded playlist's tracks are kept. */
export const SPOTIFY_YTMUSIC_DIR = join('spotify', 'recordings', 'ytmusic');

/** The call a search for the track at `position` (from 0) is recorded as; its ISRC search ends `-isrc`. */
export const ytMusicCall = (position: number, isrc: boolean) =>
  `ytmusic-${String(position + 1).padStart(3, '0')}${isrc ? '-isrc' : ''}`;

/** The recorded token's expiry: a replayed reader starts 10 min before it, so it never renews. */
function recordedExpiry(recordings: readonly Recording[]): number {
  const embed = recordings.find((r) => r.call === 'embed-playlist');
  const found = /accessTokenExpirationTimestampMs\\?":(\d+)/.exec(JSON.stringify(embed?.response));
  if (!found?.[1]) throw new Error('the recorded embed page names no expiry');
  return Number(found[1]);
}

/** A Spotify reader over the recorded answers, on a clock of its own that never waits. */
export function replayedSpotify(recordings: Recording[]): SpotifyClient {
  let at = recordedExpiry(recordings) - 10 * 60_000;
  return new SpotifyClient({
    embedUrl: 'http://upstream.invalid',
    spclientUrl: 'http://upstream.invalid',
    fetch: replayFetch(recordings),
    clock: {
      now: () => at,
      sleep: async (ms) => {
        at += ms;
      },
    },
  });
}

/** YouTube Music's song search over recorded answers, each found by the query its request sent. */
export function replayedYtMusic(recordings: Recording[]): Pick<YtMusicClient, 'search'> {
  return {
    search: (query) => {
      const answer = recordings.find(
        (r) => (r.request.body as { json?: { query?: string } } | null)?.json?.query === query,
      );
      if (answer === undefined) throw new Error(`no recorded search for ${query}`);
      return new YtMusicClient({
        baseUrl: 'http://upstream.invalid',
        fetch: replayFetch([answer]),
        now: () => 0,
      }).search(query);
    },
  };
}

/** A search answer cut to its shelf's first `MATCH_ROWS` rows, each to the fields parsed, its art to the largest. */
export function cutSearch(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body)) return raw;
  const tabs = obj(obj(obj(body.json).contents).tabbedSearchResultsRenderer).tabs;
  const sections = (Array.isArray(tabs) ? tabs : []).flatMap((tab) => {
    const list = obj(obj(obj(obj(tab).tabRenderer).content).sectionListRenderer).contents;
    return Array.isArray(list) ? list : [];
  });
  const rows = sections
    .flatMap((s) => {
      const shelf = obj(obj(s).musicShelfRenderer).contents;
      return Array.isArray(shelf) ? shelf : [];
    })
    .slice(0, MATCH_ROWS)
    .map((row) => {
      const parsed = searchRowSchema.safeParse(row);
      if (!parsed.success) return { unread: true };
      const item = parsed.data.musicResponsiveListItemRenderer;
      const art = item.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails.reduce((a, b) =>
        b.width > a.width ? b : a,
      );
      return {
        musicResponsiveListItemRenderer: {
          ...item,
          flexColumns: item.flexColumns.slice(0, 2),
          thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [art] } } },
        },
      };
    });
  const json = {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: rows.length === 0 ? [] : [{ musicShelfRenderer: { contents: rows } }],
                },
              },
            },
          },
        ],
      },
    },
    trimmed: SPOTIFY_YTMUSIC_TRIMMED,
  };
  return { ...raw, response: { ...raw.response, body: { json } } };
}

export const SPOTIFY_YTMUSIC_TRIMMED =
  'Trimmed by the recorder: the shelf of songs cut to the rows an import weighs, each row to the ' +
  'fields Auralis parses and its largest art; everything else, the visitor id among it, taken out.';

export interface SpotifyYtMusicRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  baseUrl: string;
  now: () => number;
  /** The echo's page, as the server's own address reads it. */
  serverEcho: () => Promise<string>;
}

/**
 * Record mode's `spotify-ytmusic` part: YouTube Music's answers to the recorded playlist's tracks,
 * searched as an import searches them (name, then ISRC when the name finds nothing), 2 s apart.
 * Spotify is not asked: its tracks come from the `spotify` part's recordings. Prints how many
 * matched and why the rest did not.
 */
export async function recordSpotifyYtMusic(
  input: SpotifyYtMusicRecordInput,
): Promise<{ written: string[]; matched: number; unmatched: Unmatched[] }> {
  const { out } = input;
  const address = echoedAddress(await (await input.fetch(ADDRESS_ECHO_URL)).text());
  if (address !== echoedAddress(await input.serverEcho())) {
    throw new Error("this machine does not leave by the server's public address: nothing recorded");
  }
  out("this machine leaves by the server's public address");

  const spotifyDir = join(input.root, 'spotify', 'recordings');
  const recorded = readdirSync(spotifyDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => recordingSchema.parse(JSON.parse(readFileSync(join(spotifyDir, f), 'utf8'))));
  const spotify = replayedSpotify(recorded);
  const playlist = await spotify.playlist(RECORDED_PLAYLIST);

  const dir = join(input.root, SPOTIFY_YTMUSIC_DIR);
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'ytmusic',
    upstreamVersion: YTMUSIC_VERSION,
    secrets: [address],
    baseUrl: input.baseUrl,
    prepare: cutSearch,
  });
  const ytmusic = new YtMusicClient({
    baseUrl: input.baseUrl,
    fetch: rec.fetch,
    now: input.now,
    onBad: (what) => out(`InnerTube's answer: ${what}`),
  });
  const written: string[] = [];
  let position = 0;
  const search = pacedSearch(
    async (query) => {
      const call = ytMusicCall(position, /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(query));
      let kept: Recording | undefined;
      await rec.capture(call, () => ytmusic.search(query), {
        verify: (_, recording) => {
          scanned(recording);
          kept = recording;
        },
      });
      written.push(join(dir, `${call}.json`));
      // The rows as the recording keeps them, so a replay resolves exactly as this run did.
      return replayedYtMusic(kept ? [kept] : []).search(query);
    },
    { now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
  );
  const db = openDatabase(':memory:');
  const deps: ResolveDeps = {
    db,
    clock: { now: Date.now },
    track: (id) => spotify.track(id),
    search,
  };
  let matched = 0;
  const unmatched: Unmatched[] = [];
  const steps = resolveEntries(deps, playlist.entries);
  for (;;) {
    const next = await steps.next();
    if (next.done) break;
    if (next.value.unmatched === null) matched += 1;
    else {
      unmatched.push(next.value.unmatched);
      const u = next.value.unmatched;
      out(`position ${u.position}: ${u.reason}, ${u.title ?? u.uri}, ${u.near?.failed ?? 'no row'}`);
    }
    position += 1;
  }
  db.close();
  out(`spotify-ytmusic: ${matched} matched, ${unmatched.length} unmatched of ${playlist.entries.length}`);
  return { written, matched, unmatched };
}
