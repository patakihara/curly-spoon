/**
 * Search over the library index, as functions, on an index filled from the recordings: the index
 * job's recorded page (two books, two shows with their episodes, two albums with their tracks),
 * then the four recorded Ursula K. Le Guin books, two of them one series, written as the index
 * job writes an item. Results cover the whole household index, ranked in tiers: the whole title,
 * the title's start, words of the title, then people and series.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type SearchKind, SearchResult, type Suggestion } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from '../adapters/audiobookshelf/client.js';
import { itemSummarySchema } from '../adapters/audiobookshelf/schemas.js';
import { readFeed } from '../adapters/feed/client.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { runIndex } from '../libraryIndex/job.js';
import { absTree, type IndexRow } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts, listIndexed } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { librarySource, suggestFromIndex } from './library.js';
import { RESULT_LIMIT, rank, type Ranked } from './sources.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));
const T0 = Date.UTC(2026, 8, 29, 12);

function recording(upstream: string, call: string): Recording {
  const file = join(ADAPTERS, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
const abs = (call: string) => recording('audiobookshelf', call);
const jf = (call: string) => recording('jellyfin', call);
const body = <T>(r: Recording) => (r.response.body as { json: T }).json;

interface JfTracks {
  Items: { Id: string; Name: string }[];
}

/** A recorded album's tracks, with one track renamed: the only change. */
function renamed(call: string, from: string, to: string): Recording {
  const copy = structuredClone(jf(call));
  body<JfTracks>(copy).Items.find((t) => t.Name === from)!.Name = to;
  return copy;
}

const common = { baseUrl: 'http://upstream.invalid', token: '<token>' };

/**
 * The recorded index: the job's recorded page, then the four Le Guin books. `tracks` replaces the
 * recorded album tracks, for a renamed track.
 */
async function index(db: Db, tracks: Recording[] = []) {
  const albumTracks = ['index-album-tracks-1', 'index-album-tracks-2'].filter(
    (call) => !tracks.some((t) => t.call === call),
  );
  const result = await runIndex({
    db,
    abs: new AbsClient({
      ...common,
      fetch: replayFetch(
        [
          'library-list',
          'index-books-page',
          'index-book-1',
          'index-book-2',
          'index-shows-page',
          'index-show-1',
          'index-show-2',
        ].map(abs),
      ),
    }),
    jellyfin: new JellyfinClient({
      ...common,
      fetch: replayFetch(
        ['library-list', 'jf-library-albums-1', ...albumTracks].map(jf).concat(tracks),
      ),
    }),
    feeds: (url: string) =>
      readFeed(replayFetch(['show-1-feed', 'show-2-feed'].map((c) => recording('feed', c))), url),
    now: () => T0,
    random: () => 0,
    pageSize: 2,
    pages: { first: 4, count: 1 },
  });
  expect(result.abs?.error).toBeNull();
  expect(result.jellyfin?.error).toBeNull();
  for (const call of ['shell-book-1', 'shell-book-2', 'series-book-1', 'series-book-2']) {
    applyTree(db, absTree(itemSummarySchema.parse(body(abs(call)))), T0, emptyCounts());
  }
}

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => db.close());

const search = (q: string, kinds?: SearchKind[]) =>
  librarySource(db).search(kinds ? { q, kinds } : { q }, new AbortController().signal);
const shown = (ranked: Ranked[]) => ranked.map((r) => [r.tier, r.result.kind, r.result.title]);
const row = (title: string) => listIndexed(db).find((r) => r.title === title)!;
const refOf = (r: IndexRow) => ({ source: r.source, id: r.id });
/** A Jellyfin row of `kind` with nothing but its title. */
const row0 = (kind: 'album' | 'track', id: string, title: string): IndexRow => ({
  source: 'jellyfin',
  id,
  kind,
  parentId: null,
  libraryId: null,
  title,
  creators: [],
  series: [],
  genres: [],
  position: null,
  disc: null,
  duration: 60,
  year: null,
  publishedAt: null,
  upstreamVersion: null,
  ids: {},
  episodeOrder: null,
  hasArt: false,
});

