/**
 * Serves recordings back through `fetch`. A request matches a recording on method, path and
 * query (order-free); anything unrecorded throws, naming it. Clients under test use the base
 * URL `http://upstream.invalid` and the token `<token>`, so a replayed request equals its
 * recording. A file call's body comes from its committed stand-in, answering a `Range` request
 * as the upstream would: 206 with the slice, 416 past the end, 200 with no range.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FetchLike } from './fetch.js';
import { type BytesBody, type RecordedBody, type Recording } from './recording.js';

export interface ReplayOptions {
  /** Reads a stand-in file named by a recording's `{bytes}` body. */
  readBytes?: (recording: Recording, name: string) => Uint8Array;
}

/** Reads stand-ins from where they are committed: `<adapters>/<upstream>/recordings/<name>`. */
export function standInsBeside(adaptersDir: string): ReplayOptions['readBytes'] {
  return (recording, name) =>
    readFileSync(join(adaptersDir, recording.upstream, 'recordings', name));
}

function key(method: string, path: string, query: Record<string, string>): string {
  const sorted = Object.entries(query).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${method.toUpperCase()} ${path} ${JSON.stringify(sorted)}`;
}

function bodyText(body: Exclude<RecordedBody, BytesBody>): string | null {
  if (body === null) return null;
  return 'text' in body ? body.text : JSON.stringify(body.json);
}

/** The first and last byte a single `bytes=` range asks for in a file of `size`, or 'unsatisfiable'. */
function byteRange(header: string, size: number): [number, number] | 'unsatisfiable' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    throw new Error(`replay serves one bytes range, not ${header}`);
  }
  const [first, last] =
    m[1] === ''
      ? [Math.max(0, size - Number(m[2])), size - 1]
      : [Number(m[1]), m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)];
  return first >= size || first > last ? 'unsatisfiable' : [first, last];
}

function serveBytes(bytes: Uint8Array, recorded: Record<string, string>, range: string | null) {
  const headers = new Headers(recorded);
  headers.delete('content-range');
  headers.delete('content-length');
  const size = bytes.byteLength;
  if (range === null) {
    headers.set('content-length', String(size));
    return new Response(bytes, { status: 200, headers });
  }
  const span = byteRange(range, size);
  if (span === 'unsatisfiable') {
    headers.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const [first, last] = span;
  headers.set('content-range', `bytes ${first}-${last}/${size}`);
  headers.set('content-length', String(last - first + 1));
  return new Response(bytes.slice(first, last + 1), { status: 206, headers });
}

export function replayFetch(recordings: Recording[], options: ReplayOptions = {}): FetchLike {
  const byKey = new Map(
    recordings.map((r) => [key(r.request.method, r.request.path, r.request.query), r]),
  );
  return async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    const recording = byKey.get(key(method, url.pathname, Object.fromEntries(url.searchParams)));
    if (!recording) {
      throw new Error(`no recording for ${method.toUpperCase()} ${url.pathname}${url.search}`);
    }
    const { status, headers, body } = recording.response;
    if (body !== null && 'bytes' in body) {
      if (!options.readBytes) {
        throw new Error(`${recording.call}: no reader for its stand-in ${body.bytes}`);
      }
      const range = new Headers(init?.headers).get('range');
      return serveBytes(options.readBytes(recording, body.bytes), headers, range);
    }
    const noBody = status === 204 || status === 304;
    return new Response(noBody ? null : bodyText(body), { status, headers });
  };
}
