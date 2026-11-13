import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { torrentContents } from '../requests/download/torrentFiles.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange, scrub } from './http/scrub.js';
import type { FetchLike } from './http/fetch.js';
import { cutIndexers, cutTorrent, recordAlbumsQbit } from './record-albums.js';
import { MADE_UP_HASH, RECORD_TAG } from './record-qbit.js';
import { indexerStandIns } from './record-books.js';

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const BASE = 'http://192.168.100.34:9696';

const listing = (json: unknown): RawExchange => ({
  upstream: 'prowlarr',
  upstreamVersion: '10.0.0.22097',
  call: 'indexers',
  request: {
    method: 'GET',
    url: `${BASE}/api/v1/indexer`,
    headers: { 'x-api-key': KEY },
    body: null,
  },
  response: { status: 200, headers: { 'content-type': 'application/json' }, body: { json } },
});

describe('[M3.albums] what the indexer listing’s recording keeps', () => {
  it('[M3.albums] each indexer’s id, stand-in name, switch, protocol and categories, and no setting', () => {
    const raw = listing([
      {
        id: 7,
        name: 'A Private Site',
        enable: true,
        protocol: 'torrent',
        fields: [
          { name: 'cookie', value: 'session=abcdef0123456789ABCDEF' },
          { name: 'baseUrl', value: 'https://private-site.example.org/' },
        ],
        indexerUrls: ['https://private-site.example.org/'],
        capabilities: {
          limitsMax: 100,
          categories: [
            { id: 3000, name: 'Audio', subCategories: [{ id: 3040, name: 'Audio/Lossless' }] },
          ],
        },
      },
      { id: 11, name: 'AudioBook Bay', enable: true, protocol: 'torrent', capabilities: {} },
    ]);
    const recorded = scrub(cutIndexers(indexerStandIns())(raw), { secrets: [KEY], baseUrl: BASE });
    expect(scanRecording(recorded)).toEqual([]);
    expect(recorded.response.headers).toEqual({ 'content-type': 'application/json' });
    expect(recorded.response.body).toEqual({
      json: [
        {
          id: 7,
          name: 'indexer-a',
          enable: true,
          protocol: 'torrent',
          capabilities: {
            categories: [
              { id: 3000, name: 'Audio', subCategories: [{ id: 3040, name: 'Audio/Lossless' }] },
            ],
          },
        },
        {
          id: 11,
          name: 'AudioBook Bay',
          enable: true,
          protocol: 'torrent',
          capabilities: { categories: [] },
        },
      ],
    });
  });
});

describe('[M3.albums] what a recorded torrent keeps', () => {
  const encode = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));
  const info = 'd6:lengthi5e4:name6:a.flac12:piece lengthi1e6:pieces0:e';
  const real = encode(
    `d8:announce32:udp://tracker.invalid:1/announce7:comment9:a comment4:info${info}` +
      '8:url-listl33:https://seed.example.org/items/a/12:not-a-web-seee',
  );

  it('[M3.albums] its info verbatim, so its hash holds, and its web seeds at no real host', () => {
    const cut = cutTorrent(real)!;
    const text = Buffer.from(cut).toString('latin1');
    expect(text).toContain(`4:info${info}`);
    expect(text).not.toMatch(/tracker|comment|example/);
    const contents = torrentContents(cut)!;
    expect(contents.hash).toBe(torrentContents(real)!.hash);
    expect(contents.webSeeds).toEqual(['http://upstream.invalid/items/a/']);
  });

  it('[M3.albums] refuses bytes that are not a torrent', () => {
    expect(cutTorrent(encode('<html></html>'))).toBeNull();
  });
});

describe('[M3.albums] the qBittorrent recording run', () => {
  const QBIT = 'http://192.168.100.34:8080';

  /** A run against a stand-in qBittorrent, noting every call; `there` lists the hashes it holds. */
  const run = async (there: string[] = [], tags: string[] = [], addMakesTag = false) => {
    const root = mkdtempSync(join(tmpdir(), 'record-albums-qbit-'));
    const sent: { path: string; body: string }[] = [];
    const tagList = [...tags];
    const fetch: FetchLike = async (url, init) => {
      const { pathname, searchParams } = new URL(url);
      const path = pathname.replace('/api/v2/', '');
      const body = typeof init?.body === 'string' ? init.body : '';
      sent.push({ path, body });
      if (path === 'app/version') return new Response('v5.3.0');
      if (path === 'torrents/info') {
        const asked = searchParams.get('hashes')?.split('|') ?? [];
        return Response.json(
          asked.filter((one) => there.includes(one)).map((hash) => ({ hash, tags: '' })),
        );
      }
      if (path === 'torrents/tags') return Response.json(tagList);
      if (path === 'torrents/filePrio') return new Response('Not Found', { status: 404 });
      if (path === 'torrents/addTags' && addMakesTag && !tagList.includes(RECORD_TAG)) {
        tagList.push(RECORD_TAG);
      }
      return new Response('');
    };
    const result = await recordAlbumsQbit({
      fetch,
      out: () => undefined,
      root,
      url: QBIT,
      key: KEY,
    }).catch((error: unknown) => error);
    rmSync(root, { recursive: true });
    return { sent, result };
  };

  it('[M3.albums] adds no torrent, deletes none, and every write names the made-up hash alone', async () => {
    const { sent, result } = await run();
    expect(result).not.toBeInstanceOf(Error);
    const paths = sent.map((one) => one.path);
    expect(paths).toEqual(
      expect.arrayContaining(['torrents/start', 'torrents/filePrio', 'torrents/addTags']),
    );
    expect(paths).not.toContain('torrents/add');
    expect(paths).not.toContain('torrents/delete');
    for (const one of sent.filter((call) => call.body !== '')) {
      const form = new URLSearchParams(one.body);
      expect(form.get('hashes') ?? form.get('hash') ?? form.get('tags')).toMatch(
        new RegExp(`^(${MADE_UP_HASH}|${RECORD_TAG})$`),
      );
    }
  });

  it('[M3.albums] stops before any write when the made-up hash is there', async () => {
    const { sent, result } = await run([MADE_UP_HASH]);
    expect(result).toBeInstanceOf(Error);
    expect(sent.filter((one) => one.body !== '')).toEqual([]);
  });

  it('[M3.albums] takes away only a tag it made, never one that was there', async () => {
    const made = await run([], [], true);
    const removed = made.sent.filter((one) => one.path === 'torrents/deleteTags');
    expect(removed.map((one) => new URLSearchParams(one.body).get('tags'))).toEqual([RECORD_TAG]);
    const kept = await run([], [RECORD_TAG], true);
    expect(kept.sent.map((one) => one.path)).not.toContain('torrents/deleteTags');
  });
});
