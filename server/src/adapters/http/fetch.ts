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
  method?: 'GET' | 'POST' | 'DELETE';
  headers?: Record<string, string>;
  /** Serialized as JSON with `content-type: application/json`. */
  json?: unknown;
  /** Serialized as `application/x-www-form-urlencoded`, as OAuth token endpoints take it. */
  form?: Record<string, string>;
  timeoutMs?: number;
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

  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal: controller.signal });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new AdapterError('timeout', call, `no answer in ${timeoutMs} ms`, undefined, { cause });
    }
    throw new AdapterError('network', call, 'the request failed', undefined, { cause });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new AdapterError('status', call, `answered ${response.status}`, response.status);
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
