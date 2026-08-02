import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client.js';
import { ApiError } from './errors.js';

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
}

describe('ApiClient', () => {
  it('builds the request against /api/v1 by default, with credentials included', async () => {
    const fetchFn = fakeFetch(
      () => new Response(JSON.stringify({ configured: false, baseUrl: null }), { status: 200 }),
    );
    const client = new ApiClient({ fetch: fetchFn });

    await client.getSetupState();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/setup');
    expect(init?.credentials).toBe('include');
  });

  it('parses a successful JSON response', async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(JSON.stringify({ configured: true, baseUrl: 'http://fake.abs.local' }), {
          status: 200,
        }),
    );
    const client = new ApiClient({ fetch: fetchFn });

    const result = await client.getSetupState();
    expect(result).toEqual({ configured: true, baseUrl: 'http://fake.abs.local' });
  });

  it('sends a JSON body and Content-Type for POST requests', async () => {
    const fetchFn = fakeFetch(
      () => new Response(JSON.stringify({ user: { id: 'u1', username: 'kara' } }), { status: 200 }),
    );
    const client = new ApiClient({ fetch: fetchFn });

    await client.login('kara', 'hunter2');

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/login');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ username: 'kara', password: 'hunter2' });
  });

  it('serialises query parameters, dropping undefined values', async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(JSON.stringify({ items: [], total: 0, limit: null, page: null }), {
          status: 200,
        }),
    );
    const client = new ApiClient({ fetch: fetchFn });

    await client.getLibraryItems('lib-books', { limit: 20 });

    const [url] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/libraries/lib-books/items?limit=20');
  });

  it('throws a typed ApiError with the BFF error code on a non-2xx response', async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'unauthenticated', message: 'Sign in required' } }),
          {
            status: 401,
          },
        ),
    );
    const client = new ApiClient({ fetch: fetchFn });

    await expect(client.me()).rejects.toMatchObject({
      code: 'unauthenticated',
      status: 401,
      message: 'Sign in required',
    });
  });

  it('throws a network-origin ApiError when fetch itself rejects', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = new ApiClient({ fetch: fetchFn });

    const error = await client.getSetupState().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
  });

  it('builds cover and audio track URLs without making a request', () => {
    const fetchFn = fakeFetch(() => new Response('', { status: 200 }));
    const client = new ApiClient({ fetch: fetchFn });

    expect(client.coverUrl('item-dune')).toBe('/api/v1/media/item-dune/cover');
    expect(client.coverUrl('item-dune', { width: 400 })).toBe(
      '/api/v1/media/item-dune/cover?width=400',
    );
    expect(client.audioTrackUrl('item-dune', 'file-dune-1')).toBe(
      '/api/v1/media/item-dune/track/file-dune-1',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('resolves to undefined for an empty successful body (e.g. logout)', async () => {
    const fetchFn = fakeFetch(() => new Response('', { status: 200 }));
    const client = new ApiClient({ fetch: fetchFn });
    await expect(client.logout()).resolves.toBeUndefined();
  });
});
