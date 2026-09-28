/**
 * Record mode. The recorder wraps a real `fetch`; a client built on the wrapper runs as usual.
 * Inside `capture(call, fn)` exactly one request must go through; it is scrubbed and written as
 * `<dir>/<call>.json`. Requests outside `capture` pass through unrecorded (the lookups that find
 * an item id to record).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type FetchLike } from './fetch.js';
import { type RecordedBody, type Recording, serializeRecording } from './recording.js';
import { type RawExchange, scrub } from './scrub.js';

export interface RecorderOptions {
  fetch: FetchLike;
  dir: string;
  upstream: string;
  upstreamVersion: string;
  /** Read at each capture, so a secret learned mid-run (a one-time code) can be added. */
  secrets: string[];
  baseUrl: string;
  /** Runs on each raw exchange before the scrubber: re-signing tokens, anonymizing accounts. */
  prepare?: (raw: RawExchange) => RawExchange;
}

export interface Recorder {
  fetch: FetchLike;
  /** Runs `fn`, requires exactly one request inside it, writes its recording, returns fn's result. */
  capture<T>(call: string, fn: () => Promise<T>): Promise<T>;
}

type Captured = Pick<RawExchange, 'request' | 'response'>;

function headerRecord(headers: ConstructorParameters<typeof Headers>[0]): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

function toBody(text: string, contentType: string | null): RecordedBody {
  if (text.length === 0) return null;
  if (/json/i.test(contentType ?? '')) {
    try {
      return { json: JSON.parse(text) as unknown };
    } catch {
      return { text };
    }
  }
  return { text };
}

export function createRecorder(opts: RecorderOptions): Recorder {
  let active: Captured[] | undefined;

  const fetch: FetchLike = async (url, init) => {
    const response = await opts.fetch(url, init);
    if (active) {
      const requestHeaders = headerRecord(init?.headers);
      const requestText = typeof init?.body === 'string' ? init.body : '';
      active.push({
        request: {
          method: init?.method ?? 'GET',
          url,
          headers: requestHeaders,
          body: toBody(requestText, requestHeaders['content-type'] ?? null),
        },
        response: {
          status: response.status,
          headers: headerRecord(response.headers),
          body: toBody(await response.clone().text(), response.headers.get('content-type')),
        },
      });
    }
    return response;
  };

  async function capture<T>(call: string, fn: () => Promise<T>): Promise<T> {
    if (active) throw new Error(`capture ${call}: another capture is already running`);
    const captured: Captured[] = [];
    active = captured;
    let result: T;
    try {
      result = await fn();
    } finally {
      active = undefined;
    }
    if (captured.length !== 1) {
      throw new Error(`capture ${call}: expected exactly one request, saw ${captured.length}`);
    }
    const [exchange] = captured as [Captured];
    const raw: RawExchange = {
      upstream: opts.upstream,
      upstreamVersion: opts.upstreamVersion,
      call,
      ...exchange,
    };
    const recording: Recording = scrub(opts.prepare ? opts.prepare(raw) : raw, {
      secrets: opts.secrets,
      baseUrl: opts.baseUrl,
    });
    await mkdir(opts.dir, { recursive: true });
    await writeFile(join(opts.dir, `${call}.json`), serializeRecording(recording));
    return result;
  }

  return { fetch, capture };
}
