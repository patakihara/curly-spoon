import { describe, expect, it } from 'vitest';
import { scanRecording } from './http/scan.js';
import { type RawExchange, scrub } from './http/scrub.js';
import { anonymiseProwlarr, cutAuthor, cutProduct, trimDetail } from './record-books.js';

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const BASE = 'http://192.168.100.34:9696';
const TRACKERS =
  '&tr=udp%3A%2F%2Ftracker.example.org%3A1337%2Fannounce&tr=http://10.1.2.3/announce';
const HASH = '13e44b57a50830c7028d13e44b57a50830c7028d';

const exchange = (overrides: Partial<RawExchange>): RawExchange => ({
  upstream: 'prowlarr',
  upstreamVersion: '10.0.0.22097',
  call: 'a-call',
  request: {
    method: 'GET',
    url: `${BASE}/api/v1/search?query=a+book&categories=3030&type=search`,
    headers: { accept: 'application/json', 'x-api-key': KEY },
    body: null,
  },
  response: { status: 200, headers: { 'content-type': 'application/json' }, body: null },
  ...overrides,
});
const LINK = 'CfDJ8HzY0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV1wX2yZ3';

describe('[M3.books] what a Prowlarr recording keeps', () => {
  const rows = () => [
    {
      indexer: 'A Tracker Site',
      title: 'A Book [MP3] [128 Kbps]',
      guid: `magnet:?xt=urn:btih:${HASH}&dn=A+Book+128+Kbps${TRACKERS}`,
      infoUrl: 'https://aggregator.example.org/tracker-site/description.php?id=7',
      posterUrl: 'https://images.example.com/cover.jpg',
      magnetUrl: `${BASE}/5/download?apikey=${KEY}&link=${LINK}&file=A+Book+128+Kbps`,
      protocol: 'torrent',
    },
    {
      indexer: 'AudioBook Bay',
      title: 'Another Book',
      guid: 'https://book-site.example.net/abss/another-book/',
      infoUrl: 'https://book-site.example.net/abss/another-book/',
      downloadUrl: `${BASE}/11/download?apikey=${KEY}&link=${LINK}&file=Another`,
      protocol: 'torrent',
    },
  ];
  const recorded = (raw: RawExchange) =>
    scrub(anonymiseProwlarr()(raw), { secrets: [KEY], baseUrl: BASE });

  it('[M3.books] a search leaves no key, tracker, indexer name, host or opaque link', () => {
    const one = recorded(
      exchange({ response: { status: 200, headers: {}, body: { json: rows() } } }),
    );
    const text = JSON.stringify(one);
    expect(scanRecording(one)).toEqual([]);
    for (const gone of [KEY, LINK, 'tracker', 'Tracker', 'example', '192.168']) {
      expect(text).not.toContain(gone);
    }
    const [first, second] = (one.response.body as { json: Record<string, string>[] }).json;
    expect(first?.indexer).toBe('indexer-a');
    expect(first?.guid).toBe(`magnet:?xt=urn:btih:${HASH}`);
    expect(first?.infoUrl).toMatch(/^http:\/\/upstream\.invalid\/page-[0-9a-f]{12}$/);
    expect(first?.magnetUrl).toMatch(
      /^http:\/\/upstream\.invalid\/5\/download\?apikey=<token>&link=link-[0-9a-f]{12}$/,
    );
    expect(second?.indexer).toBe('AudioBook Bay');
    expect(second?.infoUrl).toBe('http://upstream.invalid/abss/another-book/');
  });

  it('[M3.books] a download names the same stand-in link its row does, and a bare magnet', () => {
    const prepare = anonymiseProwlarr();
    const options = { secrets: [KEY], baseUrl: BASE };
    const search = scrub(
      prepare(exchange({ response: { status: 200, headers: {}, body: { json: rows() } } })),
      options,
    );
    const download = scrub(
      prepare(
        exchange({
          request: {
            method: 'GET',
            url: `${BASE}/5/download?apikey=${KEY}&link=${LINK}&file=A+Book+128+Kbps`,
            headers: {},
            body: null,
          },
          response: {
            status: 301,
            headers: { location: `magnet:?xt=urn:btih:${HASH}&dn=A+Book+128+Kbps${TRACKERS}` },
            body: null,
          },
        }),
      ),
      options,
    );
    expect(scanRecording(download)).toEqual([]);
    expect(download.response.headers.location).toBe(`magnet:?xt=urn:btih:${HASH}`);
    expect(download.request.query.apikey).toBe('<token>');
    const row = (search.response.body as { json: Record<string, string>[] }).json[0];
    expect(row?.magnetUrl).toContain(`link=${download.request.query.link}`);
  });
});

