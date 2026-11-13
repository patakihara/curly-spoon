/**
 * Record mode's `albums-live` part: the answers a real album request got from qBittorrent, Prowlarr
 * and Jellyfin, taken from what a one-off server sent them, and the Cover Art Archive's release-group
 * front asked from here.
 *
 * During the live run the one-off server's upstream URLs point at a pass-through proxy beside it,
 * one port per upstream. The proxy writes each chosen exchange as one JSON line, with every key,
 * token and cookie already blanked: `{target, request: {method, url, headers, body}, response:
 * {status, headers, body}}`, each body `{text}` or `{base64}`. This part takes the lines named on the
 * command line (`call=<line>`, counted from 1), scrubs each as every recording is scrubbed and
 * writes it under its upstream. qBittorrent's rows and files are cut to the fields its other
 * recordings keep; the album is freely licensed (The Slip, CC BY-NC-SA), so its file names stay.
 * A torrent's bytes are kept as its `info` and web seeds only, beside the recording.
 *
 * The version each recording names is the one the newest committed recording of that upstream
 * names: the log carries none, and the run's upstreams were not updated during it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type RecordedBody, recordingSchema, serializeRecording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { PLACEHOLDER_ORIGIN, type RawExchange, scrub } from './http/scrub.js';
import { cutTorrent } from './record-albums.js';
import { anonymiseProwlarr } from './record-books.js';
import { COVERART_VERSION, oneArchiveNode } from './record-musicbrainz.js';
import { cutQbit } from './record-qbit.js';
import { isCoverHost } from './coverart/client.js';

export type LiveUpstream = 'qbittorrent' | 'prowlarr' | 'jellyfin';

/** The proxy's ports, one per upstream, as the live run started it. */
export const PROXY_PORTS: Readonly<Record<string, LiveUpstream>> = {
  '9001': 'qbittorrent',
  '9002': 'prowlarr',
  '9003': 'jellyfin',
};

/** The committed recordings, whose versions name each upstream's. */
const COMMITTED = fileURLToPath(new URL('.', import.meta.url));

/** The Slip's release group, whose front the archive is asked for. */
export const SLIP_GROUP = '5990b23f-6412-3eaf-989c-a4831f4f95f7';

function proxyBody(value: unknown): { text: string } | { base64: string } | null {
  if (value === null || typeof value !== 'object') return null;
  if ('text' in value && typeof value.text === 'string') return { text: value.text };
  if ('base64' in value && typeof value.base64 === 'string') return { base64: value.base64 };
  return null;
}

interface ProxyLine {
  target: string;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  response: { status: number; headers: Record<string, string>; body: unknown };
}

const asBody = (body: { text: string } | null, type: string | undefined): RecordedBody => {
  if (body === null) return null;
  if (/json/i.test(type ?? '')) {
    try {
      return { json: JSON.parse(body.text) as unknown };
    } catch {
      return { text: body.text };
    }
  }
  return { text: body.text };
};

/** The version the newest committed recording of this upstream names. */
export function committedVersion(dir: string): string {
  const newest = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, at: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0];
  if (newest === undefined) throw new Error(`no recording in ${dir} to take a version from`);
  return recordingSchema.parse(JSON.parse(readFileSync(join(dir, newest.name), 'utf8')))
    .upstreamVersion;
}

