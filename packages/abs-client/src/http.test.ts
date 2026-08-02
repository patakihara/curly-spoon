import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HttpClient, type FetchLike } from './http.js';
import { AbsError } from './errors.js';

/** Type the mock the same way `HttpClient` sees it, so `.mock.calls[n]` is a real tuple. */
function fakeFetch(impl: FetchLike): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(impl) as unknown as FetchLike & ReturnType<typeof vi.fn>;
}

const schema = z.object({ hello: z.string() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpClient.requestJson', () => {
  it('parses a happy-path JSON response against the schema', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    const result = await client.requestJson('/api/ping', { schema });

    expect(result).toEqual({ hello: 'world' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://abs.local/api/ping');
    expect(init?.method).toBe('GET');
  });

  it('sends the bearer token when configured', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn, token: 'tok123' });

    await client.requestJson('/api/ping', { schema });

    const [, init] = fetchFn.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok123');
  });

  it('builds query strings, skipping undefined values', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    await client.requestJson('/api/libraries/1/items', {
      schema,
      query: { limit: 10, page: undefined, sort: 'title' },
    });

    const [url] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://abs.local/api/libraries/1/items?limit=10&sort=title');
  });

  it('maps 401 to an auth AbsError without retrying', async () => {
    const fetchFn = fakeFetch(async () => new Response('nope', { status: 401 }));
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    const err = await client.requestJson('/api/me', { schema }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AbsError);
    expect((err as AbsError).code).toBe('auth');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('maps 403 to an auth AbsError', async () => {
    const fetchFn = fakeFetch(async () => new Response('forbidden', { status: 403 }));
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    const err = await client.requestJson('/api/me', { schema }).catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('auth');
  });

  it('maps 404 to a not_found AbsError', async () => {
    const fetchFn = fakeFetch(async () => new Response('missing', { status: 404 }));
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    const err = await client
      .requestJson('/api/items/ghost', { schema })
      .catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('not_found');
  });

  it('maps a malformed payload to a schema_mismatch AbsError', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ wrong: 'shape' }));
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    const err = await client.requestJson('/api/ping', { schema }).catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('schema_mismatch');
  });

  it('maps invalid JSON body to a schema_mismatch AbsError', async () => {
    const fetchFn = fakeFetch(
      async () => new Response('not json{{{', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    const err = await client.requestJson('/api/ping', { schema }).catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('schema_mismatch');
  });

  it('maps a fetch rejection to a network AbsError', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = new HttpClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 0,
    });

    const err = await client.requestJson('/api/ping', { schema }).catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('network');
  });

  it('retries a retryable GET on 5xx with exponential backoff, then succeeds', async () => {
    let calls = 0;
    const fetchFn = fakeFetch(async () => {
      calls += 1;
      if (calls < 3) return new Response('bad gateway', { status: 502 });
      return jsonResponse({ hello: 'world' });
    });
    const client = new HttpClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });

    const result = await client.requestJson('/api/ping', { schema });
    expect(result).toEqual({ hello: 'world' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('gives up after exhausting retries and surfaces the upstream_error', async () => {
    const fetchFn = fakeFetch(async () => new Response('down', { status: 503 }));
    const client = new HttpClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });

    const err = await client.requestJson('/api/ping', { schema }).catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('upstream_error');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('never retries a non-GET request even on 5xx', async () => {
    const fetchFn = fakeFetch(async () => new Response('down', { status: 503 }));
    const client = new HttpClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    });

    const err = await client
      .requestJson('/api/session/1/sync', { schema, method: 'POST', body: { currentTime: 1 } })
      .catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('upstream_error');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit retryable:false override on a GET', async () => {
    const fetchFn = fakeFetch(async () => new Response('down', { status: 503 }));
    const client = new HttpClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    });

    await client
      .requestJson('/api/items/1/play', { schema, method: 'POST', retryable: false })
      .catch(() => undefined);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('times out a hanging request and maps it to an AbsError', async () => {
    const fetchFn = fakeFetch(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const client = new HttpClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      timeoutMs: 5,
      maxRetries: 0,
    });

    const err = await client.requestJson('/api/slow', { schema }).catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('timeout');
  });
});

describe('HttpClient.withToken', () => {
  it('returns a new client and does not mutate the original', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const original = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn, token: 'a' });
    const rebound = original.withToken('b');

    expect(rebound).not.toBe(original);
    expect(original.token).toBe('a');
    expect(rebound.token).toBe('b');
  });
});

describe('HttpClient.requestRaw', () => {
  it('passes Range headers through and returns the raw Response on 206', async () => {
    const fetchFn = fakeFetch(
      async () =>
        new Response('bytes', {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-4/10', 'Accept-Ranges': 'bytes' },
        }),
    );
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    const response = await client.requestRaw('/api/items/1/file/2', {
      headers: { Range: 'bytes=0-4' },
    });

    expect(response.status).toBe(206);
    const [, init] = fetchFn.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Range).toBe('bytes=0-4');
  });

  it('maps a raw 401 to an auth AbsError', async () => {
    const fetchFn = fakeFetch(async () => new Response('no', { status: 401 }));
    const client = new HttpClient({ baseUrl: 'http://abs.local', fetch: fetchFn });

    const err = await client.requestRaw('/api/items/1/cover').catch((e: unknown) => e);
    expect((err as AbsError).code).toBe('auth');
  });

  it('does not retry raw requests by default', async () => {
    const fetchFn = fakeFetch(async () => new Response('down', { status: 503 }));
    const client = new HttpClient({
      baseUrl: 'http://abs.local',
      fetch: fetchFn,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    });

    await client.requestRaw('/api/items/1/cover').catch(() => undefined);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
