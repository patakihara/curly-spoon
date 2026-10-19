/**
 * The transport every adapter client is built on. Clients never touch the network or the
 * environment themselves: they take a `FetchLike`, so tests inject a fake, record mode injects
 * the recorder's wrapper, and replay injects `replayFetch`. Every answer is parsed with zod.
 */
import { type ZodType } from 'zod';

/** The subset of the `fetch` contract adapters depend on. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AdapterErrorKind = 'status' | 'network' | 'timeout' | 'parse';

/** A failed upstream call. `call` is `METHOD /path`, never the full URL or its headers. */
export class AdapterError extends Error {
  override readonly name = 'AdapterError';
  constructor(
    readonly kind: AdapterErrorKind,
    readonly call: string,
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(`${call}: ${message}`, options);
  }
}

export interface RequestInitJson {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  /** Serialized as JSON with `content-type: application/json`. */
  json?: unknown;
  /** Serialized as `application/x-www-form-urlencoded`, as OAuth token endpoints take it. */
  form?: Record<string, string>;
  timeoutMs?: number;
  /** Reads at most this many bytes of the body, cancelling the rest; a longer body fails. */
  maxBytes?: number;
}

/**
 * The body as text, reading no more than `maxBytes` of it when given; null past the cap. Each read
 * races `signal`, so a body that stalls fails once the call's time is up, and is cancelled, even
 * when the stream itself ignores the abort.
 */
async function readText(
  response: Response,
  maxBytes: number | undefined,
  signal: AbortSignal,
): Promise<string | null> {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(signal.reason);
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
  aborted.catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      total += value.byteLength;
      if (maxBytes !== undefined && total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch (cause) {
    await reader.cancel(cause).catch(() => undefined);
    throw cause;
  }
  return Buffer.concat(chunks).toString('utf8');
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Fetches `url`, fails on a non-2xx status, and parses the body with `schema`. A JSON
 * content type is parsed as JSON; any other non-empty body reaches the schema as text. */
export async function requestJson<T>(
  fetch: FetchLike,
  url: string,
  init: RequestInitJson,
  schema: ZodType<T>,
): Promise<T> {
  const method = init.method ?? 'GET';
  const call = `${method} ${new URL(url).pathname}`;
  const headers: Record<string, string> = { accept: 'application/json', ...init.headers };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.json);
  } else if (init.form !== undefined) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.form).toString();
  }

  // One limit covers the whole call, the body included: a feed that sends its headers and then
  // stalls would otherwise hold this run, and every later one, forever.
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let text: string | null;
  try {
    response = await fetch(url, { method, headers, body, signal: controller.signal });
    text = await readText(response, init.maxBytes, controller.signal);
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new AdapterError('timeout', call, `no answer in ${timeoutMs} ms`, undefined, { cause });
    }
    throw new AdapterError('network', call, 'the request failed', undefined, { cause });
  } finally {
    clearTimeout(timer);
  }

  // The status first: a refusal is a refusal whatever its body's size.
  if (!response.ok) {
    throw new AdapterError('status', call, `answered ${response.status}`, response.status);
  }
  if (text === null) {
    throw new AdapterError('parse', call, `the body is larger than ${init.maxBytes} bytes`);
  }

  let value: unknown = text.length > 0 ? text : undefined;
  if (text.length > 0 && /json/i.test(response.headers.get('content-type') ?? '')) {
    try {
      value = JSON.parse(text);
    } catch (cause) {
      throw new AdapterError('parse', call, 'the body is not JSON', response.status, { cause });
    }
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AdapterError('parse', call, parsed.error.message, response.status, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
