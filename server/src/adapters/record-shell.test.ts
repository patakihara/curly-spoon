import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { recordingSchema } from './http/recording.js';
import { runRecord } from './record-cli.js';
import { ART_WIDTH } from '../routes/items.js';
import { COVER_STAND_IN, PRIMARY_IMAGE_STAND_IN } from './record-shell.js';

const ABS = 'http://abs.invalid:13378';
const JF = 'http://jellyfin.invalid:8096';
const BOOK = 'book-5';
const ALBUM = 'album-3';

/** Both upstreams: seven books and a podcasts library in ABS, two music libraries in Jellyfin. */
interface FakeOptions {
  /** Jellyfin answers the views with a 500. */
  viewsFail?: boolean;
  /** Jellyfin's logout fails with a network error. */
  logoutFails?: boolean;
}

function fakeUpstreams(username = 'auralis', options: FakeOptions = {}) {
  const asked: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const books = Array.from({ length: 7 }, (_, n) => ({
    id: `book-${n}`,
    mediaType: 'book',
    updatedAt: n,
  }));
  const albums: Record<string, { Id: string; Type: string }[]> = {
    music: Array.from({ length: 5 }, (_, n) => ({ Id: `album-${n}`, Type: 'MusicAlbum' })),
    more: [{ Id: 'other', Type: 'MusicAlbum' }],
  };
  const fetch: FetchLike = async (input, init) => {
    const u = new URL(input);
    const method = init?.method ?? 'GET';
    const p = u.pathname;
    const q = u.searchParams;
    asked.push(`${method} ${u.origin === ABS ? 'abs' : 'jf'} ${p}${u.search}`);
    if (u.origin === ABS) {
      if (p === '/status') return json({ serverVersion: '2.37.1' });
      if (p === '/api/me') return json({ id: 'u', username, mediaProgress: [], bookmarks: [] });
      if (p === '/api/libraries') {
        return json({
          libraries: [
            { id: 'pods', name: 'Podcasts', mediaType: 'podcast' },
            { id: 'books', name: 'Books', mediaType: 'book' },
          ],
        });
      }
      if (p === '/api/libraries/books/items') {
        const limit = Number(q.get('limit'));
        const page = Number(q.get('page'));
        return json({
          total: books.length,
          results: books.slice(page * limit, (page + 1) * limit),
        });
      }
      const item = /^\/api\/items\/([^/]+)(\/cover)?$/.exec(p);
      if (item?.[2]) {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/webp' },
        });
      }
      if (item) {
        return json({
          id: item[1],
          libraryId: 'books',
          updatedAt: 1,
          mediaType: 'book',
          media: {
            metadata: { title: item[1], authors: [], narrators: [], series: [], genres: [] },
            audioFiles: [],
          },
        });
      }
    }
    if (u.origin === JF) {
      if (p === '/System/Info/Public') return json({ Version: '10.11.11' });
      if (p === '/Library/MediaFolders') {
        return json({
          Items: [
            { Id: 'books', Name: 'Books', CollectionType: 'books' },
            { Id: 'music', Name: 'Music', CollectionType: 'music' },
            { Id: 'more', Name: 'More', CollectionType: 'music' },
          ],
        });
      }
      if (p === '/Items' && q.get('IncludeItemTypes') === 'MusicAlbum') {
        const all = albums[q.get('ParentId') ?? ''] ?? [];
        const start = Number(q.get('StartIndex'));
        return json({
          Items: all.slice(start, start + Number(q.get('Limit'))),
          TotalRecordCount: all.length,
        });
      }
      if (p === '/Users')
        return json([{ Id: 'jfu', Name: 'auralis', Policy: { IsAdministrator: false } }]);
      if (p === '/QuickConnect/Initiate') return json({ Secret: 's', Code: '123456' });
      if (p === '/QuickConnect/Authorize') return json(true);
      if (p === '/Users/AuthenticateWithQuickConnect') {
        return json({ AccessToken: 'minted', User: { Id: 'jfu' } });
      }
      if (p === '/UserViews') {
        if (options.viewsFail) return json({ title: 'Server Error' }, 500);
        return json({ Items: [{ Id: 'music', Name: 'Music', CollectionType: 'music' }] });
      }
      if (p === `/Items/${ALBUM}/Images/Primary`) {
        return new Response(new Uint8Array([0xff, 0xd8]), {
          headers: { 'content-type': 'image/jpeg', 'content-length': '2' },
        });
      }
      if (p === '/Sessions/Logout') {
        if (options.logoutFails) throw new TypeError('fetch failed');
        return new Response(null, { status: 204 });
      }
    }
    return new Response('Not Found', { status: 404 });
  };
  return { fetch, asked };
}

async function run(username?: string, options: FakeOptions = {}) {
  const fake = fakeUpstreams(username, options);
  const out: string[] = [];
  const err: string[] = [];
  const argv = [
    ...['--only', 'shell', '--abs', ABS, '--jellyfin', JF],
    ...['--play-item', BOOK, '--jellyfin-item', ALBUM, '--dry-run'],
  ];
  const code = await runRecord({
    argv,
    stdin: 'ABS_API_KEY=abskey\nJELLYFIN_API_KEY=jfkey\n',
    fetch: fake.fetch,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  }).catch((error: unknown) => error);
  const files = out.filter((l) => l.startsWith('wrote ')).map((l) => l.slice(6));
  return { code, out, err, files, ...fake };
}