describe('[M3.books] what a detail page recording keeps', () => {
  const PAGE = `<html><head><title>Site</title></head><body><div class="post">
<div class="postTitle"><h1>A Book - An Author</h1></div>
<div class="postContent"><div class="center">
<p class="center">Shared by:<a href="/member/users/index?username=someone">someone</a></p>
<p class="center"><a href="https://book-site.example.net/abss/a-book/"><img src="https://images.example.com/c.jpg" /></a></p>
</div>
<div class="desc" itemprop="">
<p style="left;">Written by <a href="/?s=a"><span class="author" itemtype="https://schema.org/Person">An Author</span></a> <br />Read by <a href="/?s=b"><span class="narrator" itemprop="author">A Reader</span></a> <br />Format: <span class="format">M4B</span> <br />Bitrate: <span class="bitrate">128 Kbps</span> </p>
<p>A long publisher's description of the book.</p>
</div>
<table border='1'>
<tr><td>Announce URL:</td><td>udp://tracker.example.org:6969/announce</td></tr>
<tr><td>Tracker:</td><td>udp://tracker.example.org:6969/announce</td></tr>
<tr><td>Combined File Size:</td><td><span>158.72</span> MBs</td></tr>
<tr><td>Info Hash:</td><td>${HASH}</td></tr>
<tr><td>Torrent Download</td><td><a href='/downld0?downfs=x'>Free</a></td></tr>
</table></div></div><div class="sidebar">https://elsewhere.example.com</div></body></html>`;

  it('[M3.books] holds the post only, with no tracker, uploader, description or address', () => {
    const cut = trimDetail(PAGE);
    expect(cut).toContain('class="narrator"');
    expect(cut).toContain(HASH);
    expect(cut).toContain('Combined File Size');
    for (const gone of ['racker', 'someone', 'publisher', 'example', 'schema.org', 'sidebar']) {
      expect(cut).not.toContain(gone);
    }
  });

  it('[M3.books] fails on a page it does not recognise, rather than keep all of it', () => {
    expect(() => trimDetail('<html>a challenge page</html>')).toThrow(/no post/);
  });
});

describe("[M3.books] what the catalogues' recordings keep", () => {
  const answering = (json: unknown) =>
    exchange({ response: { status: 200, headers: {}, body: { json } } });

  it('[M3.books] a product keeps what the client reads, and no other image', () => {
    const cut = cutProduct(
      answering({
        product: {
          asin: 'B000000001',
          title: 'A Book',
          sku: 'dropped',
          series: [{ title: 'A Series', sequence: '2', asin: 'dropped', url: '/dropped' }],
          product_images: { 500: 'https://m.media-amazon.com/a.jpg', 1024: 'dropped' },
          social_media_images: { facebook: 'dropped' },
        },
      }),
    );
    expect(cut.response.body).toEqual({
      json: {
        product: {
          asin: 'B000000001',
          title: 'A Book',
          series: [{ title: 'A Series', sequence: '2' }],
          product_images: { 500: 'https://m.media-amazon.com/a.jpg' },
        },
      },
    });
  });

  it('[M3.books] an author keeps its name and photo, and a search stays as it is', () => {
    const author = { asin: 'B000000002', name: 'A Writer', image: '', similar: [], genres: [] };
    expect(cutAuthor(answering(author)).response.body).toEqual({
      json: { asin: 'B000000002', name: 'A Writer', image: '' },
    });
    const rows = [{ asin: 'B000000002', name: 'A Writer' }];
    expect(cutAuthor(answering(rows)).response.body).toEqual({ json: rows });
  });
});
