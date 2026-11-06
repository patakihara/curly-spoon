import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FetchLike } from './http/fetch.js';
import { recordShelf } from './record-shelf.js';

const FOLDER = 'An Author/1886 - A Book (Reader) 64k';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeUpstreams(answer: number) {
  const asked: string[] = [];
  const fetch: FetchLike = async (input, init) => {
    const { pathname } = new URL(input);
    asked.push(`${init?.method ?? 'GET'} ${pathname}`);
    if (pathname === '/status') return json({ serverVersion: '2.37.0' });
    if (pathname === '/api/libraries') {
      return json({ libraries: [{ id: 'lib', name: 'Books', mediaType: 'book' }] });
    }
    if (pathname === '/api/libraries/lib/items') {
      return json({
        total: 2,
        results: [
          { id: 'other', relPath: 'Someone Private/A Secret Book', addedAt: 2 },
          { id: 'book', relPath: FOLDER, addedAt: 1 },
        ],
      });
    }
    if (pathname === '/api/items/book') {
      return json({
        id: 'book',
        libraryId: 'lib',
        mediaType: 'book',
        updatedAt: 1,
        addedAt: 1,
        media: {
          metadata: {
            title: 'A Book',
            authors: [{ id: 'au', name: 'An Author' }],
            narrators: [],
            series: [],
            genres: [],
          },
          audioFiles: [],
          coverPath: null,
        },
      });
    }
    if (pathname === '/api/authors/au')
      return json({ id: 'au', name: 'An Author', imagePath: null });
    if (pathname === '/api/authors/au/image') return new Response('no url', { status: answer });
    if (pathname.startsWith('/authors/'))
      return json({ asin: 'x', name: 'n', image: 'https://photos.invalid/a.jpg' });
    if (pathname === '/a.jpg') return new Response(new Uint8Array(5000).fill(1));
    return new Response('Not Found', { status: 404 });
  };
  return { fetch, asked };
}

describe("record mode's shelf part", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = (fake: ReturnType<typeof fakeUpstreams>) => {
    root = mkdtempSync(join(tmpdir(), 'record-shelf-'));
    return recordShelf({
      fetch: fake.fetch,
      out: () => undefined,
      root,
      absUrl: 'http://abs.invalid:13378',
      absKey: 'listen-key',
      provisionKey: 'provision-key',
      bookFolder: FOLDER,
    });
  };

  it('keeps only the one book of the newest items', async () => {
    await run(fakeUpstreams(400));
    const saved = readFileSync(
      join(root, 'audiobookshelf', 'recordings', 'newest-items.json'),
      'utf8',
    );
    expect(saved).toContain('A Book');
    expect(saved).not.toContain('A Secret Book');
  });

  it('asks for no scan, and the one write it sends has no address', async () => {
    const fake = fakeUpstreams(400);
    await run(fake);
    expect(fake.asked.filter((call) => /scan/i.test(call))).toEqual([]);
    expect(fake.asked.filter((call) => !call.startsWith('GET'))).toEqual([
      'POST /api/authors/au/image',
    ]);
    const saved = readFileSync(
      join(root, 'audiobookshelf', 'recordings', 'author-image-refused.json'),
      'utf8',
    );
    expect(JSON.parse(saved).request.body).toEqual({ json: {} });
  });

  it('keeps only the head of a photo', async () => {
    await run(fakeUpstreams(400));
    const photo = readFileSync(join(root, 'audnexus', 'recordings', 'author-doyle-image.jpg'));
    expect(photo.length).toBe(4096);
  });

  it('fails when an update with no address is not refused', async () => {
    await expect(run(fakeUpstreams(200))).rejects.toThrow(/answered 200/);
  });
});
