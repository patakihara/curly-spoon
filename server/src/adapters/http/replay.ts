/**
 * Serves recordings back through `fetch`. A request matches a recording on method, path and
 * query (order-free); anything unrecorded throws, naming it. Clients under test use the base
 * URL `http://upstream.invalid` and the token `<token>`, so a replayed request equals its
 * recording.
 */
import { type FetchLike } from './fetch.js';
import { type RecordedBody, type Recording } from './recording.js';

function key(method: string, path: string, query: Record<string, string>): string {
  const sorted = Object.entries(query).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${method.toUpperCase()} ${path} ${JSON.stringify(sorted)}`;
}

function bodyText(body: RecordedBody): string | null {
  if (body === null) return null;
  return 'text' in body ? body.text : JSON.stringify(body.json);
}

export function replayFetch(recordings: Recording[]): FetchLike {
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
    const noBody = status === 204 || status === 304;
    return new Response(noBody ? null : bodyText(body), { status, headers });
  };
}
