import { describe, expect, it } from 'vitest';
import type { DownloadState, Release, ResolvedProviderConfig } from '../types.js';
import { type ProviderError } from '../types.js';
import { createQbittorrentClient } from './qbittorrent.js';
import { infoHashFromTorrentFile } from './torrentId.js';

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
    id: 'qbittorrent',
    kind: 'download',
    enabled: true,
    baseUrl: 'http://qbittorrent.test:8080',
    options: {},
    secret: JSON.stringify({ username: 'user', password: 'pass' }),
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

function loginOk(sid: string): Response {
  return new Response('Ok.', {
    status: 200,
    headers: { 'set-cookie': `SID=${sid}; path=/; HttpOnly` },
  });
}

function loginFail(): Response {
  return new Response('Fails.', { status: 200 });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function status403(): Response {
  return new Response('', { status: 403 });
}

function baseTorrentInfo(overrides: Record<string, unknown> = {}) {
  return {
    hash: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
    state: 'downloading',
    progress: 0.5,
    content_path: '/downloads/book/book.m4b',
    save_path: '/downloads/book',
    dlspeed: 1024,
    eta: 60,
    name: 'Test Book',
    ...overrides,
  };
}

const MAGNET = `magnet:?xt=urn:btih:AABBCCDDEEFF00112233445566778899AABBCCDD&dn=Test+Book`;
const MAGNET_HASH = 'aabbccddeeff00112233445566778899aabbccdd';

// Minimal handmade .torrent bytes: d4:infod4:name4:teste8:announce4:fakee
const TORRENT_BYTES = new Uint8Array(
  Buffer.from('d4:infod4:name4:teste8:announce4:fakee', 'ascii'),
);
const TORRENT_HASH = infoHashFromTorrentFile(TORRENT_BYTES) as string;

// --- session handling ---------------------------------------------------------------------

describe('createQbittorrentClient session handling', () => {
  it('logs in once and reuses the SID cookie across later calls', async () => {
    const { fetch, calls } = queueFetch([loginOk('sid-1'), jsonResponse([]), jsonResponse([])]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await client.status('somehash');
    await client.status('somehash');

    const loginCalls = calls.filter((c) => c.url.includes('/api/v2/auth/login'));
    expect(loginCalls).toHaveLength(1);
    expect(new Headers(calls[1]?.init?.headers).get('Cookie')).toBe('SID=sid-1');
    expect(new Headers(calls[2]?.init?.headers).get('Cookie')).toBe('SID=sid-1');
  });

  it('treats an HTTP-200 "Fails." login body as unauthorized, because qBittorrent never uses a 4xx for bad credentials', async () => {
    const { fetch } = queueFetch([loginFail()]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await expect(client.testConnection()).rejects.toMatchObject({
      kind: 'unauthorized',
    } satisfies Partial<ProviderError>);
  });

  it('re-logs in and retries exactly once when a call comes back 403 (expired session)', async () => {
    const { fetch, calls } = queueFetch([
      loginOk('sid-1'),
      status403(),
      loginOk('sid-2'),
      jsonResponse([]),
    ]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    const result = await client.status('somehash');

    expect(result.state).toBe('missing');
    expect(calls).toHaveLength(4);
    expect(new Headers(calls[3]?.init?.headers).get('Cookie')).toBe('SID=sid-2');
  });

  it('throws unauthorized on a second consecutive 403, and does not retry a third time', async () => {
    const { fetch, calls } = queueFetch([
      loginOk('sid-1'),
      status403(),
      loginOk('sid-2'),
      status403(),
    ]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await expect(client.status('somehash')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(calls).toHaveLength(4);
  });

  it('rejects with unauthorized before any fetch when the secret is missing or unparseable', async () => {
    const { fetch, calls } = queueFetch([]);
    const client = createQbittorrentClient({ config: makeConfig({ secret: null }), fetch });

    await expect(client.testConnection()).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(calls).toHaveLength(0);
  });
});

// --- add ------------------------------------------------------------------------------------

describe('createQbittorrentClient add', () => {
  it('adds by magnet, sending urls= and returning the lowercased hash', async () => {
    const { fetch, calls } = queueFetch([loginOk('sid-1'), textResponse('Ok.')]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    const handle = await client.add(
      makeRelease({ magnetUri: MAGNET }),
      { savePath: null, category: null },
      undefined,
    );

    expect(handle).toBe(MAGNET_HASH);
    const addCall = calls[1];
    const body = new URLSearchParams(addCall?.init?.body as string);
    expect(body.get('urls')).toBe(MAGNET);
  });

  it('omits savepath and category from the add request when both are null', async () => {
    const { fetch, calls } = queueFetch([loginOk('sid-1'), textResponse('Ok.')]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await client.add(
      makeRelease({ magnetUri: MAGNET }),
      { savePath: null, category: null },
      undefined,
    );

    const body = new URLSearchParams(calls[1]?.init?.body as string);
    expect(body.has('savepath')).toBe(false);
    expect(body.has('category')).toBe(false);
  });

  it('includes savepath and category on the add request when set', async () => {
    const { fetch, calls } = queueFetch([loginOk('sid-1'), textResponse('Ok.')]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await client.add(
      makeRelease({ magnetUri: MAGNET }),
      { savePath: '/downloads/audiobooks', category: 'auralis' },
      undefined,
    );

    const body = new URLSearchParams(calls[1]?.init?.body as string);
    expect(body.get('savepath')).toBe('/downloads/audiobooks');
    expect(body.get('category')).toBe('auralis');
  });

  it('adds by fetching the .torrent when there is no magnet, and returns the hash computed from the bytes', async () => {
    // Fetching the .torrent bytes happens before any qBittorrent auth is needed, so it is
    // the *first* call, ahead of the lazy login triggered by the authenticated add request.
    const { fetch, calls } = queueFetch([
      new Response(TORRENT_BYTES, { status: 200 }),
      loginOk('sid-1'),
      textResponse('Ok.'),
    ]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    const handle = await client.add(
      makeRelease({ magnetUri: null, downloadUrl: 'http://indexer.test/book.torrent' }),
      { savePath: null, category: null },
      undefined,
    );

    expect(handle).toBe(TORRENT_HASH);
    expect(calls[0]?.url).toBe('http://indexer.test/book.torrent');
    const addCall = calls[2];
    expect(addCall?.init?.body).toBeInstanceOf(FormData);
    const form = addCall?.init?.body as FormData;
    const uploaded = form.get('torrents');
    expect(uploaded).toBeInstanceOf(Blob);
    const uploadedBytes = new Uint8Array(await (uploaded as Blob).arrayBuffer());
    expect(Buffer.from(uploadedBytes).equals(Buffer.from(TORRENT_BYTES))).toBe(true);
    // fetch must set its own multipart boundary — a manual Content-Type would break it.
    expect(new Headers(addCall?.init?.headers).get('content-type')).toBeNull();
  });

  it('throws rejected without calling the client when the release has neither a magnet nor a download URL', async () => {
    const { fetch, calls } = queueFetch([]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await expect(
      client.add(makeRelease({ magnetUri: null, downloadUrl: null }), {
        savePath: null,
        category: null,
      }),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(calls).toHaveLength(0);
  });

  it('treats a 200 response body of "Fails." as rejected', async () => {
    const { fetch } = queueFetch([loginOk('sid-1'), textResponse('Fails.')]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await expect(
      client.add(makeRelease({ magnetUri: MAGNET }), { savePath: null, category: null }),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
});

// --- status -----------------------------------------------------------------------------

describe('createQbittorrentClient status', () => {
  const stateCases: Array<[string, DownloadState]> = [
    ['downloading', 'downloading'],
    ['metaDL', 'downloading'],
    ['forcedDL', 'downloading'],
    ['checkingDL', 'downloading'],
    ['allocating', 'downloading'],
    ['stalledDL', 'downloading'],
    ['queuedDL', 'queued'],
    ['queuedUP', 'queued'],
    ['checkingResumeData', 'queued'],
    ['moving', 'queued'],
    ['uploading', 'seeding'],
    ['forcedUP', 'seeding'],
    ['stalledUP', 'seeding'],
    ['checkingUP', 'seeding'],
    ['pausedDL', 'paused'],
    ['stoppedDL', 'paused'],
    ['pausedUP', 'completed'],
    ['stoppedUP', 'completed'],
    ['error', 'error'],
    ['missingFiles', 'error'],
    ['unknown', 'error'],
  ];

  it.each(stateCases)('maps qBittorrent state "%s" to "%s"', async (raw, expected) => {
    const { fetch } = queueFetch([
      loginOk('sid-1'),
      jsonResponse([baseTorrentInfo({ state: raw })]),
    ]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    const result = await client.status(MAGNET_HASH);

    expect(result.state).toBe(expected);
  });

  it('maps a state qBittorrent has never reported to error, naming the unknown state', async () => {
    const { fetch } = queueFetch([
      loginOk('sid-1'),
      jsonResponse([baseTorrentInfo({ state: 'someFutureState' })]),
    ]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    const result = await client.status(MAGNET_HASH);

    expect(result.state).toBe('error');
    expect(result.errorMessage).toContain('someFutureState');
  });

  it('returns state "missing" rather than throwing when the client has never heard of the handle', async () => {
    const { fetch } = queueFetch([loginOk('sid-1'), jsonResponse([])]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    const result = await client.status('unknownhash');

    expect(result).toMatchObject({
      state: 'missing',
      progress: 0,
      contentPath: null,
      downloadRateBytes: 0,
      etaSeconds: null,
      errorMessage: null,
    });
  });

  it('maps the 8640000 ETA sentinel to null, because that means "infinite" rather than a hundred days', async () => {
    const { fetch } = queueFetch([
      loginOk('sid-1'),
      jsonResponse([baseTorrentInfo({ eta: 8640000 })]),
    ]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    const result = await client.status(MAGNET_HASH);

    expect(result.etaSeconds).toBeNull();
  });

  it('clamps progress to the 0..1 range', async () => {
    const { fetch } = queueFetch([
      loginOk('sid-1'),
      jsonResponse([baseTorrentInfo({ progress: 1.4 })]),
    ]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    const result = await client.status(MAGNET_HASH);

    expect(result.progress).toBe(1);
  });

  it('forwards the AbortSignal to the underlying fetch', async () => {
    const { fetch, calls } = queueFetch([loginOk('sid-1'), jsonResponse([])]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });
    const controller = new AbortController();

    await client.status(MAGNET_HASH, controller.signal);

    expect(calls.some((c) => c.init?.signal === controller.signal)).toBe(true);
  });
});

// --- remove -----------------------------------------------------------------------------

describe('createQbittorrentClient remove', () => {
  it('sends deleteFiles=true when asked to delete data', async () => {
    const { fetch, calls } = queueFetch([loginOk('sid-1'), textResponse('')]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await client.remove(MAGNET_HASH, true);

    const body = new URLSearchParams(calls[1]?.init?.body as string);
    expect(body.get('deleteFiles')).toBe('true');
  });

  it('sends deleteFiles=false when asked to keep data', async () => {
    const { fetch, calls } = queueFetch([loginOk('sid-1'), textResponse('')]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await client.remove(MAGNET_HASH, false);

    const body = new URLSearchParams(calls[1]?.init?.body as string);
    expect(body.get('deleteFiles')).toBe('false');
  });

  it('resolves rather than throwing when the client no longer knows the handle', async () => {
    const { fetch } = queueFetch([loginOk('sid-1'), textResponse('', 404)]);
    const client = createQbittorrentClient({ config: makeConfig(), fetch });

    await expect(client.remove('longgoneHash', true)).resolves.toBeUndefined();
  });
});
