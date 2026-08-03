import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@auralis/abs-client';
import {
  ProviderError,
  type ProviderFactoryDeps,
  type Release,
  type ResolvedProviderConfig,
} from '../types.js';
import { createAudiobookBayIndexer, resolveAudiobookBayMagnet } from './audiobookbay.js';

function fakeFetch(impl: FetchLike): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(impl) as unknown as FetchLike & ReturnType<typeof vi.fn>;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
}

function config(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return {
    id: 'audiobookbay',
    kind: 'indexer',
    enabled: true,
    baseUrl: 'http://audiobookbay.test',
    options: {},
    secret: null,
    ...overrides,
  };
}

function makeProvider(fetchFn: FetchLike, overrides: Partial<ResolvedProviderConfig> = {}) {
  const deps: ProviderFactoryDeps = { config: config(overrides), fetch: fetchFn };
  return createAudiobookBayIndexer(deps);
}

async function expectKind(promise: Promise<unknown>, kind: string): Promise<void> {
  try {
    await promise;
    throw new Error('expected promise to reject');
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe(kind);
  }
}

/** A minimal but structurally realistic AudiobookBay listing page: repeated post blocks,
 * each with an anchor (title + detail link), a posted date, a file size and a format. */
const LISTING_PAGE = `
<html><body>
<div class="post">
  <div class="postTitle"><h2><a href="/audio-books/the-great-book/" title="The Great Book">The Great Book</a></h2></div>
  <div class="postContent">
    <p>Posted: January 1, 2026</p>
    <p>Format: M4B</p>
    <p>File Size: 1.2 GB</p>
  </div>
</div>
<div class="post">
  <div class="postTitle"><h2><a href="/audio-books/another-book/" title="Another Book">Another Book</a></h2></div>
  <div class="postContent">
    <p>Posted: February 2, 2026</p>
    <p>File Size: 700 MB</p>
  </div>
</div>
<div class="post">
  <div class="postTitle"><h2><a href="/audio-books/third-book/">Third Book Title Text</a></h2></div>
  <div class="postContent">
    <p>Posted: not-a-real-date</p>
  </div>
</div>
</body></html>
`;

// A breadcrumb between each post's title and its metadata. WordPress templates emit links
// like this on every post, and they point under `/audio-books/` just as post titles do —
// which is exactly what makes them dangerous to a position-based scraper.
const LISTING_PAGE_WITH_BREADCRUMBS = `
<html><body>
<div class="post">
  <div class="postTitle"><h2><a href="/audio-books/the-great-book/" title="The Great Book">The Great Book</a></h2></div>
  <p>Home &gt; <a href="/audio-books/">Audio Books</a> &gt; <a href="/audio-books/category/fiction/">Fiction</a></p>
  <div class="postContent">
    <p>Posted: January 1, 2026</p>
    <p>Format: M4B</p>
    <p>File Size: 1.2 GB</p>
  </div>
</div>
<div class="post">
  <div class="postTitle"><h2><a href="/audio-books/another-book/" title="Another Book">Another Book</a></h2></div>
  <p>Home &gt; <a href="/audio-books/">Audio Books</a> &gt; <a href="/audio-books/category/fiction/">Fiction</a></p>
  <div class="postContent">
    <p>Posted: February 2, 2026</p>
    <p>File Size: 700 MB</p>
  </div>
</div>
</body></html>
`;

