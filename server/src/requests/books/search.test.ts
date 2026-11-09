import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudibleClient } from '../../adapters/audible/client.js';
import { AudnexusClient } from '../../adapters/audnexus/client.js';
import { type FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import { ProwlarrClient, type ProwlarrRelease } from '../../adapters/prowlarr/client.js';
import type { StoredRequest } from '../../store/requests.js';
import { StepUnavailable } from '../steps.js';
import { type BookFacts, pickRelease, type PickRow } from './pick.js';
import { bookSearch } from './search.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters');
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const BASE = 'http://upstream.invalid';
const prowlarrWith = (fetch: FetchLike) =>
  new ProwlarrClient({ baseUrl: BASE, apiKey: '<token>', fetch });
const audibleWith = (fetch: FetchLike) => new AudibleClient({ baseUrl: BASE, fetch });

const product = recorded('audible', 'product-jekyll');
const missing = recorded('audible', 'product-missing');
const search = recorded('prowlarr', 'search-jekyll');
const spanish = recorded('prowlarr', 'search-jekyll-spanish');
const detail = recorded('audiobookbay', 'detail');
const ASIN = 'B09J9BJ8DF';
const QUERY = 'The Strange Case of Dr Jekyll and Mr Hyde Robert Louis Stevenson';

const asked = (asin: string): StoredRequest =>
  ({
    target: {
      title: 'a title a client sent',
      creator: 'a client',
      ids: { asin },
    },
  }) as unknown as StoredRequest;

const steps = (...recordings: Recording[]) => {
  const fetch = replayFetch(recordings);
  return bookSearch({
    audible: audibleWith(fetch),
    prowlarr: prowlarrWith(fetch),
    fetch,
  });
};

const facts: BookFacts = {
  title: 'The Strange Case of Dr Jekyll and Mr Hyde',
  authors: ['Robert Louis Stevenson'],
  narrators: ['Paapa Essiedu'],
  runtimeMinutes: 182,
  language: 'english',
};
const recordedRows = async (recording: Recording): Promise<PickRow[]> => {
  const rows = await prowlarrWith(replayFetch([recording])).search(
    recording.request.query.query as string,
    { categories: [3030] },
  );
  return rows.map((release) => ({ release, extras: {} }));
};
const titled = (title: string, base: ProwlarrRelease): PickRow => ({
  release: { ...base, title },
  extras: {},
});