const read = (file: string) => recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));

describe("record mode for M1.shell's reads", () => {
  it("records the books page holding the book, its books, the book's cover, each music library's albums page, the views and the album's image, each image twice", async () => {
    const { code, err, files } = await run();
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(files.map((f) => f.split('/').slice(-3).join('/'))).toEqual([
      'audiobookshelf/recordings/shell-books-page.json',
      'audiobookshelf/recordings/shell-book-1.json',
      'audiobookshelf/recordings/shell-book-2.json',
      'audiobookshelf/recordings/shell-cover.json',
      'audiobookshelf/recordings/shell-cover-medium.json',
      'jellyfin/recordings/jf-library-albums-1.json',
      'jellyfin/recordings/jf-library-albums-2.json',
      'jellyfin/recordings/jf-user-views.json',
      'jellyfin/recordings/jf-primary-image.json',
      'jellyfin/recordings/jf-primary-image-medium.json',
    ]);
  });

  it('records the page of two, oldest added first, that holds the book', async () => {
    const { files } = await run();
    const page = read(files[0]!);
    expect(page.request.query).toEqual({
      limit: '2',
      page: '2',
      minified: '1',
      sort: 'addedAt',
    });
    expect(read(files[1]!).request.path).toBe('/api/items/book-4');
    expect(read(files[2]!).request.path).toBe('/api/items/book-5');
  });

  it('records each music library by its id, at the page holding the album where it is there', async () => {
    const { files } = await run();
    const [first, second] = [read(files[5]!), read(files[6]!)];
    expect(first.request.query).toMatchObject({ ParentId: 'music', StartIndex: '2', Limit: '2' });
    expect(second.request.query).toMatchObject({ ParentId: 'more', StartIndex: '0', Limit: '2' });
  });

  it('keeps the images their real status and headers, with synthesized bodies', async () => {
    const { files } = await run();
    for (const file of [files[3]!, files[4]!]) {
      const cover = read(file);
      expect(cover.request.path).toBe(`/api/items/${BOOK}/cover`);
      expect(cover.response.headers['content-type']).toBe('image/webp');
      expect(cover.response.body).toEqual(COVER_STAND_IN);
    }
    for (const file of [files[8]!, files[9]!]) {
      const image = read(file);
      expect(image.request.path).toBe(`/Items/${ALBUM}/Images/Primary`);
      expect(image.response.headers['content-type']).toBe('image/jpeg');
      expect(image.response.body).toEqual(PRIMARY_IMAGE_STAND_IN);
    }
  });

  it('records each image as stored and at the medium size the art route asks for', async () => {
    const { files } = await run();
    expect(read(files[3]!).request.query).toEqual({});
    expect(read(files[4]!).request.query).toEqual({ width: String(ART_WIDTH.medium) });
    expect(read(files[8]!).request.query).toEqual({});
    expect(read(files[9]!).request.query).toEqual({ maxWidth: String(ART_WIDTH.medium) });
  });

  it('never lists or reads the Podcasts library, and logs out the token it minted', async () => {
    const { asked } = await run();
    expect(asked.filter((a) => a.includes('pods'))).toEqual([]);
    expect(asked.at(-1)).toBe('POST jf /Sessions/Logout');
  });

  it('asks for the views and the image as the test user, through the minted token', async () => {
    const { files } = await run();
    for (const file of [files[7]!, files[8]!, files[9]!]) {
      expect(read(file).request.headers.authorization).toContain('DeviceId="auralis-recorder"');
    }
  });

  it('keeps the views failure when logging out fails too, and reports the logout failure', async () => {
    const { code, out, asked } = await run(undefined, { viewsFail: true, logoutFails: true });
    expect(String(code)).toMatch(/500/);
    expect(String(code)).not.toMatch(/fetch failed/);
    expect(out.join('\n')).toMatch(/logging out the minted Jellyfin token failed: .*fetch failed/);
    expect(asked.at(-1)).toBe('POST jf /Sessions/Logout');
  });

  it('fails when logging out fails after everything else went well', async () => {
    const { code } = await run(undefined, { logoutFails: true });
    expect(String(code)).toMatch(/fetch failed/);
  });

  it("refuses an Audiobookshelf key that is not the test user's", async () => {
    const { code, files } = await run('someone');
    expect(String(code)).toMatch(/not auralis/);
    expect(files).toEqual([]);
  });

  it('refuses to run without the book and the album', async () => {
    const err: string[] = [];
    const code = await runRecord({
      argv: ['--only', 'shell', '--abs', ABS, '--jellyfin', JF],
      stdin: 'ABS_API_KEY=a\nJELLYFIN_API_KEY=b\n',
      fetch: async () => new Response(null),
      out: () => undefined,
      err: (l) => err.push(l),
    });
    expect(code).toBe(2);
    expect(err.join('\n')).toMatch(/--play-item, --jellyfin-item/);
  });
});
