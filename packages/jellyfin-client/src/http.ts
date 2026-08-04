/**
 * The transport core every `JellyfinClient` method is built on: one place
 * that owns timeouts, retries, the `MediaBrowser` auth header and turning a
 * raw `Response` into either parsed JSON or a `JellyfinError`. Structurally a
 * copy of `@auralis/abs-client`'s `HttpClient`, with two Jellyfin-specific
 * differences: the `Authorization` header uses the `MediaBrowser` scheme (see
 * `auth.ts`) instead of `Bearer`, and every request explicitly asks for plain
 * `application/json` (no `profile=` parameter) so the server's PascalCase
 * field names are deterministic rather than dependent on content negotiation
 * defaults — verified against `Jellyfin.Extensions/Json/JsonDefaults.cs`,
 * whose unprefixed `Options` (what a bare `application/json` Accept resolves
 * to) leaves `PropertyNamingPolicy` unset, i.e. PascalCase; camelCase is only
 * produced for the explicit `application/json; profile="CamelCase"` media
 * type.
 */

import type { ZodType } from 'zod';
import { buildAuthorizationHeader, type JellyfinDeviceInfo } from './auth.js';
import { JellyfinError } from './errors.js';

/** The subset of the `fetch` contract we depend on — easy to fake in tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientConfig {
  baseUrl: string;
  fetch: FetchLike;
  device: JellyfinDeviceInfo;
  token?: string;
  /** Abort a single attempt after this many ms. Default 15000. */
  timeoutMs?: number;
  /** Extra attempts after the first, GET-only. Default 2 (3 attempts total). */
  maxRetries?: number;
  /** Backoff base in ms, doubled per attempt. Default 200. Tune down in tests. */
  retryBaseDelayMs?: number;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  schema: ZodType<T>;
  /**
   * Only GETs are safe to retry blindly (Jellyfin has no idempotency keys on
   * these endpoints). Defaults to true for GET and false otherwise; pass
   * `false` explicitly to force a GET to never retry (e.g. it has side
   * effects, like starting a playback session).
   */
  retryable?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Thin wrapper: owns base URL, device identity, token, timeout and retry
 * policy for one Jellyfin server connection. */
export class HttpClient {
  readonly baseUrl: string;
  readonly token: string | undefined;
  private readonly device: JellyfinDeviceInfo;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.device = config.device;
    this.fetchFn = config.fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  }

  withToken(token: string | undefined): HttpClient {
    return new HttpClient({
      baseUrl: this.baseUrl,
      fetch: this.fetchFn,
      device: this.device,
      token,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
    });
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: buildAuthorizationHeader(this.device, this.token) };
  }

  /** Fetch once with a timeout, translating transport failures into `JellyfinError`. */
  private async attemptRaw(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } catch (cause) {
      if (controller.signal.aborted) throw JellyfinError.timeout(this.timeoutMs);
      throw JellyfinError.network(cause);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Retry loop: only for retryable requests, on network/timeout/5xx. */
  private async withRetries(url: string, init: RequestInit, retryable: boolean): Promise<Response> {
    let attempt = 0;
    for (;;) {
      try {
        const response = await this.attemptRaw(url, init);
        if (retryable && response.status >= 500 && attempt < this.maxRetries) {
          attempt += 1;
          await sleep(this.retryBaseDelayMs * 2 ** (attempt - 1));
          continue;
        }
        return response;
      } catch (err) {
        const retryableFailure =
          err instanceof JellyfinError && (err.code === 'network' || err.code === 'timeout');
        if (retryable && retryableFailure && attempt < this.maxRetries) {
          attempt += 1;
          await sleep(this.retryBaseDelayMs * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }
    }
  }

  /** Map a non-2xx status to the matching `JellyfinError`, reading the body for context. */
  private async errorFor(response: Response, path: string): Promise<JellyfinError> {
    const status = response.status;
    if (status === 401) return JellyfinError.auth(status);
    if (status === 403) return JellyfinError.forbidden(status);
    if (status === 404) return JellyfinError.notFound(path);
    if (status >= 500) {
      const text = await response.text().catch(() => undefined);
      return JellyfinError.upstream(status, text);
    }
    const text = await response.text().catch(() => undefined);
    return JellyfinError.badRequest(status, text);
  }

  /** JSON request: fetch, retry per policy, validate the body against `schema`. */
  async requestJson<T>(path: string, options: RequestOptions<T>): Promise<T> {
    const method = options.method ?? 'GET';
    const retryable = options.retryable ?? method === 'GET';
    const url = buildUrl(this.baseUrl, path, options.query);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.authHeaders(),
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await this.withRetries(url, { method, headers, body }, retryable);

    if (!response.ok) {
      throw await this.errorFor(response, path);
    }

    // A 204 or an empty body is valid for some endpoints; parse against the
    // schema anyway so callers stating `z.void()`-like expectations still get
    // checked.
    const text = await response.text();
    const json: unknown = text.length > 0 ? safeJsonParse(text, path) : undefined;

    const parsed = options.schema.safeParse(json);
    if (!parsed.success) {
      throw JellyfinError.schemaMismatch(`${method} ${path}`, parsed.error);
    }
    return parsed.data;
  }
}

function safeJsonParse(text: string, context: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw JellyfinError.schemaMismatch(context, cause);
  }
}
