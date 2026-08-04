import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HttpClient, type FetchLike } from './http.js';
import { JellyfinError } from './errors.js';

/** Type the mock the same way `HttpClient` sees it, so `.mock.calls[n]` is a real tuple. */
function fakeFetch(impl: FetchLike): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(impl) as unknown as FetchLike & ReturnType<typeof vi.fn>;
}

const schema = z.object({ hello: z.string() });
const device = { client: 'Auralis', device: 'Test', deviceId: 'device-1', version: '0.1.0' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpClient.requestJson', () => {
  it('parses a happy-path JSON response against the schema', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    const result = await client.requestJson('/System/Ping', { schema });

    expect(result).toEqual({ hello: 'world' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://jellyfin.local/System/Ping');
    expect(init?.method).toBe('GET');
  });

  it('sends the MediaBrowser-scheme Authorization header, without a Token field, when unauthenticated', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    await client.requestJson('/Users/AuthenticateByName', { method: 'POST', schema });

    const [, init] = fetchFn.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      'MediaBrowser Client="Auralis", Device="Test", DeviceId="device-1", Version="0.1.0"',
    );
  });

  it('appends a Token field to the Authorization header once a token is configured', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const client = new HttpClient({
      baseUrl: 'http://jellyfin.local',
      fetch: fetchFn,
      device,
      token: 'tok123',
    });

    await client.requestJson('/Items', { schema });

    const [, init] = fetchFn.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toContain('Token="tok123"');
  });

  it('requests PascalCase JSON explicitly (no camelCase profile) so field names are deterministic', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    await client.requestJson('/Items', { schema });

    const [, init] = fetchFn.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
  });

  it('builds query strings, skipping undefined values', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    await client.requestJson('/Items', {
      schema,
      query: { limit: 10, startIndex: undefined, sortBy: 'SortName' },
    });

    const [url] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://jellyfin.local/Items?limit=10&sortBy=SortName');
  });

  it('maps 401 to an auth JellyfinError without retrying', async () => {
    const fetchFn = fakeFetch(async () => new Response('nope', { status: 401 }));
    const client = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    const err = await client.requestJson('/Items', { schema }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(JellyfinError);
    expect((err as JellyfinError).code).toBe('auth');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('maps 403 to a forbidden JellyfinError, distinct from auth', async () => {
    const fetchFn = fakeFetch(async () => new Response('forbidden', { status: 403 }));
    const client = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    const err = await client.requestJson('/Items', { schema }).catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('forbidden');
  });

  it('maps 404 to a not_found JellyfinError', async () => {
    const fetchFn = fakeFetch(async () => new Response('nope', { status: 404 }));
    const client = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    const err = await client.requestJson('/Items/xyz', { schema }).catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('not_found');
  });

  it('retries a 5xx GET and succeeds on a later attempt', async () => {
    let calls = 0;
    const fetchFn = fakeFetch(async () => {
      calls += 1;
      if (calls < 2) return new Response('boom', { status: 503 });
      return jsonResponse({ hello: 'world' });
    });
    const client = new HttpClient({
      baseUrl: 'http://jellyfin.local',
      fetch: fetchFn,
      device,
      retryBaseDelayMs: 1,
    });

    const result = await client.requestJson('/Items', { schema });

    expect(result).toEqual({ hello: 'world' });
    expect(calls).toBe(2);
  });

  it('does not retry a POST by default', async () => {
    let calls = 0;
    const fetchFn = fakeFetch(async () => {
      calls += 1;
      return new Response('boom', { status: 503 });
    });
    const client = new HttpClient({
      baseUrl: 'http://jellyfin.local',
      fetch: fetchFn,
      device,
      retryBaseDelayMs: 1,
    });

    await client
      .requestJson('/Users/AuthenticateByName', { method: 'POST', schema })
      .catch(() => undefined);

    expect(calls).toBe(1);
  });

  it('raises a schema_mismatch JellyfinError when the body does not match the schema', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ unexpected: true }));
    const client = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    const err = await client.requestJson('/Items', { schema }).catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('schema_mismatch');
  });

  it('raises a network JellyfinError when fetch itself rejects', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('ENOTFOUND');
    };
    const client = new HttpClient({
      baseUrl: 'http://nowhere.invalid',
      fetch: fetchFn,
      device,
      maxRetries: 0,
    });

    const err = await client.requestJson('/System/Ping', { schema }).catch((e: unknown) => e);

    expect((err as JellyfinError).code).toBe('network');
  });

  it('a new client returned by withToken carries the token without mutating the original', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ hello: 'world' }));
    const original = new HttpClient({ baseUrl: 'http://jellyfin.local', fetch: fetchFn, device });

    const authed = original.withToken('tok-new');
    expect(original.token).toBeUndefined();
    expect(authed.token).toBe('tok-new');

    await authed.requestJson('/Items', { schema });
    const [, init] = fetchFn.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toContain('Token="tok-new"');
  });
});