function scanned(call: string, recording: ReturnType<typeof scrub>) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${call}: ${found}; not written`);
  }
}

/** qBittorrent's answers cut as its other recordings are, file names kept. */
function cutAlbumQbit(raw: RawExchange): RawExchange {
  if (!raw.request.url.includes('torrents/files')) return cutQbit(raw);
  const { body } = raw.response;
  const cut = cutQbit(raw);
  if (body === null || !('json' in body) || !Array.isArray(body.json)) return cut;
  const names = (body.json as { name?: unknown }[]).map((file) => file.name);
  const json = (cut.response.body as { json: Record<string, unknown>[] }).json.map((file, i) => ({
    ...file,
    name: names[i],
  }));
  return { ...cut, response: { ...cut.response, body: { json } } };
}

const PREPARE: Record<LiveUpstream, (raw: RawExchange) => RawExchange> = {
  qbittorrent: cutAlbumQbit,
  prowlarr: anonymiseProwlarr(),
  jellyfin: (raw) => raw,
};

export interface AlbumsLiveInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  /** The proxy's log, read whole. */
  log: string;
  /** Each recording's name and the log line it is made from, counted from 1. */
  picks: { call: string; line: number }[];
  coverArtUrl: string;
}

export async function recordAlbumsLive(input: AlbumsLiveInput): Promise<{ written: string[] }> {
  const { out, root } = input;
  const lines = input.log.split('\n').filter((line) => line.trim() !== '');
  const written: string[] = [];
  for (const { call, line } of input.picks) {
    const text = lines[line - 1];
    if (text === undefined) throw new Error(`${call}: the log has no line ${line}`);
    const one = JSON.parse(text) as ProxyLine;
    const upstream = PROXY_PORTS[one.target];
    if (upstream === undefined) throw new Error(`${call}: port ${one.target} is no upstream`);
    const dir = join(root, upstream, 'recordings');
    await mkdir(dir, { recursive: true });
    const reqBody = proxyBody(one.request.body);
    const resBody = proxyBody(one.response.body);
    let response = resBody !== null && 'base64' in resBody ? null : resBody;
    let standIn: RecordedBody = null;
    if (resBody !== null && 'base64' in resBody) {
      const cut = cutTorrent(Buffer.from(resBody.base64, 'base64'));
      if (cut === null) throw new Error(`${call}: a body of bytes that is no torrent`);
      await writeFile(join(dir, `${call}.torrent`), cut);
      standIn = {
        bytes: `${call}.torrent`,
        synthesized:
          "the torrent's info dictionary verbatim, so its hash holds, and its url-list at the placeholder host; nothing else of it",
      };
      response = null;
    }
    const raw: RawExchange = {
      upstream,
      upstreamVersion: committedVersion(join(COMMITTED, upstream, 'recordings')),
      call,
      request: {
        method: one.request.method,
        url: `${PLACEHOLDER_ORIGIN}${one.request.url}`,
        headers: one.request.headers,
        body: asBody(
          reqBody !== null && 'text' in reqBody ? reqBody : null,
          one.request.headers['content-type'],
        ),
      },
      response: {
        status: one.response.status,
        headers: one.response.headers,
        body:
          standIn ??
          asBody(response as { text: string } | null, one.response.headers['content-type']),
      },
    };
    const recording = scrub(PREPARE[upstream](raw), { secrets: [], baseUrl: PLACEHOLDER_ORIGIN });
    scanned(call, recording);
    const path = join(dir, `${call}.json`);
    await writeFile(path, serializeRecording(recording));
    written.push(path);
    out(`${call}: ${upstream}, line ${line}`);
  }

  const coverDir = join(root, 'coverart', 'recordings');
  const covers = createRecorder({
    fetch: input.fetch,
    dir: coverDir,
    upstream: 'coverart',
    upstreamVersion: COVERART_VERSION,
    secrets: [],
    baseUrl: input.coverArtUrl,
    prepare: oneArchiveNode,
  });
  const at = new URL(
    `release-group/${SLIP_GROUP}/front-500`,
    `${input.coverArtUrl.replace(/\/$/, '')}/`,
  );
  await covers.capture(
    'rg-front-slip',
    async () => {
      const answer = await covers.fetch(at.toString(), { redirect: 'manual' });
      await answer.body?.cancel();
      return { status: answer.status, location: answer.headers.get('location') };
    },
    {
      verify: (found, recording) => {
        if (found.status < 300 || found.status >= 400 || found.location === null) {
          throw new Error(`rg-front-slip: answered ${found.status}, no redirect`);
        }
        if (!isCoverHost(new URL(found.location, at).hostname)) {
          throw new Error('rg-front-slip: off the archive');
        }
        scanned('rg-front-slip', recording);
      },
    },
  );
  written.push(join(coverDir, 'rg-front-slip.json'));
  out('rg-front-slip: a redirect');
  return { written };
}
