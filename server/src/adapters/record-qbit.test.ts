import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRecording } from './http/scan.js';
import { type RawExchange, scrub } from './http/scrub.js';
import { cutQbit, MADE_UP_HASH, recordQbit } from './record-qbit.js';
import type { FetchLike } from './http/fetch.js';

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const BASE = 'http://192.168.100.34:8080';

const exchange = (path: string, json: unknown): RawExchange => ({
  upstream: 'qbittorrent',
  upstreamVersion: 'v5.3.0',
  call: 'a-call',
  request: {
    method: 'GET',
    url: `${BASE}/api/v2/${path}`,
    headers: { accept: 'application/json', authorization: `Bearer ${KEY}` },
    body: null,
  },
  response: { status: 200, headers: { 'content-type': 'application/json' }, body: { json } },
});

describe('[M3.books] what a qBittorrent recording keeps', () => {
  it('[M3.books] a row loses its trackers, paths and name, and passes the leak scan', () => {
    const row = {
      hash: 'abc',
      state: 'metaDL',
      progress: 0,
      name: 'A household download.mkv',
      tracker: 'http://tracker.example.org:6969/announce',
      magnet_uri: 'magnet:?xt=urn:btih:abc&tr=http://tracker.example.org/announce',
      content_path: '/data/Downloads/A household download.mkv',
      comment: 'made by someone',
    };
    const one = scrub(cutQbit(exchange('torrents/info?hashes=abc', [row])), {
      secrets: [KEY],
      baseUrl: BASE,
    });
    expect(scanRecording(one)).toEqual([]);
    expect(JSON.stringify(one)).not.toMatch(/tracker|household|someone/);
    expect(JSON.stringify(one)).not.toContain(KEY);
  });

  it('[M3.books] an add keeps its magnet down to the hash', () => {
    const magnet = `magnet:?xt=urn:btih:abc&tr=${encodeURIComponent('http://tracker.example.org/')}`;
    const text = new URLSearchParams({ urls: magnet, tags: 'a-tag' }).toString();
    const raw = exchange('torrents/add', null);
    const cut = cutQbit({ ...raw, request: { ...raw.request, body: { text } } });
    const form = new URLSearchParams((cut.request.body as { text: string }).text);
    expect(form.get('urls')).toBe('magnet:?xt=urn:btih:abc');
    expect(form.get('tags')).toBe('a-tag');
  });

  it('[M3.books] a file keeps its size, and a name that is not the real one', () => {
    const file = { index: 0, name: 'a-real-file.iso', size: 9, priority: 1, progress: 1, x: 'y' };
    const { body } = cutQbit(exchange('torrents/files?hash=abc', [file])).response;
    const [kept] = (body as { json: Record<string, unknown>[] }).json;
    expect(kept).toEqual({ ...file, x: undefined, name: 'installer/netinst.bin' });
  });
});