describe('library search', () => {
  it('ranks the whole title first, then titles starting with the query, then titles holding its words, the closer match first', async () => {
    await index(db);

    expect(shown(await search('Megacorp'))).toEqual([
      [0, 'show', 'Megacorp'],
      [2, 'episode', 'Introducing: Megacorp'],
      [2, 'episode', '00: What is Megacorp?'],
    ]);
    const marshall = await search('marshall');
    expect(shown(marshall)[0]).toEqual([1, 'show', 'Marshall Islands: After the Bomb Dropped']);
    expect(marshall.slice(1).map((r) => [r.tier, r.result.kind])).toEqual(
      Array(4).fill([2, 'episode']),
    );
  });

  it('ranks matches through people or series last, the person themself by their own name', async () => {
    await index(db);

    const ranked = await search('fleetwood');
    expect(shown(ranked).slice(0, 2)).toEqual([
      [1, 'artist', 'Fleetwood Mac'],
      [3, 'album', 'Rumours'],
    ]);
    expect(ranked.slice(2).map((r) => [r.tier, r.result.kind])).toEqual(
      Array(11).fill([3, 'track']),
    );
    const earthsea = await search('earthsea');
    expect(shown(earthsea)).toEqual([
      [1, 'series', 'Earthsea (Archer)'],
      [2, 'book', 'A Wizard of Earthsea [Archer]'],
      [3, 'book', 'The Tombs of Atuan [Archer]'],
    ]);
  });

  it('ranks matches through people by bm25: the item naming fewer others first', async () => {
    await index(db);
    const book = row('Powers [Sandvold]');
    const quill = { id: 'author-quill', name: 'Quill Varga', role: 'author' as const };
    const copy = (id: string, title: string, creators: IndexRow['creators']) =>
      applyTree(db, { top: { ...book, id, title, creators }, children: [] }, T0, emptyCounts());
    copy('a'.repeat(32), 'Apple', [
      quill,
      { name: 'Someone Else With A Long Name', role: 'narrator' },
    ]);
    copy('b'.repeat(32), 'Zebra', [quill]);

    expect(shown(await search('varga', ['book']))).toEqual([
      [3, 'book', 'Zebra'],
      [3, 'book', 'Apple'],
    ]);
  });

  it('finds a title by its start whatever letter follows the query', async () => {
    await index(db);
    const book = row('Powers [Sandvold]');
    applyTree(
      db,
      { top: { ...book, id: 'f'.repeat(32), title: 'Palæontology' }, children: [] },
      T0,
      emptyCounts(),
    );

    expect(shown(await search('pal'))[0]).toEqual([1, 'book', 'Palæontology']);
  });

  it('follows a person to their new id upstream under the same name', async () => {
    await index(db);
    const book = row('Powers [Sandvold]');
    const write = (id: string, at: number) =>
      applyTree(
        db,
        { top: { ...book, creators: [{ id, name: 'Quill Varga', role: 'author' }] }, children: [] },
        at,
        emptyCounts(),
      );
    write('author-old', T0 + 1);

    write('author-new', T0 + 2);

    expect((await search('quill varga', ['author'])).map((r) => r.result.ref.id)).toEqual([
      'author-new',
    ]);
  });

  it('ranks an album above its own title track', async () => {
    await index(db, [renamed('index-album-tracks-2', 'Dreams', 'Rumours')]);

    expect(shown(await search('rumours'))).toEqual([
      [0, 'album', 'Rumours'],
      [0, 'track', 'Rumours'],
    ]);
  });

  it('compares words, not punctuation, for the whole title and its start', async () => {
    await index(db);
    const book = row('Powers [Sandvold]');
    applyTree(
      db,
      { top: { ...book, id: 'f'.repeat(32), title: 'Love!', series: [] }, children: [] },
      T0,
      emptyCounts(),
    );

    expect(shown(await search('fleetwood-mac'))[0]).toEqual([0, 'artist', 'Fleetwood Mac']);
    expect(shown(await search('Fleetwood  Mac!'))[0]).toEqual([0, 'artist', 'Fleetwood Mac']);
    expect(shown(await search('love'))).toEqual([[0, 'book', 'Love!']]);
    expect(shown(await search('rumours...'))[0]).toEqual([0, 'album', 'Rumours']);
    expect(shown(await search('marshall-isl'))[0]).toEqual([
      1,
      'show',
      'Marshall Islands: After the Bomb Dropped',
    ]);
  });

  it('breaks a tie in tier, kind and closeness by title, byte for byte as the database orders it, then by ref', async () => {
    await index(db);
    const book = row('Powers [Sandvold]');
    const copy = (id: string, title: string) =>
      applyTree(db, { top: { ...book, id, title }, children: [] }, T0, emptyCounts());
    copy('a'.repeat(32), 'Zebra Tales');
    copy('b'.repeat(32), 'Aardvark Tales');
    copy('c'.repeat(32), 'Aardvark Tales');
    copy('d'.repeat(32), 'Øya Tales');
    copy('e'.repeat(32), 'Pala Tales');

    expect((await search('tales')).map((r) => [r.result.title, r.result.ref.id])).toEqual([
      ['Aardvark Tales', 'b'.repeat(32)],
      ['Aardvark Tales', 'c'.repeat(32)],
      ['Pala Tales', 'e'.repeat(32)],
      ['Zebra Tales', 'a'.repeat(32)],
      ['Øya Tales', 'd'.repeat(32)],
    ]);
  });

  it('keeps the hundred closest matches when more match: the fewest words, then by title', async () => {
    await index(db);
    const book = row('Powers [Sandvold]');
    const titles = [
      ...Array.from({ length: 60 }, (_, n) => `Tales X${100 + n}`),
      ...Array.from({ length: 90 }, (_, n) => `Tales of X${200 + n}`),
    ];
    // Refs in the reverse order of titles, so an order falling back to refs keeps others.
    titles.forEach((title, n) =>
      applyTree(
        db,
        { top: { ...book, id: `${999 - n}`.padStart(32, '0'), title }, children: [] },
        T0,
        emptyCounts(),
      ),
    );

    expect((await search('tales')).map((r) => r.result.title)).toEqual(titles.slice(0, 100));
  });

  it('matches case, accents and apostrophes folded, on both sides', async () => {
    await index(db);

    expect(shown(await search('DONT STOP'))).toEqual([[0, 'track', "Don't Stop"]]);
    expect(shown(await search('fémininomenon'))).toEqual([[0, 'track', 'Femininomenon']]);
    expect(shown(await search('amazons scandal'))).toEqual([
      [2, 'episode', '08: Amazon’s Scandal Collection'],
    ]);
  });

  it('lists a person or a series once, however many items name them, and never a narrator or a host', async () => {
    await index(db);

    const people = async (q: string) =>
      (await search(q))
        .map((r) => r.result)
        .filter((r) => ['artist', 'author', 'series'].includes(r.kind))
        .map((r) => [r.kind, r.title, r.ref]);
    const leGuin = row('Powers [Sandvold]').creators.find((c) => c.role === 'author')!;
    expect(await people('le guin')).toEqual([
      ['author', 'Ursula K. Le Guin', { source: 'abs', id: leGuin.id }],
    ]);
    expect((await search('le guin', ['book'])).length).toBe(4);
    const chappell = row('Coffee').creators[0]!;
    expect(await people('chappell')).toEqual([
      ['artist', 'Chappell Roan', { source: 'jellyfin', id: chappell.id }],
    ]);
    expect(await people('mike duncan')).toEqual([
      ['author', 'Mike Duncan', expect.objectContaining({ source: 'abs' })],
    ]);
    expect(await people('cool zone')).toEqual([]);
    expect(await people('archer')).toEqual([['series', 'Earthsea (Archer)', expect.anything()]]);
  });

  it('gives each result its people, its album or show, its art, its length and dates, owned', async () => {
    await index(db);

    const results = [
      ...(await search('the chain')),
      ...(await search('megacorp')),
      ...(await search('powers')),
      ...(await search('ursula')),
    ].map((r) => SearchResult.parse(r.result));
    const of = (title: string) => results.find((r) => r.title === title)!;
    const rumours = refOf(row('Rumours'));
    const chain = row('The Chain');
    expect(of('The Chain')).toEqual({
      ref: refOf(chain),
      kind: 'track',
      title: 'The Chain',
      creators: ['Fleetwood Mac'],
      parent: { ref: rumours, title: 'Rumours' },
      art: `/api/media/jellyfin:${rumours.id}/art`,
      duration: chain.duration,
      year: chain.year,
      publishedAt: chain.publishedAt,
      availability: { kind: 'owned' },
    });
    const megacorp = refOf(row('Megacorp'));
    expect(of('Introducing: Megacorp')).toMatchObject({
      kind: 'episode',
      creators: ['Cool Zone Media and iHeartPodcasts'],
      parent: { ref: megacorp, title: 'Megacorp' },
      art: `/api/media/abs:${megacorp.id}/art`,
    });
    expect(of('Megacorp')).toMatchObject({
      parent: null,
      art: `/api/media/abs:${megacorp.id}/art`,
    });
    const powers = row('Powers [Sandvold]');
    expect(of('Powers [Sandvold]')).toMatchObject({
      kind: 'book',
      creators: ['Ursula K. Le Guin'],
      parent: null,
      art: `/api/media/abs:${powers.id}/art`,
      duration: powers.duration,
    });
    expect(of('Ursula K. Le Guin')).toMatchObject({
      kind: 'author',
      creators: [],
      parent: null,
      art: null,
      duration: null,
      year: null,
      publishedAt: null,
    });
    for (const r of results) expect(r.availability).toEqual({ kind: 'owned' });
  });

  it('filters kinds after ranking, so a filtered list keeps the unfiltered order', async () => {
    await index(db);

    for (const q of ['fleetwood', 'le guin', 'the', 'ma']) {
      const all = (await search(q)).map((r) => r.result);
      expect(all.length, q).toBeGreaterThan(2);
      for (const kinds of [['track'], ['album', 'artist'], ['book', 'author', 'series', 'show']]) {
        const filtered = (await search(q, kinds as SearchKind[])).map((r) => r.result);
        expect(filtered, `${q} ${kinds.join()}`).toEqual(all.filter((r) => kinds.includes(r.kind)));
      }
    }
  });

  it('keeps at most a hundred results, and never loses the whole-title match among many better full-text hits', async () => {
    await index(db);
    const album = { ...row('Rumours'), title: 'Ma' };
    applyTree(
      db,
      {
        top: album,
        children: Array.from({ length: 600 }, (_, n) => ({
          ...album,
          id: `${n}`.padStart(32, 'f'),
          kind: 'track' as const,
          parentId: album.id,
          title: `Ma ma ma ma song ${n}`,
          creators: [{ id: 'e'.repeat(32), name: 'Ma Ma', role: 'artist' as const }],
          hasArt: false,
        })),
      },
      T0,
      emptyCounts(),
    );

    expect(await search('ma song')).toHaveLength(RESULT_LIMIT);
    expect(await search('ma')).toHaveLength(RESULT_LIMIT);
    expect(RESULT_LIMIT).toBe(100);
    expect(shown(await search('ma')).slice(0, 2)).toEqual([
      [0, 'album', 'Ma'],
      [1, 'artist', 'Ma Ma'],
    ]);
  });

  it('reads the query as words only, never as full-text syntax', async () => {
    await index(db);

    expect(await search('"megacorp')).toHaveLength(3);
    expect(await search('megacorp OR rumours NEAR(')).toEqual([]);
    expect(await search('* - " ^')).toEqual([]);
  });

  it('merges the sources’ lists by tier, each list in its own order within a tier', async () => {
    await index(db);
    const [a, b, c, d, e] = (await search('the')).map((r) => r.result);
    const ranked = (tier: number, result: SearchResult): Ranked => ({ result, tier, score: 0 });

    expect(
      rank([
        [ranked(1, a!), ranked(2, b!), ranked(3, c!)],
        [ranked(0, d!), ranked(2, e!)],
      ]),
    ).toEqual([d, a, b, e, c]);
  });
});

