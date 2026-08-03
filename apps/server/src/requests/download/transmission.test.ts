import { describe, expect, it } from 'vitest';
import type { DownloadState, Release, ResolvedProviderConfig } from '../types.js';
import { createTransmissionClient } from './transmission.js';

// --- fixtures & fakes -------------------------------------------------------------------

function makeRelease(overrides: Partial<Release> = {}): Release {
  return {
    guid: 'guid-1',
    indexerId: 'audiobookbay',
    sourceName: 'AudioBook Bay',
    title: 'Test Book',
    sizeBytes: 1000,
    seeders: 5,
    leechers: 1,
    publishedAt: null,
    downloadUrl: null,
    magnetUri: null,
    categories: [],
    format: 'm4b',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return {
    id: 'transmission',
    kind: 'download',
    enabled: true,
    baseUrl: 'http://transmission.test:9091',
    options: {},
    secret: null,
    ...overrides,
  };
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function queueFetch(responses: Response[]) {
  const calls: FetchCall[] = [];
  let index = 0;
  const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const response = responses[index];
    index += 1;
    if (!response) throw new Error(`fetch mock: no response queued for call #${index} (${url})`);
    return response;
  };
  return { fetch: fetchFn, calls };
}

function response409(sessionId: string): Response {
  return new Response('', { status: 409, headers: { 'X-Transmission-Session-Id': sessionId } });
}

function rpcSuccess(argumentsObj: unknown): Response {
  return new Response(JSON.stringify({ result: 'success', arguments: argumentsObj }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function rpcFailure(result: string): Response {
  return new Response(JSON.stringify({ result, arguments: {} }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function baseTorrentGetItem(overrides: Record<string, unknown> = {}) {
  return {
    hashString: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
    name: 'Test Book',
    percentDone: 0.5,
    status: 4,
    downloadDir: '/downloads/book',
    rateDownload: 2048,
    eta: 120,
    errorString: '',
    ...overrides,
  };
}

const MAGNET = 'magnet:?xt=urn:btih:AABBCCDDEEFF00112233445566778899AABBCCDD&dn=Test+Book';
const HANDLE = 'aabbccddeeff00112233445566778899aabbccdd';

// --- the 409 session handshake -----------------------------------------------------------

describe('createTransmissionClient session handshake', () => {
  it('performs the 409 handshake and returns only the successful result to the caller', async () => {
    const { fetch, calls } = queueFetch([response409('session-1'), rpcSuccess({ torrents: [] })]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    const result = await client.status(HANDLE);

    expect(result.state).toBe('missing');
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[0]?.init?.headers).get('X-Transmission-Session-Id')).toBeNull();
    expect(new Headers(calls[1]?.init?.headers).get('X-Transmission-Session-Id')).toBe('session-1');
  });

  it('caches the session id across calls, doing the 409 round-trip only once', async () => {
    const { fetch, calls } = queueFetch([
      response409('session-1'),
      rpcSuccess({ torrents: [] }),
      rpcSuccess({ torrents: [] }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    await client.status(HANDLE);
    await client.status(HANDLE);

    expect(calls).toHaveLength(3);
    expect(new Headers(calls[2]?.init?.headers).get('X-Transmission-Session-Id')).toBe('session-1');
  });

  it('re-handshakes exactly once when a later call 409s (the id rotated), and does not loop', async () => {
    const { fetch, calls } = queueFetch([
      response409('session-1'),
      rpcSuccess({ torrents: [] }),
      response409('session-2'),
      rpcSuccess({ torrents: [] }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    await client.status(HANDLE);
    const second = await client.status(HANDLE);

    expect(second.state).toBe('missing');
    expect(calls).toHaveLength(4);
    expect(new Headers(calls[3]?.init?.headers).get('X-Transmission-Session-Id')).toBe('session-2');
  });

  it('throws when a fresh handshake still 409s, without retrying a third time', async () => {
    const { fetch, calls } = queueFetch([response409('session-1'), response409('session-1')]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    await expect(client.status(HANDLE)).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });
});

// --- auth ---------------------------------------------------------------------------------

describe('createTransmissionClient auth', () => {
  it('sends HTTP Basic auth when a secret is configured', async () => {
    const { fetch, calls } = queueFetch([response409('session-1'), rpcSuccess({ torrents: [] })]);
    const client = createTransmissionClient({
      config: makeConfig({ secret: JSON.stringify({ username: 'ann', password: 'hunter2' }) }),
      fetch,
    });

    await client.status(HANDLE);

    const expected = `Basic ${Buffer.from('ann:hunter2', 'utf8').toString('base64')}`;
    expect(new Headers(calls[1]?.init?.headers).get('Authorization')).toBe(expected);
  });

  it('sends no Authorization header when no secret is configured', async () => {
    const { fetch, calls } = queueFetch([response409('session-1'), rpcSuccess({ torrents: [] })]);
    const client = createTransmissionClient({ config: makeConfig({ secret: null }), fetch });

    await client.status(HANDLE);

    expect(new Headers(calls[1]?.init?.headers).get('Authorization')).toBeNull();
  });
});

// --- add ------------------------------------------------------------------------------------

describe('createTransmissionClient add', () => {
  it('treats torrent-duplicate as success and returns its hash', async () => {
    const { fetch } = queueFetch([
      response409('session-1'),
      rpcSuccess({
        'torrent-duplicate': {
          id: 7,
          name: 'Test Book',
          hashString: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
        },
      }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    const handle = await client.add(makeRelease({ magnetUri: MAGNET }), {
      savePath: null,
      category: null,
    });

    expect(handle).toBe(HANDLE);
  });

  it('maps a non-success result to rejected, carrying the server message', async () => {
    const { fetch } = queueFetch([
      response409('session-1'),
      rpcFailure('invalid or corrupt torrent file'),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    await expect(
      client.add(makeRelease({ magnetUri: MAGNET }), { savePath: null, category: null }),
    ).rejects.toMatchObject({ kind: 'rejected', message: 'invalid or corrupt torrent file' });
  });

  it('sends download-dir and labels only when set', async () => {
    const { fetch, calls } = queueFetch([
      response409('session-1'),
      rpcSuccess({
        'torrent-added': { id: 1, hashString: 'AABBCCDDEEFF00112233445566778899AABBCCDD' },
      }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    await client.add(makeRelease({ magnetUri: MAGNET }), { savePath: null, category: null });

    const body = JSON.parse(calls[1]?.init?.body as string);
    expect(body.arguments['download-dir']).toBeUndefined();
    expect(body.arguments.labels).toBeUndefined();
  });

  it('includes download-dir and labels when set', async () => {
    const { fetch, calls } = queueFetch([
      response409('session-1'),
      rpcSuccess({
        'torrent-added': { id: 1, hashString: 'AABBCCDDEEFF00112233445566778899AABBCCDD' },
      }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    await client.add(makeRelease({ magnetUri: MAGNET }), {
      savePath: '/downloads/audiobooks',
      category: 'auralis',
    });

    const body = JSON.parse(calls[1]?.init?.body as string);
    expect(body.arguments['download-dir']).toBe('/downloads/audiobooks');
    expect(body.arguments.labels).toEqual(['auralis']);
  });
});

// --- status -----------------------------------------------------------------------------

describe('createTransmissionClient status', () => {
  const stateCases: Array<[number, DownloadState]> = [
    [0, 'paused'],
    [1, 'queued'],
    [2, 'queued'],
    [3, 'queued'],
    [4, 'downloading'],
    [5, 'queued'],
    [6, 'seeding'],
  ];

  it.each(stateCases)('maps Transmission status %i to "%s"', async (raw, expected) => {
    const { fetch } = queueFetch([
      response409('session-1'),
      rpcSuccess({ torrents: [baseTorrentGetItem({ status: raw, percentDone: 0.5 })] }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    const result = await client.status(HANDLE);

    expect(result.state).toBe(expected);
  });

  it('maps status 0 with percentDone 1 to completed, not paused', async () => {
    const { fetch } = queueFetch([
      response409('session-1'),
      rpcSuccess({ torrents: [baseTorrentGetItem({ status: 0, percentDone: 1 })] }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    const result = await client.status(HANDLE);

    expect(result.state).toBe('completed');
  });

  it('lets a non-empty errorString override the status to error', async () => {
    const { fetch } = queueFetch([
      response409('session-1'),
      rpcSuccess({
        torrents: [baseTorrentGetItem({ status: 4, errorString: 'tracker unreachable' })],
      }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    const result = await client.status(HANDLE);

    expect(result.state).toBe('error');
    expect(result.errorMessage).toBe('tracker unreachable');
  });

  it('maps eta -1 (unknown) to null', async () => {
    const { fetch } = queueFetch([
      response409('session-1'),
      rpcSuccess({ torrents: [baseTorrentGetItem({ eta: -1 })] }),
    ]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    const result = await client.status(HANDLE);

    expect(result.etaSeconds).toBeNull();
  });

  it('returns state "missing" for an empty torrents array rather than throwing', async () => {
    const { fetch } = queueFetch([response409('session-1'), rpcSuccess({ torrents: [] })]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    const result = await client.status('unknownhash');

    expect(result).toMatchObject({ state: 'missing', progress: 0, contentPath: null });
  });

  it('forwards the AbortSignal to fetch', async () => {
    const { fetch, calls } = queueFetch([response409('session-1'), rpcSuccess({ torrents: [] })]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });
    const controller = new AbortController();

    await client.status(HANDLE, controller.signal);

    expect(calls.every((c) => c.init?.signal === controller.signal)).toBe(true);
  });
});

// --- remove -----------------------------------------------------------------------------

describe('createTransmissionClient remove', () => {
  it('resolves for an unknown handle, since Transmission treats it as a no-op success', async () => {
    const { fetch, calls } = queueFetch([response409('session-1'), rpcSuccess({})]);
    const client = createTransmissionClient({ config: makeConfig(), fetch });

    await expect(client.remove('longgoneHash', true)).resolves.toBeUndefined();
    const body = JSON.parse(calls[1]?.init?.body as string);
    expect(body.arguments['delete-local-data']).toBe(true);
  });
});