describe('createAudiobookBayIndexer.search', () => {
  it('keeps each post’s own metadata when template links sit between title and body', async () => {
    // Regression: with anchor-delimited windows a breadcrumb ended the real post early, so
    // every post lost its size and date and every breadcrumb became a junk release holding
    // the stolen values. Because the breadcrumb is templated, that corrupted the entire
    // result set at once while still looking like a successful search.
    const fetchFn = fakeFetch(async () => htmlResponse(LISTING_PAGE_WITH_BREADCRUMBS));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'book' });

    expect(results.map((r) => r.title)).toEqual(['The Great Book', 'Another Book']);
    expect(results[0]?.sizeBytes).toBe(Math.round(1.2 * 1024 * 1024 * 1024));
    expect(results[0]?.publishedAt).toBe(Date.parse('January 1, 2026'));
    expect(results[0]?.format).toBe('m4b');
    expect(results[1]?.sizeBytes).toBe(700 * 1024 * 1024);
    expect(results[1]?.publishedAt).toBe(Date.parse('February 2, 2026'));
  });

  it('reports a missing file size as null rather than inheriting a neighbour’s', async () => {
    const page = `
<html><body>
<div class="post">
  <div class="postTitle"><h2><a href="/audio-books/sized/" title="Sized Book">Sized Book</a></h2></div>
  <div class="postContent"><p>File Size: 500 MB</p></div>
</div>
<div class="post">
  <div class="postTitle"><h2><a href="/audio-books/unsized/" title="Unsized Book">Unsized Book</a></h2></div>
  <div class="postContent"><p>Posted: March 3, 2026</p></div>
</div>
</body></html>`;
    const fetchFn = fakeFetch(async () => htmlResponse(page));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'book' });

    expect(results.find((r) => r.title === 'Unsized Book')?.sizeBytes).toBeNull();
  });

  it('does not emit a second entry for a post echoed in a related-posts list', async () => {
    const page = `
<html><body>
<div class="post">
  <div class="postTitle"><h2><a href="/audio-books/the-great-book/" title="The Great Book">The Great Book</a></h2></div>
  <div class="postContent"><p>File Size: 1.2 GB</p></div>
</div>
<div class="post related">
  <a href="/audio-books/the-great-book/" title="The Great Book">The Great Book</a>
</div>
</body></html>`;
    const fetchFn = fakeFetch(async () => htmlResponse(page));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'great' });

    expect(results).toHaveLength(1);
    expect(results[0]?.sizeBytes).toBe(Math.round(1.2 * 1024 * 1024 * 1024));
  });

  it('falls back to anchor windows when the page has no post containers', async () => {
    const page = `
<html><body>
<a href="/audio-books/plain-one/" title="Plain One">Plain One</a>
<p>File Size: 300 MB</p>
<a href="/audio-books/plain-two/" title="Plain Two">Plain Two</a>
<p>File Size: 400 MB</p>
</body></html>`;
    const fetchFn = fakeFetch(async () => htmlResponse(page));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'plain' });

    expect(results.map((r) => r.title)).toEqual(['Plain One', 'Plain Two']);
    expect(results[0]?.sizeBytes).toBe(300 * 1024 * 1024);
    expect(results[1]?.sizeBytes).toBe(400 * 1024 * 1024);
  });

  it('extracts title, absolute detail URL, size in bytes, format and posted date', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse(LISTING_PAGE));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'great book' });

    const first = results.find((r) => r.title === 'The Great Book');
    expect(first).toBeDefined();
    expect(first?.guid).toBe('http://audiobookbay.test/audio-books/the-great-book/');
    expect(first?.format).toBe('m4b');
    expect(first?.sizeBytes).toBe(Math.round(1.2 * 1024 * 1024 * 1024));
    expect(first?.publishedAt).toBe(Date.parse('January 1, 2026'));
    expect(first?.indexerId).toBe('audiobookbay');
    expect(first?.sourceName).toBe('AudiobookBay');
    expect(first?.seeders).toBe(0);
    expect(first?.leechers).toBe(0);
    expect(first?.downloadUrl).toBeNull();
    expect(first?.magnetUri).toBeNull();
  });

  it('converts 1.2 GB and 700 MB to bytes using 1024-based units', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse(LISTING_PAGE));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'book' });

    const second = results.find((r) => r.title === 'Another Book');
    expect(second?.sizeBytes).toBe(Math.round(700 * 1024 * 1024));
  });

  it('falls back to the anchor text as title, and to detectFormat when no Format: line is present', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse(LISTING_PAGE));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'book' });

    const second = results.find((r) => r.title === 'Another Book');
    expect(second?.format).toBeNull(); // "Another Book" has no format token anywhere

    const third = results.find((r) => r.title === 'Third Book Title Text');
    expect(third).toBeDefined();
    expect(third?.publishedAt).toBeNull(); // unparseable date
  });

  it('returns [] for a page with no posts, without throwing', async () => {
    const fetchFn = fakeFetch(async () =>
      htmlResponse('<html><body>No results found.</body></html>'),
    );
    const provider = makeProvider(fetchFn);

    await expect(provider.search({ term: 'nothing' })).resolves.toEqual([]);
  });

  it('returns [] for a page of unrelated markup, without throwing', async () => {
    const fetchFn = fakeFetch(async () =>
      htmlResponse(
        '<html><head><title>Some other site</title></head><body><nav>hi</nav></body></html>',
      ),
    );
    const provider = makeProvider(fetchFn);

    await expect(provider.search({ term: 'nothing' })).resolves.toEqual([]);
  });

  it('honours limit', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse(LISTING_PAGE));
    const provider = makeProvider(fetchFn);

    const results = await provider.search({ term: 'book', limit: 1 });

    expect(results).toHaveLength(1);
  });

  it('never issues more than one fetch for a search', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse(LISTING_PAGE));
    const provider = makeProvider(fetchFn);

    await provider.search({ term: 'book' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('combines term and author into the query, URL-encoded', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse('<html></html>'));
    const provider = makeProvider(fetchFn);

    await provider.search({ term: 'Dune', author: 'Frank Herbert' });

    const [url] = fetchFn.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('s')).toBe('Dune Frank Herbert');
  });

  it('uses the default base URL when none is configured', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse('<html></html>'));
    const provider = makeProvider(fetchFn, { baseUrl: null });

    await provider.search({ term: 'book' });

    const [url] = fetchFn.mock.calls[0]!;
    expect(url as string).toContain('audiobookbay.lu');
  });

  it('maps a rejected fetch to unreachable', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const provider = makeProvider(fetchFn);
    await expectKind(provider.search({ term: 'book' }), 'unreachable');
  });
});

