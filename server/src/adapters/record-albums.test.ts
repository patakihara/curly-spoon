import { describe, expect, it } from 'vitest';
import { torrentContents } from '../requests/download/torrentFiles.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange, scrub } from './http/scrub.js';
import { cutIndexers, cutTorrent } from './record-albums.js';
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
