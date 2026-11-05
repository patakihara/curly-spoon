import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudibleClient } from '../../adapters/audible/client.js';
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

  it('[M3.books/a] lets a person choose when the catalogue does not know the ASIN', async () => {
    const byClient: Recording = {
      ...search,
      request: {
        ...search.request,
        query: { ...search.request.query, query: QUERY },
      },
    };
    const request = {
      target: {
        title: 'The Strange Case of Dr Jekyll and Mr Hyde',
        creator: 'Robert Louis Stevenson',
        ids: { asin: 'B000000000' },
      },
    } as unknown as StoredRequest;
    const found = await steps(missing, byClient, detail)(request);
    expect(found.kind).toBe('choose');
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
