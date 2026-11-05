/**
 * A book's folder work on a real temp folder, with real links: what the four `audiobook-*` commands
 * did by hand. Audible's answers and the photo are recordings from mediaserver.
 */
import {
  lstatSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudibleClient, AUDIBLE_URL, type AudibleProduct } from '../../adapters/audible/client.js';
import { AudnexusClient, AUDNEXUS_URL } from '../../adapters/audnexus/client.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch, standInsBeside } from '../../adapters/http/replay.js';
import { authorPhoto, isSquareJpeg } from './authorPhoto.js';
import { BookRefused } from './names.js';
import { type BookToPlace, placeBook, type PlaceBookInput } from './place.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '../../adapters');
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );

async function productOf(call: string): Promise<AudibleProduct> {
  const rec = recorded('audible', call);
  const asin = /[^/]+$/.exec(rec.request.path)?.[0] as string;
  const client = new AudibleClient({ baseUrl: AUDIBLE_URL, fetch: replayFetch([rec]) });
  return (await client.product(asin)) as AudibleProduct;
}

const toBook = (product: AudibleProduct, more: Partial<BookToPlace> = {}): BookToPlace => ({
  title: product.title,
  authors: product.authors.map((one) => one.name),
  narrators: product.narrators,
  series: product.series,
  year: product.year,
  asin: product.asin,
  language: product.language,
  description: product.description,
  bitrateKbps: 64,
  ...more,
});

const plainBook = (more: Partial<BookToPlace> = {}): BookToPlace => ({
  title: 'A Quiet Book',
  authors: ['Ann Author'],
  narrators: ['Rob Reader'],
  series: [],
  year: 2001,
  asin: 'B000000001',
  language: 'english',
  description: null,
  bitrateKbps: 64,
  ...more,
});

