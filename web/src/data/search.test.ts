import { type SearchResult, SearchResults, SuggestionList } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { frame as search } from '../generated/pages/Search';
import { emptySearch, metaOf, rowOf, searchData, searchView, suggestData } from './search';

const result = (over: Partial<SearchResult>): SearchResult => ({
  ref: { source: 'jellyfin', id: 'a1' },
  kind: 'album',
  title: 'The Rise and Fall',
  creators: ['Chappell Roan'],
  parent: null,
  art: '/api/media/jellyfin:a1/art',
  duration: null,
  year: 2023,
  publishedAt: null,
  availability: { kind: 'owned' },
  ...over,
});

const empty = emptySearch(search.placeholder);

describe('search results as rows', () => {
  it('opens a song’s album from its row, and plays the song itself from its art', () => {
    const song = result({
      kind: 'track',
      ref: { source: 'jellyfin', id: 't1' },
      title: 'Pink Pony Club',
      parent: { ref: { source: 'jellyfin', id: 'a1' }, title: 'The Rise and Fall' },
    });
    expect(rowOf(song)).toEqual({
      title: 'Pink Pony Club',
      meta: 'Song · Chappell Roan · The Rise and Fall',
      image: '/api/media/jellyfin:a1/art?size=small',
      page: 'album',
      ref: 'jellyfin:a1',
      playRef: 'jellyfin:t1',
      queue: 'music',
    });
  });

  it('opens an album, a book or an episode on its own page, and plays it on its queue', () => {
    const rows = [
      result({ kind: 'album' }),
      result({ kind: 'book', ref: { source: 'abs', id: 'b1' } }),
      result({ kind: 'episode', ref: { source: 'abs', id: 'e1' } }),
    ].map(rowOf);
    expect(rows.map((r) => [r.page, r.ref, r.playRef, r.queue])).toEqual([
      ['album', 'jellyfin:a1', 'jellyfin:a1', 'music'],
      ['book', 'abs:b1', 'abs:b1', 'spoken'],
      ['episode', 'abs:e1', 'abs:e1', 'spoken'],
    ]);
  });

  it('opens a show’s page but plays nothing from its art', () => {
    const row = rowOf(result({ kind: 'show', ref: { source: 'abs', id: 's1' } }));
    expect([row.page, row.ref, row.playRef]).toEqual(['show', 'abs:s1', '']);
  });

  it('opens and plays nothing for an artist, an author or a series, whose pages do not exist yet', () => {
    for (const kind of ['artist', 'author', 'series'] as const) {
      const row = rowOf(result({ kind, art: null }));
      expect([row.ref, row.playRef, row.image], kind).toEqual(['', '', '']);
    }
  });

  it('opens nothing for a song with no album', () => {
    const row = rowOf(result({ kind: 'track', parent: null }));
    expect([row.ref, row.playRef]).toEqual(['', 'jellyfin:a1']);
  });

  it('names each kind and leaves out what a result has none of', () => {
    const named = (kind: SearchResult['kind']) => metaOf(result({ kind, creators: [] }));
    expect(
      (['track', 'album', 'artist', 'book', 'author', 'series', 'show', 'episode'] as const).map(
        named,
      ),
    ).toEqual(['Song', 'Album', 'Artist', 'Book', 'Author', 'Series', 'Podcast', 'Episode']);
    expect(metaOf(result({ creators: ['Ann', 'Bo'] }))).toBe('Album · Ann, Bo');
  });
});

describe('search’s data', () => {
  it('puts the best result on top and the rest in your library, with nothing outside it', () => {
    const answer = SearchResults.parse({
      query: 'ri',
      results: [
        result({ title: 'First' }),
        result({ title: 'Second' }),
        result({ title: 'Third' }),
      ],
    });
    const data = searchData(answer, empty);
    expect(data.top.title).toBe('First');
    expect(data.library.map((r) => r.title)).toEqual(['Second', 'Third']);
    expect(data.outside.books).toEqual([]);
    expect(data.suggestions).toEqual([]);
  });

  it('keeps the page’s own words and nothing of the canvas’s samples while nothing is found', () => {
    const data = searchData(SearchResults.parse({ query: 'zz', results: [] }), empty);
    expect(data.top.title).toBe('');
    expect(data.library).toEqual([]);
    expect(data.placeholder).toBe(search.placeholder.placeholder);
    expect(data.kinds).toEqual(search.placeholder.kinds);
    expect(data.query).toBe('');
  });

  it('lists each suggestion as a row that runs its search, a recent one with its own glyph', () => {
    const list = SuggestionList.parse({
      suggestions: [
        { kind: 'recent', text: 'rise', ref: null },
        { kind: 'album', text: 'The Rise and Fall', ref: { source: 'jellyfin', id: 'a1' } },
      ],
    });
    expect(suggestData(list, empty).suggestions).toEqual([
      { title: 'rise', meta: 'Recent', query: 'rise', icon: 'history' },
      { title: 'The Rise and Fall', meta: 'Album', query: 'The Rise and Fall', icon: 'search' },
    ]);
  });
});

describe('what search draws and asks for', () => {
  const draft = (text: string, settled: string | null, over = '') => ({ text, over, settled });

  it('asks for recent searches alone when opened with nothing typed', () => {
    expect(searchView('', null)).toEqual({ state: 'suggest', asks: { suggest: '' }, query: '' });
  });

  it('shows the results of the search in the address while nothing else is typed', () => {
    expect(searchView('rise', null)).toEqual({ state: 'full', asks: { q: 'rise' }, query: 'rise' });
    expect(searchView('rise', draft('rise', 'rise', 'rise')).state).toBe('full');
  });

  it('asks only for suggestions while a draft is typed, never for results', () => {
    for (const [q, typed] of [
      ['', draft('ri', 'ri')],
      ['rise', draft('rise and', 'rise', 'rise')],
      ['rise', draft('', '', 'rise')],
    ] as const) {
      const view = searchView(q, typed);
      expect(view.state).toBe('suggest');
      expect(view.asks).toEqual({ suggest: typed.settled });
    }
  });

  it('holds the draft in the field as typed, and asks for what has settled of it', () => {
    expect(searchView('', draft('ris', 'ri'))).toEqual({
      state: 'suggest',
      asks: { suggest: 'ri' },
      query: 'ris',
    });
  });

  it('asks for nothing until a draft first settles', () => {
    expect(searchView('', draft('r', null)).asks).toBeNull();
  });

  it('shows suggestions for a search of nothing but spaces', () => {
    expect(searchView('  ', null).state).toBe('suggest');
  });
});