describe('[M3.books] a recording run', () => {
  it('[M3.books] a step that fails before its add takes its tag away, touches nothing else, and never lists all torrents', async () => {
    const asked: string[] = [];
    const fetch: FetchLike = async (url) => {
      const { pathname, search } = new URL(url);
      asked.push(`${pathname.replace('/api/v2/', '')}${search}`);
      if (pathname.endsWith('app/version')) {
        return asked.length === 1 ? new Response('v5.3.0') : new Response('', { status: 500 });
      }
      return new Response('[]', { headers: { 'content-type': 'application/json' } });
    };
    await expect(
      recordQbit({
        fetch,
        out: () => undefined,
        root: '/nonexistent',
        url: BASE,
        key: KEY,
        magnet: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow();
    expect(asked).not.toContainEqual('torrents/delete');
    expect(asked).not.toContainEqual('torrents/removeCategories');
    expect(asked).toContainEqual('torrents/deleteTags');
    for (const call of asked.filter((one) => one.startsWith('torrents/info'))) {
      expect(call).toMatch(/hashes=|tag=/);
    }
  });

  const hash = 'a'.repeat(40);
  const failedRun = async () => {
    const sent: { path: string; body: string }[] = [];
    let versions = 0;
    const fetch: FetchLike = async (url, init) => {
      const { pathname } = new URL(url);
      sent.push({ path: pathname, body: typeof init?.body === 'string' ? init.body : '' });
      if (pathname.endsWith('app/version')) {
        versions += 1;
        return versions === 1 ? new Response('v5.3.0') : new Response('', { status: 500 });
      }
      return new Response('[]', { headers: { 'content-type': 'application/json' } });
    };
    await recordQbit({
      fetch,
      out: () => undefined,
      root: '/nonexistent',
      url: BASE,
      key: KEY,
      magnet: `magnet:?xt=urn:btih:${hash}`,
      sleep: () => Promise.resolve(),
    }).catch(() => undefined);
    return sent;
  };

  it('[M3.books] a run that fails before its add does not delete that hash, which may be the household’s', async () => {
    const deleted = (await failedRun()).filter((one) => one.path.endsWith('torrents/delete'));
    for (const one of deleted) expect(one.body).not.toContain(hash);
  });

  /** A run against an upstream that adds and then never shows a torrent, so a look fails it. */
  const runUntilLookFails = async (answers: { category: number; add: number }) => {
    const root = mkdtempSync(join(tmpdir(), 'record-qbit-'));
    const sent: { path: string; body: string }[] = [];
    const fetch: FetchLike = async (url, init) => {
      const path = new URL(url).pathname.replace('/api/v2/', '');
      const body = typeof init?.body === 'string' ? init.body : '';
      sent.push({ path, body });
      const bearer = new Headers(init?.headers).get('authorization');
      if (bearer !== `Bearer ${KEY}`) return new Response('Forbidden', { status: 403 });
      if (path === 'app/version') return new Response('v5.3.0');
      if (path === 'torrents/createCategory') return new Response('', { status: answers.category });
      if (path === 'torrents/add') {
        return answers.add === 200
          ? Response.json({ failure_count: 0, pending_count: 0, success_count: 1 })
          : new Response('Conflict', { status: answers.add });
      }
      if (path === 'torrents/info') return Response.json([]);
      return new Response('');
    };
    await recordQbit({
      fetch,
      out: () => undefined,
      root,
      url: BASE,
      key: KEY,
      magnet: `magnet:?xt=urn:btih:${hash}`,
      sleep: () => Promise.resolve(),
      looks: 1,
    }).catch(() => undefined);
    rmSync(root, { recursive: true });
    return {
      deleted: sent
        .filter((one) => one.path === 'torrents/delete')
        .map((one) => new URLSearchParams(one.body).get('hashes')),
      categoriesRemoved: sent.filter((one) => one.path === 'torrents/removeCategories').length,
    };
  };

  it('[M3.books] a run deletes what it added, and removes the category it made', async () => {
    const { deleted, categoriesRemoved } = await runUntilLookFails({ category: 200, add: 200 });
    expect(deleted).toEqual([MADE_UP_HASH]);
    expect(categoriesRemoved).toBe(1);
  });

  it('[M3.books] a run leaves a category that was already there', async () => {
    const { deleted, categoriesRemoved } = await runUntilLookFails({ category: 409, add: 200 });
    expect(deleted).toEqual([MADE_UP_HASH]);
    expect(categoriesRemoved).toBe(0);
  });

  it('[M3.books] a run stops at a torrent already there, and deletes nothing', async () => {
    const { deleted } = await runUntilLookFails({ category: 200, add: 409 });
    expect(deleted).toEqual([]);
  });

  it('[M3.books] a run does not remove the category Auralis’s real downloads sit in', async () => {
    const removed = (await failedRun()).filter((one) =>
      one.path.endsWith('torrents/removeCategories'),
    );
    for (const one of removed) expect(one.body).not.toContain('auralis-books');
  });
});