describe('a book placed in Books', () => {
  let media: string;
  let save: string;
  let books: string;
  const errors: string[] = [];
  const log = {
    error: (_details: Record<string, unknown>, message: string) => errors.push(message),
  };

  beforeEach(() => {
    media = mkdtempSync(join(tmpdir(), 'auralis-place-'));
    save = join(media, 'Downloads');
    books = join(media, 'Books');
    mkdirSync(save, { recursive: true });
    mkdirSync(books, { recursive: true });
    errors.length = 0;
  });
  afterEach(() => {
    chmodAll(books);
    rmSync(media, { recursive: true, force: true });
  });

  const chmodAll = (dir: string) => {
    if (!existsSync(dir)) return;
    chmodSync(dir, 0o755);
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (lstatSync(path).isDirectory()) chmodAll(path);
    }
  };

  /** Files under the save path, and the file list qBittorrent would give for them. */
  const download = (...names: string[]) => {
    for (const name of names) {
      mkdirSync(dirname(join(save, name)), { recursive: true });
      writeFileSync(join(save, name), `bytes of ${name}`);
    }
    return names.map((name) => ({ name, size: 1 }));
  };

  const place = (input: Pick<PlaceBookInput, 'files'> & Partial<PlaceBookInput>) =>
    placeBook({ mediaDir: media, savePath: save, key: 'key-1', book: plainBook(), log, ...input });

  /** Every path under Books, relative to it. */
  const tree = (dir = books, prefix = ''): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((name) => {
        const path = join(dir, name);
        const rel = `${prefix}${name}`;
        return statSync(path).isDirectory() ? [`${rel}/`, ...tree(path, `${rel}/`)] : [rel];
      });
  const metadataAt = (relPath: string) =>
    JSON.parse(readFileSync(join(books, relPath, 'metadata.json'), 'utf8')) as Record<
      string,
      unknown
    >;

  /** An earlier edition of the book already in Books, with its own metadata. */
  const shelved = (
    folder: string,
    metadata: Record<string, unknown> | null,
    author = 'Ann Author',
  ) => {
    const dir = join(books, author, folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'old.mp3'), 'older audio');
    if (metadata !== null) writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata));
    return dir;
  };

  const refusal = async (attempt: Promise<unknown>) => {
    const error: unknown = await attempt.then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(BookRefused);
    return (error as BookRefused).reason;
  };

  const expectNothingLeft = () => {
    expect(tree()).toEqual([]);
    expect(existsSync(join(save, '.auralis-import', 'key-1'))).toBe(false);
  };

  it('[M3.books/c] a download becomes the expected folder: layout, plain title, series, every file a link', async () => {
    const files = download(
      'Dune Audio/CD1/01.mp3',
      'Dune Audio/CD2/02.mp3',
      'Dune Audio/cover.jpg',
      'Dune Audio/dune.cue',
      'Dune Audio/notes.nfo',
      'Dune Audio/.hidden.mp3',
    );
    const product = await productOf('product-dune');
    const placed = await place({ files, book: toBook(product) });

    const folder = `${product.year} - ${product.title} (${product.narrators[0]?.split(' ').pop()}) 64k`;
    const author = product.authors[0]?.name as string;
    expect(placed).toEqual({
      outcome: 'placed',
      relPath: `${author}/${folder}`,
      authorDir: join(books, author),
    });
    expect(tree(join(books, placed.relPath)).sort()).toEqual(
      ['CD1/', 'CD1/01.mp3', 'CD2/', 'CD2/02.mp3', 'cover.jpg', 'dune.cue', 'metadata.json'].sort(),
    );
    const metadata = metadataAt(placed.relPath);
    expect(metadata).toMatchObject({
      title: product.title,
      series: ['The Dune Sequence #12', 'Dune #1'],
      publishedYear: String(product.year),
      asin: product.asin,
      authors: product.authors.map((one) => one.name),
      narrators: product.narrators,
      language: 'english',
      tags: [],
      genres: [],
    });
    expect(metadata).not.toHaveProperty('chapters');
    expect(metadata.title).not.toMatch(/\[/);
  });

  it('[M3.books/c] no audio file is copied or moved: each is the same inode, and the download stays', async () => {
    const files = download('Book/01.mp3', 'Book/02.mp3');
    const placed = await place({ files });
    for (const name of ['01.mp3', '02.mp3']) {
      const source = statSync(join(save, 'Book', name));
      const linked = statSync(join(books, placed.relPath, name));
      expect(linked.ino).toBe(source.ino);
      expect(source.nlink).toBe(2);
    }
    expect(existsSync(join(save, '.auralis-import'))).toBe(false);
  });

  it('a link that fails across filesystems fails with its reason, copies nothing and leaves nothing', async () => {
    const files = download('Book/01.mp3', 'Book/02.mp3');
    let calls = 0;
    const link = async () => {
      calls += 1;
      throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    };
    expect(await refusal(place({ files, link }))).toBe('linkFailed');
    expect(calls).toBe(1);
    expectNothingLeft();
    expect(readFileSync(join(save, 'Book/01.mp3'), 'utf8')).toBe('bytes of Book/01.mp3');
  });

  it('a failure part way leaves nothing half-made, and a new author folder goes with it', async () => {
    const files = download('Book/01.mp3', 'Book/02.mp3');
    let calls = 0;
    const { link: realLink } = await import('node:fs/promises');
    const link = async (from: string, to: string) => {
      calls += 1;
      if (calls === 2) throw new Error('the disk said no');
      await realLink(from, to);
    };
    expect(await refusal(place({ files, link }))).toBe('linkFailed');
    expectNothingLeft();
  });

  it('a book already there is left alone, and the request answers that folder', async () => {
    const files = download('Book/01.mp3');
    const dir = shelved('2001 - A Quiet Book (Reader) 64k', {
      title: 'A Quiet Book',
      narrators: ['Rob Reader'],
    });
    const before = tree();
    const stamp = readFileSync(join(dir, 'metadata.json'), 'utf8');

    const placed = await place({ files });

    expect(placed.outcome).toBe('existing');
    expect(placed.relPath).toBe('Ann Author/2001 - A Quiet Book (Reader) 64k');
    expect(tree()).toEqual(before);
    expect(readFileSync(join(dir, 'metadata.json'), 'utf8')).toBe(stamp);
    expect(statSync(join(save, 'Book/01.mp3')).nlink).toBe(1);
  });

  it('the same narration under another folder name counts as already there', async () => {
    const files = download('Book/01.mp3');
    shelved('2001 - A Quiet Book (Reader) 128k 12.58.25 {362mb}', { title: 'A Quiet Book' });
    const before = tree();
    const placed = await place({ files });
    expect(placed).toMatchObject({
      outcome: 'existing',
      relPath: 'Ann Author/2001 - A Quiet Book (Reader) 128k 12.58.25 {362mb}',
    });
    expect(tree()).toEqual(before);
  });

  it('a torrent of loose files gets its own book folder', async () => {
    const files = download('whole-book.m4b');
    const placed = await place({ files });
    expect(placed.relPath).toBe('Ann Author/2001 - A Quiet Book (Reader) 64k');
    expect(tree(join(books, placed.relPath))).toEqual(['metadata.json', 'whole-book.m4b']);
  });

  it('an author folder there in another case is the one used', async () => {
    mkdirSync(join(books, 'ANN author'));
    const placed = await place({ files: download('Book/01.mp3') });
    expect(placed.relPath.startsWith('ANN author/')).toBe(true);
    expect(readdirSync(books)).toEqual(['ANN author']);
  });

  it.each([
    ['a parent step', '../../outside.mp3'],
    ['a step inside', 'Book/../../../outside.mp3'],
    ['an absolute path', '/etc/outside.mp3'],
    ['a Windows drive', 'C:\\outside.mp3'],
    ['a backslash', 'Book\\..\\outside.mp3'],
    ['a NUL', 'Book/out\0side.mp3'],
    ['fullwidth dots', 'Book/．．/outside.mp3'],
    ['a fullwidth slash', 'Book/．．／outside.mp3'],
  ])('a file named with %s stops the import and stays out of Books', async (_what, name) => {
    const files = [...download('Book/01.mp3'), { name, size: 1 }];
    expect(await refusal(place({ files }))).toBe('unsafePath');
    expectNothingLeft();
    expect(existsSync(join(media, 'outside.mp3'))).toBe(false);
  });

  it('a symlink in the download stays out', async () => {
    const files = download('Book/01.mp3');
    writeFileSync(join(media, 'secret.mp3'), 'not the torrent');
    symlinkSync(join(media, 'secret.mp3'), join(save, 'Book/02.mp3'));
    expect(await refusal(place({ files: [...files, { name: 'Book/02.mp3', size: 1 }] }))).toBe(
      'notARegularFile',
    );
    expectNothingLeft();
  });

  it('a linked folder in the download stays out', async () => {
    mkdirSync(join(media, 'elsewhere'));
    writeFileSync(join(media, 'elsewhere/01.mp3'), 'not the torrent');
    symlinkSync(join(media, 'elsewhere'), join(save, 'Book'));
    expect(await refusal(place({ files: [{ name: 'Book/01.mp3', size: 1 }] }))).toBe('unsafePath');
    expectNothingLeft();
  });

  it('an author folder that is a link is refused', async () => {
    const outside = join(media, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(books, 'Ann Author'));
    expect(await refusal(place({ files: download('Book/01.mp3') }))).toBe('unsafePath');
    expect(readdirSync(outside)).toEqual([]);
  });

  it('a hostile title or author stays inside Books, under a safe name', async () => {
    const book = plainBook({
      title: '../../../etc/passwd\u202e\u0000',
      authors: ['..\\..\\Ann／Author\u200b'],
    });
    const placed = await place({ files: download('Book/01.mp3'), book });
    expect(placed.relPath).toBe('Ann-Author/2001 - etc-passwd (Reader) 64k');
    expect(existsSync(join(books, placed.relPath, '01.mp3'))).toBe(true);
    expect(tree().every((path) => path.startsWith('Ann-Author/'))).toBe(true);
  });

  it('a title with nothing left once made safe is refused', async () => {
    const book = plainBook({ title: '../..\u200b' });
    expect(await refusal(place({ files: download('Book/01.mp3'), book }))).toBe('unsafeName');
    expectNothingLeft();
  });

  it('a file name that is odd unicode is linked under a safe one', async () => {
    const files = download('Book/\u202emp3.txt.mp3', 'Book/chapter\u200b1.mp3');
    const placed = await place({ files });
    expect(tree(join(books, placed.relPath))).toEqual([
      'chapter1.mp3',
      'metadata.json',
      'mp3.txt.mp3',
    ]);
  });

  it('two files that become one name fail rather than lose one', async () => {
    const files = download('Book/one\u200b.mp3', 'Book/one.mp3');
    expect(await refusal(place({ files }))).toBe('unexpectedLayout');
    expectNothingLeft();
  });

  it('a very long name is cut to the cap', async () => {
    const book = plainBook({ title: 'é'.repeat(200) });
    const placed = await place({ files: download('Book/01.mp3'), book });
    const folder = placed.relPath.split('/')[1] as string;
    expect(Buffer.byteLength(folder)).toBeLessThanOrEqual(120);
    expect(folder.endsWith('(Reader) 64k')).toBe(true);
  });

  it('a repeat under the key answers the same and links nothing twice', async () => {
    const files = download('Book/01.mp3');
    const first = await place({ files });
    const stamped = readFileSync(join(books, first.relPath, 'metadata.json'), 'utf8');
    const treeBefore = tree();
    const second = await place({ files });
    expect(second.relPath).toBe(first.relPath);
    expect(second.outcome).toBe('placed');
    expect(tree()).toEqual(treeBefore);
    expect(readFileSync(join(books, first.relPath, 'metadata.json'), 'utf8')).toBe(stamped);
    expect(statSync(join(save, 'Book/01.mp3')).nlink).toBe(2);
  });

  it('what a crash left in the staging folder does not stop a repeat', async () => {
    const files = download('Book/01.mp3');
    mkdirSync(join(save, '.auralis-import', 'key-1', 'half'), { recursive: true });
    writeFileSync(join(save, '.auralis-import', 'key-1', 'half', 'left.mp3'), 'x');
    const placed = await place({ files });
    expect(tree(join(books, placed.relPath))).toEqual(['01.mp3', 'metadata.json']);
  });

  it('a sole narration stays plain; a second brackets both titles and renames nothing', async () => {
    const first = shelved('2001 - A Quiet Book (Older) 64k', {
      title: 'A Quiet Book',
      narrators: ['Olga de Older'],
      asin: 'kept',
      tags: ['kept'],
    });
    const placed = await place({ files: download('Book/01.mp3') });

    expect(metadataAt(placed.relPath).title).toBe('A Quiet Book [Reader]');
    expect(JSON.parse(readFileSync(join(first, 'metadata.json'), 'utf8'))).toEqual({
      title: 'A Quiet Book [De Older]',
      narrators: ['Olga de Older'],
      asin: 'kept',
      tags: ['kept'],
    });
    expect(readdirSync(join(books, 'Ann Author')).sort()).toEqual([
      '2001 - A Quiet Book (Older) 64k',
      '2001 - A Quiet Book (Reader) 64k',
    ]);
  });

  it('a sibling whose narrator is garbage takes the name in its folder', async () => {
    const first = shelved('2001 - A Quiet Book (Older) 64k', {
      title: 'A Quiet Book',
      narrators: ['Reader 2'],
    });
    await place({ files: download('Book/01.mp3') });
    expect(JSON.parse(readFileSync(join(first, 'metadata.json'), 'utf8')).title).toBe(
      'A Quiet Book [Older]',
    );
  });

  it('a different title by the author is not a second narration', async () => {
    const other = shelved('2001 - Another Book (Older) 64k', {
      title: 'Another Book',
      narrators: ['O'],
    });
    const placed = await place({ files: download('Book/01.mp3') });
    expect(metadataAt(placed.relPath).title).toBe('A Quiet Book');
    expect(JSON.parse(readFileSync(join(other, 'metadata.json'), 'utf8')).title).toBe(
      'Another Book',
    );
  });

  it('an unwritable sibling is logged and the import carries on', async () => {
    const first = shelved('2001 - A Quiet Book (Older) 64k', {
      title: 'A Quiet Book',
      narrators: ['O Older'],
    });
    chmodSync(first, 0o555);
    const placed = await place({ files: download('Book/01.mp3') });
    expect(placed.outcome).toBe('placed');
    expect(errors).toContain('a second narration could not be marked on a sibling');
  });

  it('a second copy gets no series, and the first keeps its tag', async () => {
    const first = shelved('2001 - A Quiet Book (Older) 64k', {
      title: 'A Quiet Book',
      narrators: ['O Older'],
      series: ['Dune #1'],
    });
    const book = plainBook({ series: ['Dune #1', 'The Dune Sequence #12'] });
    const placed = await place({ files: download('Book/01.mp3'), book });
    expect(metadataAt(placed.relPath).series).toEqual([]);
    expect(JSON.parse(readFileSync(join(first, 'metadata.json'), 'utf8')).series).toEqual([
      'Dune #1',
    ]);
  });

  it('a torrent with non-audio files keeps audio, covers and cue sheets, and skips the rest', async () => {
    const files = download(
      'Book/01.mp3',
      'Book/cover.png',
      'Book/book.cue',
      'Book/run-me.exe',
      'Book/readme.txt',
      'Book/metadata.json',
      'Book/Scans/page.jpg',
    );
    const placed = await place({ files });
    expect(tree(join(books, placed.relPath))).toEqual([
      '01.mp3',
      'book.cue',
      'cover.png',
      'metadata.json',
    ]);
    expect(metadataAt(placed.relPath).title).toBe('A Quiet Book');
    expect(errors).toEqual([]);
  });

  it('a torrent with no audio fails by name', async () => {
    expect(await refusal(place({ files: download('Book/book.epub', 'Book/cover.jpg') }))).toBe(
      'noAudio',
    );
    expectNothingLeft();
  });

  it.each([
    ['named book folders', ['Set/Book One/01.mp3', 'Set/Book Two/01.mp3']],
    ['loose whole-book files', ['Set/The Hobbit.m4b', 'Set/The Silmarillion.m4b']],
  ])('a torrent holding several books fails by name: %s', async (_what, names) => {
    expect(await refusal(place({ files: download(...names) }))).toBe('severalBooks');
    expectNothingLeft();
  });

  it.each([
    ['files beside a subfolder', ['Book/01.mp3', 'Book/Bonus/02.mp3']],
    ['discs beside another folder', ['Book/CD1/01.mp3', 'Book/Bonus/02.mp3']],
    ['folders too deep', ['Book/A/CD1/01.mp3', 'Book/B/CD1/01.mp3']],
  ])('an unexpected layout fails by name: %s', async (_what, names) => {
    expect(await refusal(place({ files: download(...names) }))).toBe('unexpectedLayout');
    expectNothingLeft();
  });

  it('the same book in two formats fails by name', async () => {
    expect(await refusal(place({ files: download('Book/01.mp3', 'Book/01.ogg') }))).toBe(
      'severalFormats',
    );
    expectNothingLeft();
  });

  it('parts of one book in whole-book files stay together', async () => {
    const placed = await place({ files: download('Book/Dune Part 1.m4b', 'Book/Dune Part 2.m4b') });
    expect(tree(join(books, placed.relPath))).toContain('Dune Part 2.m4b');
  });

  it.each(['Disc 1', 'CD 1', 'Dune - Part 1', 'vol.1', '1'])(
    'a folder named %s reads as a disc',
    async (disc) => {
      const second = disc.replace(/1$/, '2');
      const placed = await place({
        files: download(`Book/${disc}/01.mp3`, `Book/${second}/01.mp3`),
      });
      expect(existsSync(join(books, placed.relPath, disc, '01.mp3'))).toBe(true);
    },
  );

  describe('the author photo', () => {
    const image = readFileSync(join(adapters, 'audnexus/recordings/author-doyle-image.jpg'));
    const replayedPhoto = () =>
      replayFetch(
        [recorded('audnexus', 'author-doyle'), recorded('audnexus', 'author-doyle-image')],
        {
          readBytes: standInsBeside(adapters),
        },
      );
    const nexus = (fetch = replayedPhoto()) => new AudnexusClient({ baseUrl: AUDNEXUS_URL, fetch });
    const asin = 'B000AQ43GQ';

    it('[M3.books/c] the recorded photo becomes author.jpg, if square', async () => {
      const authorDir = join(books, 'Arthur Conan Doyle');
      mkdirSync(authorDir);
      const fetch = replayedPhoto();
      const url = await authorPhoto({ audnexus: nexus(fetch), fetch, log }, { authorDir, asin });
      expect(url).toMatch(/\.jpg$/);
      expect(readFileSync(join(authorDir, 'author.jpg')).subarray(0, 2).toString('hex')).toBe(
        'ffd8',
      );
      expect(isSquareJpeg(image)).toBe(true);
    });

    it('a photo already there stays', async () => {
      const authorDir = join(books, 'Arthur Conan Doyle');
      mkdirSync(authorDir);
      writeFileSync(join(authorDir, 'author.jpg'), 'hers');
      const fetch = replayedPhoto();
      await authorPhoto({ audnexus: nexus(fetch), fetch, log }, { authorDir, asin });
      expect(readFileSync(join(authorDir, 'author.jpg'), 'utf8')).toBe('hers');
    });

    it('a photo that is not a square JPEG is skipped and logged', async () => {
      const authorDir = join(books, 'Arthur Conan Doyle');
      mkdirSync(authorDir);
      const tall = Buffer.from(image);
      const start = sofOffset(tall);
      tall.writeUInt16BE(tall.readUInt16BE(start + 5) + 100, start + 5);
      expect(isSquareJpeg(tall)).toBe(false);
      expect(isSquareJpeg(Buffer.from('not a jpeg'))).toBe(false);
      const base = replayedPhoto();
      const fetch: typeof base = async (url, init) =>
        String(url).endsWith('.jpg') ? new Response(tall) : base(url, init);
      const url = await authorPhoto({ audnexus: nexus(base), fetch, log }, { authorDir, asin });
      expect(url).toBeNull();
      expect(existsSync(join(authorDir, 'author.jpg'))).toBe(false);
      expect(errors).toContain('the author photo was skipped');
    });

    it('an author with no photo, or an Audnexus that is away, is no failure', async () => {
      const authorDir = join(books, 'Robert Louis Stevenson');
      mkdirSync(authorDir);
      const none = replayFetch([recorded('audnexus', 'author-stevenson')]);
      expect(
        await authorPhoto(
          { audnexus: nexus(none), fetch: none, log },
          { authorDir, asin: 'B0B8V3KRKX' },
        ),
      ).toBeNull();
      const away: typeof none = async () => {
        throw new TypeError('refused');
      };
      expect(
        await authorPhoto({ audnexus: nexus(away), fetch: away, log }, { authorDir, asin }),
      ).toBeNull();
      expect(existsSync(join(authorDir, 'author.jpg'))).toBe(false);
    });
  });
});

/** Where the recorded photo's size marker starts. */
function sofOffset(bytes: Buffer): number {
  let at = 2;
  while (at < bytes.length) {
    const marker = bytes[at + 1] as number;
    if (marker >= 0xc0 && marker <= 0xc2) return at;
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  throw new Error('no size marker');
}