describe('[M3.books/a] the search step, on Prowlarr and AudiobookBay recordings', () => {
  it('[M3.books/a] picks the English edition the catalogue names, and keeps others', async () => {
    const found = await steps(product, search, detail)(asked(ASIN));
    if (found.kind !== 'picked') throw new Error(`expected a pick, not ${found.kind}`);
    expect(found.release.title).toBe(
      'The Strange Case of Dr Jekyll and Mr Hyde - Robert Louis Stevenson [M4B] [128 Kbps]',
    );
    expect(found.release.details).toMatchObject({
      narrators: ['Paapa Essiedu'],
      bitrateKbps: 128,
      format: 'm4b',
      infoHash: 'e49a3646bcc9dfa002114fe2d458834761f40d72',
    });
    expect(found.others.length).toBeGreaterThan(0);
    expect(found.others.length).toBeLessThanOrEqual(3);
    expect(found.others.map((other) => other.id)).not.toContain(found.release.id);
  });

  it('[M3.books/a] searches by what the catalogue says, never by a client’s text', async () => {
    const queries: string[] = [];
    const replay = replayFetch([product, search, detail]);
    const fetch: FetchLike = (url, init) => {
      const query = new URL(url).searchParams.get('query');
      if (query !== null) queries.push(query);
      return replay(url, init);
    };
    await bookSearch({ audible: audibleWith(fetch), prowlarr: prowlarrWith(fetch), fetch })(
      asked(ASIN),
    );
    expect(queries).toEqual([QUERY]);
  });

  it('[M3.books/a] stores no key and no address beyond the path', async () => {
    const found = await steps(product, search, detail)(asked(ASIN));
    const text = JSON.stringify(found);
    expect(text).not.toContain('apikey');
    expect(text).not.toContain('<token>');
  });

  it('[M3.books/a] rejects the Spanish edition and the collection', async () => {
    const rows = [...(await recordedRows(spanish)), ...(await recordedRows(search))];
    const titles = rows.map((row) => row.release.title);
    expect(titles.some((title) => title.startsWith('El extraño'))).toBe(true);
    expect(titles.some((title) => title.startsWith('The Horror Collection'))).toBe(true);
    const picked = pickRelease(rows, facts);
    if (picked.kind !== 'picked') throw new Error(`expected a pick, not ${picked.kind}`);
    const kept = [picked.best, ...picked.others].map((row) => row.release.title);
    expect(kept.some((title) => title.startsWith('El extraño'))).toBe(false);
    expect(kept.some((title) => title.startsWith('The Horror Collection'))).toBe(false);
  });

  it('[M3.books/a] gives a person the choice when nothing clears the bar', async () => {
    const rows = (await recordedRows(search)).filter((row) =>
      /plus Markheim|Other Tales/.test(row.release.title),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(pickRelease(rows, facts)).toMatchObject({ kind: 'choose' });
  });

  it('[M3.books/a] answers noRelease when no row is left', async () => {
    const empty: Recording = {
      ...search,
      response: { ...search.response, body: { json: [] } },
    };
    expect(await steps(product, empty)(asked(ASIN))).toEqual({ kind: 'none', reason: 'noRelease' });
    const onlySpanish: Recording = {
      ...search,
      response: spanish.response,
    };
    expect(await steps(product, onlySpanish)(asked(ASIN))).toEqual({
      kind: 'none',
      reason: 'noRelease',
    });
  });

  it('[M3.books/a] answers noRelease when the catalogue does not know the ASIN, asking Prowlarr nothing', async () => {
    const asks: string[] = [];
    const replay = replayFetch([missing]);
    const fetch: FetchLike = (url, init) => {
      asks.push(url);
      return replay(url, init);
    };
    const prowlarr = { search: vi.fn(async () => []) };
    const found = await bookSearch({ audible: audibleWith(fetch), prowlarr, fetch })({
      target: {
        title: 'The Strange Case of Dr Jekyll and Mr Hyde',
        creator: 'Robert Louis Stevenson',
        ids: { asin: 'B000000000' },
      },
    } as unknown as StoredRequest);
    expect(found).toEqual({ kind: 'none', reason: 'noRelease' });
    expect(prowlarr.search).not.toHaveBeenCalled();
    expect(asks).toHaveLength(1);
  });

  it('[M3.books/a] answers noRelease for a book with no ASIN, as nothing says what it is', async () => {
    const prowlarr = { search: vi.fn(async () => []) };
    const product = vi.fn(async () => null);
    const found = await bookSearch({
      audible: { product },
      prowlarr,
      fetch: replayFetch([]),
    })({
      target: { title: 'Anything', creator: null, ids: { isbn: '9780000000000' } },
    } as unknown as StoredRequest);
    expect(found).toEqual({ kind: 'none', reason: 'noRelease' });
    expect(product).not.toHaveBeenCalled();
    expect(prowlarr.search).not.toHaveBeenCalled();
  });

  it('[M3.books/a] holds the request while Prowlarr or Audible is away', async () => {
    const down: FetchLike = () => Promise.reject(new Error('refused'));
    const replay = replayFetch([product]);
    await expect(
      bookSearch({ audible: audibleWith(replay), prowlarr: prowlarrWith(down), fetch: down })(
        asked(ASIN),
      ),
    ).rejects.toBeInstanceOf(StepUnavailable);
    await expect(
      bookSearch({ audible: audibleWith(down), prowlarr: prowlarrWith(replay), fetch: down })(
        asked(ASIN),
      ),
    ).rejects.toBeInstanceOf(StepUnavailable);
  });

  it('[M3.books/a] goes on without a detail page that cannot be read, and logs no address', async () => {
    const replay = replayFetch([product, search]);
    const log = { error: vi.fn() };
    const found = await bookSearch({
      audible: audibleWith(replay),
      prowlarr: prowlarrWith(replay),
      fetch: () => Promise.reject(new Error('refused')),
      log,
    })(asked(ASIN));
    expect(found.kind).toBe('picked');
    expect(log.error).toHaveBeenCalled();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('abss');
  });
});

describe('[M3.books/a] the pick', () => {
  let rows: PickRow[];
  beforeEach(async () => {
    rows = await recordedRows(search);
  });
  const named = (start: string) => {
    const row = rows.find(({ release }) => release.title.startsWith(start));
    if (row === undefined) throw new Error(`no recorded row starts ${start}`);
    return row;
  };
  const m4b = 'The Strange Case of Dr Jekyll and Mr Hyde - Robert Louis Stevenson [M4B]';

  it('[M3.books/a] ranks a zero-seed row last only among equals', () => {
    const best = named(m4b);
    const dead = { ...best, release: { ...best.release, seeders: 0 } };
    const twin = { ...best, release: { ...best.release, details: {} } };

    const overOthers = pickRelease([...rows.filter((row) => row !== best), dead], facts);
    expect(overOthers).toMatchObject({ kind: 'picked', best: dead });

    const amongEquals = pickRelease([dead, twin], facts);
    expect(amongEquals).toMatchObject({ kind: 'picked', best: twin, others: [dead] });
  });

  it('[M3.books/a] prefers the catalogue’s reading to a better format', () => {
    const read = { ...named(m4b), extras: { narrators: ['Paapa Essiedu'], format: 'mp3' } };
    const other = { ...named(m4b), extras: { narrators: ['Someone Else'], format: 'm4b' } };
    expect(pickRelease([other, read], facts)).toMatchObject({ best: read });
  });

  it('[M3.books/a] rejects an ebook, a wrong language and a size too small to be the book', () => {
    const base = named(m4b).release;
    const none: PickRow[] = [
      titled(`${base.title} EPUB`, base),
      titled(`${base.title} [German]`, base),
      { release: { ...base, size: 1_000_000 }, extras: {} },
    ];
    expect(pickRelease(none, facts)).toEqual({ kind: 'none' });
  });

  it('[M3.books/a] keeps at most three others', () => {
    const base = named(m4b).release;
    const many = Array.from({ length: 6 }, () => titled(base.title, base));
    const picked = pickRelease(many, facts);
    expect(picked).toMatchObject({ kind: 'picked' });
    expect(picked.kind === 'picked' && picked.others).toHaveLength(3);
  });
});

describe('[M3.books/a] the pick starts only what is plainly this book', () => {
  const base: ProwlarrRelease = {
    title: '',
    source: 'an indexer',
    size: null,
    seeders: 1,
    infoUrl: null,
    details: {},
  };
  const dune: BookFacts = {
    title: 'Dune',
    authors: ['Frank Herbert'],
    narrators: [],
    runtimeMinutes: null,
    language: 'english',
  };
  const plainDune = 'Dune - Frank Herbert';

  it('[M3.books/a] a row only a person may choose never becomes an other, which a stall starts by itself', () => {
    const picked = pickRelease(
      [titled(plainDune, base), titled('Dune Messiah - Frank Herbert', base)],
      dune,
    );
    expect(picked).toMatchObject({ kind: 'picked', others: [] });
  });

  it('[M3.books/a] the same torrent from a second indexer is not another release to go on to', () => {
    const one = { ...base, title: plainDune, details: { link: '/a', infoHash: 'a'.repeat(40) } };
    const two = { ...base, title: plainDune, details: { link: '/b', infoHash: 'a'.repeat(40) } };
    const picked = pickRelease(
      [
        { release: one, extras: {} },
        { release: two, extras: {} },
      ],
      dune,
    );
    expect(picked).toMatchObject({ kind: 'picked', others: [] });
  });

  it.each([
    'Dune 2 - Frank Herbert',
    'Dune Book 1-3 - Frank Herbert',
    'Dune - Frank Herbert [Abridged]',
    'Dune (Abridged) - Frank Herbert',
    'Dune - Frank Herbert (Box Set)',
    'Dune - Frank Herbert [Books 1-6]',
  ])('[M3.books/a] %s is not picked for the one book', (title) => {
    expect(pickRelease([titled(title, base)], dune).kind).not.toBe('picked');
  });

  it('[M3.books/a] a title holding the words in another order is not picked', () => {
    const asked = { ...dune, title: 'Words of Radiance', authors: ['Brandon Sanderson'] };
    const row = titled('Radiance of Words - Brandon Sanderson', base);
    expect(pickRelease([row], asked).kind).not.toBe('picked');
  });

  it.each(['Danish', 'Hungarian', 'Korean'])(
    '[M3.books/a] a row marked %s is another language than the product’s',
    (language) => {
      expect(pickRelease([titled(`${plainDune} [${language}]`, base)], dune)).toEqual({
        kind: 'none',
      });
    },
  );
});

describe('[M3.books/a] what the pick weighs', () => {
  const base: ProwlarrRelease = {
    title: 'Dune - Frank Herbert',
    source: 'an indexer',
    size: null,
    seeders: 1,
    infoUrl: null,
    details: {},
  };
  const dune: BookFacts = {
    title: 'Dune',
    authors: ['Frank Herbert'],
    narrators: [],
    runtimeMinutes: 60,
    language: 'english',
  };
  /** The size of a sixty-minute book at this bitrate. */
  const sizeAt = (kbps: number) => (kbps * 1000 * 3600) / 8;
  const sized = (kbps: number): PickRow => ({
    release: { ...base, size: sizeAt(kbps) },
    extras: {},
  });
  const atPage = (kbps: number, title = base.title): PickRow => ({
    release: { ...base, title },
    extras: { bitrateKbps: kbps },
  });
  const kindOf = (rows: PickRow[], asked = dune) => pickRelease(rows, asked).kind;

  it('[M3.books/a] a size above the bitrate any book has is rejected, and at that bitrate it is not', () => {
    expect(kindOf([sized(640)])).toBe('picked');
    expect(kindOf([sized(641)])).toBe('none');
  });

  it('[M3.books/a] a row with no size or no runtime skips the size check', () => {
    expect(kindOf([{ release: { ...base, size: null }, extras: {} }])).toBe('picked');
    const noLength = { ...dune, runtimeMinutes: null };
    expect(kindOf([sized(100_000)], noLength)).toBe('picked');
  });

  it('[M3.books/a] a row must name an author by surname', () => {
    const row = (title: string) => titled(title, base);
    expect(kindOf([row('Dune - Frank Someone')])).toBe('none');
    expect(kindOf([row('Dune')])).toBe('none');
    const two = { ...dune, authors: ['Frank Herbert', 'Brian Anderson'] };
    expect(kindOf([row('Dune - Brian Anderson')], two)).toBe('picked');
  });

  it('[M3.books/a] a bitrate in the wanted range beats one above or below it', () => {
    const [low, wanted, high] = [atPage(32), atPage(64), atPage(320)];
    expect(pickRelease([low, high, wanted], dune)).toMatchObject({ best: wanted });
    expect(pickRelease([atPage(320), atPage(128)], dune)).toMatchObject({
      best: { extras: { bitrateKbps: 128 } },
    });
    expect(pickRelease([atPage(32), atPage(48)], dune)).toMatchObject({
      best: { extras: { bitrateKbps: 48 } },
    });
  });

  it('[M3.books/a] any bitrate in range ranks the same, and the order given decides', () => {
    expect(pickRelease([atPage(96), atPage(128)], dune)).toMatchObject({
      best: { extras: { bitrateKbps: 96 } },
    });
    expect(pickRelease([atPage(128), atPage(64)], dune)).toMatchObject({
      best: { extras: { bitrateKbps: 128 } },
    });
  });

  it('[M3.books/a] an unknown bitrate ranks a little off: behind a wanted one, ahead of a far one', () => {
    const unknown: PickRow = { release: base, extras: {} };
    expect(pickRelease([unknown, atPage(128)], dune)).toMatchObject({
      best: { extras: { bitrateKbps: 128 } },
    });
    expect(pickRelease([atPage(320), unknown], dune)).toMatchObject({ best: unknown });
  });

  it('[M3.books/a] the page’s bitrate beats the title’s, and the title’s beats the size’s', () => {
    const pageIsRight = atPage(128, `${base.title} [320 Kbps]`);
    const pageIsFar = atPage(320, `${base.title} [128 Kbps]`);
    expect(pickRelease([pageIsFar, pageIsRight], dune)).toMatchObject({ best: pageIsRight });

    const saysRight: PickRow = {
      release: { ...base, title: `${base.title} [128 Kbps]`, size: sizeAt(400) },
      extras: {},
    };
    const sizeOnly: PickRow = { release: { ...base, size: sizeAt(200) }, extras: {} };
    expect(pickRelease([sizeOnly, saysRight], dune)).toMatchObject({ best: saysRight });
    const saysFar: PickRow = {
      release: { ...base, title: `${base.title} [400 Kbps]`, size: sizeAt(128) },
      extras: {},
    };
    expect(pickRelease([saysFar, sized(200)], dune)).toMatchObject({
      best: { release: { size: sizeAt(200) } },
    });
  });

  it('[M3.books/a] a language is the same whatever it is written in, and one match among many is enough', () => {
    const row = (mark: string) => titled(`${base.title} [${mark}]`, base);
    expect(kindOf([row('Deutsch')], { ...dune, language: 'German' })).toBe('picked');
    expect(kindOf([row('Deutsch')])).toBe('none');
    expect(kindOf([row('English, Spanish')])).toBe('picked');
    expect(kindOf([row('Danish')], { ...dune, language: null })).toBe('picked');
  });

  it('[M3.books/a] an unabridged edition is the one book, and a word of the book’s own title is no mark', () => {
    expect(kindOf([titled(`${base.title} [Unabridged]`, base)])).toBe('picked');
    const asked = { ...dune, title: 'The Dune Collection' };
    expect(kindOf([titled('The Dune Collection - Frank Herbert', base)], asked)).toBe('picked');
  });

  it('[M3.books/a] the same torrent counts once however its hash is named, and keeps its best row', () => {
    const hash = 'a'.repeat(40);
    const named: PickRow = { release: { ...base, details: { infoHash: hash } }, extras: {} };
    const magnet: PickRow = {
      release: { ...base, details: { magnet: `magnet:?xt=urn:btih:${hash}` } },
      extras: {},
    };
    const page: PickRow = {
      release: { ...base, details: { link: '/c' } },
      extras: { infoHash: hash, bitrateKbps: 128 },
    };
    expect(pickRelease([named, magnet, page], dune)).toMatchObject({ best: page, others: [] });
  });
});

describe('[M3.books/a] how far the search goes', () => {
  const row = (at: number, source: string): ProwlarrRelease => ({
    title: 'The Strange Case of Dr Jekyll and Mr Hyde - Robert Louis Stevenson',
    source,
    size: null,
    seeders: 1,
    infoUrl: `http://upstream.invalid/${at}`,
    details: { link: `/${at}` },
  });
  const listing = (rows: ProwlarrRelease[]) => ({ search: () => Promise.resolve(rows) });

  it('[M3.books/a] reads three detail pages at most, all from the indexer that has them', async () => {
    const pages: string[] = [];
    const rows = [
      row(0, 'another indexer'),
      ...Array.from({ length: 5 }, (_, at) => row(at + 1, 'AudioBook Bay')),
    ];
    await bookSearch({
      audible: audibleWith(replayFetch([product])),
      prowlarr: listing(rows),
      fetch: (url) => {
        pages.push(url);
        return Promise.reject(new Error('refused'));
      },
    })(asked(ASIN));
    expect(pages.map((url) => new URL(url).pathname).sort()).toEqual(['/1', '/2', '/3']);
  });

  it('[M3.books/a] offers a person ten releases at most', async () => {
    const notPlainly = (at: number) => ({
      ...row(at, 'an indexer'),
      title: 'The Strange Case of Dr Jekyll and Mr Hyde plus Markheim - Robert Louis Stevenson',
    });
    const found = await bookSearch({
      audible: audibleWith(replayFetch([product])),
      prowlarr: listing(Array.from({ length: 12 }, (_, at) => notPlainly(at))),
      fetch: () => Promise.reject(new Error('refused')),
    })(asked(ASIN));
    expect(found).toMatchObject({ kind: 'choose' });
    expect(found.kind === 'choose' && found.candidates).toHaveLength(10);
  });
});

describe('[M3.books] a rate limit says nothing about the request', () => {
  const limited: FetchLike = () => Promise.resolve(new Response('', { status: 429 }));

  it('[M3.books] a 429 from Audible, Prowlarr or Audnexus holds the request', async () => {
    await expect(audibleWith(limited).product(ASIN)).rejects.toBeInstanceOf(StepUnavailable);
    await expect(
      prowlarrWith(limited).search(QUERY, { categories: [3030] }),
    ).rejects.toBeInstanceOf(StepUnavailable);
    const audnexus = new AudnexusClient({ baseUrl: BASE, fetch: limited });
    await expect(audnexus.author('an-asin')).rejects.toBeInstanceOf(StepUnavailable);
    await expect(audnexus.authorsNamed('a name')).rejects.toBeInstanceOf(StepUnavailable);
  });
});