describe('suggestions from the index', () => {
  const texts = (suggestions: Suggestion[]) => suggestions.map((s) => [s.kind, s.text]);

  it('suggests titles of every kind and the names of artists, authors and series, in tiers', async () => {
    await index(db);

    const suggested = suggestFromIndex(db, 'ch', 8);
    expect(texts(suggested).slice(0, 2)).toEqual([
      ['artist', 'Chappell Roan'],
      ['track', 'The Chain'],
    ]);
    expect(suggested[0]!.ref).toEqual({ source: 'jellyfin', id: row('Coffee').creators[0]!.id });
    expect(suggested[1]!.ref).toEqual(refOf(row('The Chain')));
    expect(suggested).toHaveLength(8);
    expect(texts(suggestFromIndex(db, 'ea', 8)).slice(0, 2)).toEqual([
      ['series', 'Earthsea (Archer)'],
      ['book', 'A Wizard of Earthsea [Archer]'],
    ]);
    expect(texts(suggestFromIndex(db, 'meg', 2))).toEqual([
      ['show', 'Megacorp'],
      ['episode', 'Introducing: Megacorp'],
    ]);
  });

  it('suggests a text once for each kind that carries it', async () => {
    await index(db, [renamed('index-album-tracks-2', 'Dreams', 'Rumours')]);

    expect(texts(suggestFromIndex(db, 'rumours', 8))).toEqual([
      ['album', 'Rumours'],
      ['track', 'Rumours'],
    ]);
  });

  it('suggests no name past the last item read before every item better than it is read', () => {
    const artist = { id: 'artist-zed', name: 'Zed Zulu', role: 'artist' as const };
    const album: IndexRow = {
      ...row0('album', 'album-zed', 'Zed Album'),
      creators: [{ ...artist, role: 'album-artist' }],
    };
    applyTree(
      db,
      {
        top: album,
        children: Array.from({ length: 200 }, (_, n) => ({
          ...row0('track', `track-zed-${n}`, 'Zed'),
          parentId: album.id,
          creators: [artist],
        })),
      },
      T0,
      emptyCounts(),
    );

    expect(texts(suggestFromIndex(db, 'zed', 2))).toEqual([
      ['track', 'Zed'],
      ['album', 'Zed Album'],
    ]);
  });

  it('suggests one text once per kind, however many items carry it', async () => {
    await index(db, [renamed('index-album-tracks-1', 'Coffee', 'DREAMS')]);

    const suggested = suggestFromIndex(db, 'dre', 8);
    expect(suggested.map((s) => [s.kind, s.text.toLowerCase()])).toEqual([['track', 'dreams']]);
  });
});