describe('createAudiobookBayIndexer.testConnection', () => {
  it('resolves on HTTP 200', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse('<html></html>'));
    const provider = makeProvider(fetchFn);

    await expect(provider.testConnection()).resolves.toBeUndefined();
  });

  it('maps a 403 to rejected with a message mentioning Cloudflare', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse('blocked', 403));
    const provider = makeProvider(fetchFn);

    try {
      await provider.testConnection();
      throw new Error('expected testConnection to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).kind).toBe('rejected');
      expect((err as ProviderError).message.toLowerCase()).toContain('cloudflare');
    }
  });
});

describe('resolveAudiobookBayMagnet', () => {
  const HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

  it('builds a magnet URI with a lowercased hash and all four trackers', async () => {
    const fetchFn = fakeFetch(async () =>
      htmlResponse(
        `<html><body><p>Torrent Info Hash: <span>${HASH.toUpperCase()}</span></p></body></html>`,
      ),
    );

    const magnet = await resolveAudiobookBayMagnet(
      'http://audiobookbay.test/audio-books/the-great-book/',
      fetchFn,
    );

    expect(magnet).toContain(`xt=urn:btih:${HASH}`);
    expect(magnet).toContain(
      'tr=' + encodeURIComponent('udp://tracker.opentrackr.org:1337/announce'),
    );
    expect(magnet).toContain('tr=' + encodeURIComponent('udp://open.demonii.com:1337/announce'));
    expect(magnet).toContain('tr=' + encodeURIComponent('udp://open.stealth.si:80/announce'));
    expect(magnet).toContain(
      'tr=' + encodeURIComponent('udp://tracker.torrent.eu.org:451/announce'),
    );
  });

  it('tolerates an unwrapped hash with no markup around it', async () => {
    const fetchFn = fakeFetch(async () =>
      htmlResponse(`<html><body>Torrent Info Hash: ${HASH}</body></html>`),
    );

    const magnet = await resolveAudiobookBayMagnet(
      'http://audiobookbay.test/audio-books/x/',
      fetchFn,
    );

    expect(magnet).toContain(`xt=urn:btih:${HASH}`);
  });

  it('throws not_found when the page has no hash', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse('<html><body>nothing here</body></html>'));

    await expectKind(
      resolveAudiobookBayMagnet('http://audiobookbay.test/audio-books/x/', fetchFn),
      'not_found',
    );
  });
});

describe('createAudiobookBayIndexer.resolveDownload', () => {
  const HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

  function release(overrides: Partial<Release> = {}): Release {
    return {
      guid: 'http://audiobookbay.test/audio-books/the-great-book/',
      indexerId: 'audiobookbay',
      sourceName: 'AudiobookBay',
      title: 'The Great Book',
      sizeBytes: null,
      seeders: 0,
      leechers: 0,
      publishedAt: null,
      downloadUrl: null,
      magnetUri: null,
      categories: [],
      format: null,
      ...overrides,
    };
  }

  it('fills in the magnet from the detail page, preferring the release title for dn', async () => {
    const fetchFn = fakeFetch(async () =>
      htmlResponse(
        `<html><body><p>Torrent Info Hash: <span>${HASH.toUpperCase()}</span></p></body></html>`,
      ),
    );
    const provider = makeProvider(fetchFn);
    const input = release();

    const result = await provider.resolveDownload!(input);

    expect(result.magnetUri).toContain(`xt=urn:btih:${HASH}`);
    expect(result.magnetUri).toContain(`dn=${encodeURIComponent('The Great Book')}`);
  });

  it('returns the release untouched and issues no fetch when a magnet is already present', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse('<html></html>'));
    const provider = makeProvider(fetchFn);
    const input = release({ magnetUri: 'magnet:?xt=urn:btih:already' });

    const result = await provider.resolveDownload!(input);

    expect(result).toBe(input);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not mutate the input release object', async () => {
    const fetchFn = fakeFetch(async () =>
      htmlResponse(`<html><body>Torrent Info Hash: ${HASH}</body></html>`),
    );
    const provider = makeProvider(fetchFn);
    const input = release();
    const snapshot = { ...input };

    await provider.resolveDownload!(input);

    expect(input).toEqual(snapshot);
  });

  it('propagates the not_found ProviderError when the detail page has no hash', async () => {
    const fetchFn = fakeFetch(async () => htmlResponse('<html><body>nothing here</body></html>'));
    const provider = makeProvider(fetchFn);

    await expectKind(provider.resolveDownload!(release()), 'not_found');
  });
});
