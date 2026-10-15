import { type SearchResult, SearchResults, SuggestionList } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { createApiClient } from '../api/client';
import { frame as search } from '../generated/pages/Search';
import {
  emptySearch,
  loadSearchPage,
  metaOf,
  rowOf,
  searchData,
  type SearchDrawn,
  searchLive,
  type SearchLoaded,
  searchView,
  suggestData,
} from './search';
import { answerFrom, createPageStore, pageKey } from './store';

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
  const draft = (text: string, settled: string | null, over = '') => ({
    text,
    over,
    settled,
    submitted: false,
  });

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

describe('what search asks of the server', () => {
  const draft = (text: string, settled: string | null, over = '') => ({
    text,
    over,
    settled,
    submitted: false,
  });

  it('asks for at most what the server takes, trimmed, the field keeping all that is typed', () => {
    const long = `${'r'.repeat(199)}🎵🎵`;
    const capped = `${'r'.repeat(199)}🎵`;
    expect(searchView('', draft(`${long} `, `${long} `))).toEqual({
      state: 'suggest',
      asks: { suggest: capped },
      query: `${long} `,
    });
    expect(searchView(long, null).asks).toEqual({ q: capped });
  });

  /** An API answering suggest and search, recording each path asked. */
  function api(results: unknown[]) {
    const asked: string[] = [];
    const client = createApiClient({
      baseUrl: 'http://auralis.test',
      fetch: async (request) => {
        const url = new URL(request.url);
        asked.push(`${url.pathname}?${url.searchParams}`);
        const body = url.pathname.endsWith('/suggest')
          ? { suggestions: [{ kind: 'recent', text: 'rise', ref: null }] }
          : { query: url.searchParams.get('q'), results };
        return new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    return { client, asked };
  }

  it('asks only for suggestions while typing, never for results', async () => {
    const { client, asked } = api([]);
    const loaded = await loadSearchPage(client, { suggest: 'ri' }, empty);
    expect(asked).toEqual(['/api/search/suggest?q=ri']);
    expect(loaded.data.suggestions.map((s) => s.title)).toEqual(['rise']);
  });

  it('asks for the results of a search, and says whether it found anything', async () => {
    const found = api([result({})]);
    expect((await loadSearchPage(found.client, { q: 'ri' }, empty)).found).toBe(true);
    expect(found.asked).toEqual(['/api/search?q=ri']);
    const none = api([]);
    expect((await loadSearchPage(none.client, { q: 'zz' }, empty)).found).toBe(false);
  });
});

describe('what search draws as its answers come', () => {
  const typed = (text: string, over = '') => ({ text, over, settled: text, submitted: false });
  const suggesting = (...titles: string[]): SearchLoaded => ({
    data: {
      ...empty,
      suggestions: titles.map((title) => ({ title, meta: 'Album', query: title, icon: 'search' })),
    },
    found: true,
  });
  const found = (title: string): SearchLoaded => ({
    data: { ...empty, top: { ...empty.top, title } },
    found: true,
  });
  const titles = (drawn: SearchDrawn) => drawn.data.suggestions.map((s) => s.title);

  it('draws the suggestions for the text that settled, the field holding the draft', () => {
    const drawn = searchLive('', typed('ri'), empty).draw({ data: suggesting('Rise') }, null);
    expect(drawn.state).toBe('suggest');
    expect(titles(drawn)).toEqual(['Rise']);
    expect(drawn.data.query).toBe('ri');
  });

  it('keeps the last suggestions drawn while the next load, and draws none when they fail', () => {
    const before = searchLive('', typed('ri'), empty).draw({ data: suggesting('Rise') }, null);
    const live = searchLive('', typed('meg'), empty);
    const loading = live.draw(undefined, before);
    expect(titles(loading)).toEqual(['Rise']);
    expect(loading.data.query).toBe('meg');
    expect(titles(live.draw('failed', before))).toEqual([]);
  });

  it('draws the results of a search that found something', () => {
    const drawn = searchLive('ri', null, empty).draw({ data: found('Rise') }, null);
    expect(drawn.state).toBe('full');
    expect(drawn.data.top.title).toBe('Rise');
    expect(drawn.data.query).toBe('ri');
  });

  it('draws the page’s empty state when a search finds nothing, and its failed state when it fails', () => {
    const none = searchLive('zz', null, empty).draw({ data: { data: empty, found: false } }, null);
    expect(none.state).toBe('empty');
    const failed = searchLive('zz', null, empty).draw('failed', null);
    expect(failed.state).toBe('failed');
    expect(failed.data.top.title).toBe('');
  });

  it('keeps what it drew while a search loads, the earlier results or the suggestions, never empty rows', () => {
    const live = searchLive('po', null, empty);
    const earlier = searchLive('ri', null, empty).draw({ data: found('Rise') }, null);
    const kept = live.draw(undefined, earlier);
    expect(kept.state).toBe('full');
    expect(kept.data.top.title).toBe('Rise');
    expect(kept.data.query).toBe('po');
    const suggested = searchLive('', typed('po'), empty).draw({ data: suggesting('Poems') }, null);
    expect(live.draw(undefined, suggested).state).toBe('suggest');
    expect(titles(live.draw(undefined, suggested))).toEqual(['Poems']);
    expect(live.draw(undefined, null)).toEqual({
      state: 'suggest',
      data: { ...empty, query: 'po' },
    });
  });

  it('draws the newest settled text’s suggestions when the answers come out of order', async () => {
    const pages = createPageStore({ onSignedOut: () => undefined });
    const held = new Map<string, (loaded: SearchLoaded) => void>();
    let last: SearchDrawn | null = null;
    /** Types `text`, asks for its suggestions as the page does, and draws what is kept. */
    const typing = (text: string) => {
      const live = searchLive('', typed(text), empty);
      const key = pageKey('search', live.asks!);
      void pages.load(key, () => new Promise((resolve) => held.set(text, resolve)));
      return () => {
        last = live.draw(
          answerFrom(pages.peek(key) as SearchLoaded | undefined, pages.failed(key)),
          last,
        );
        return titles(last);
      };
    };
    const drawR = typing('r');
    expect(drawR()).toEqual([]);
    held.get('r')!(suggesting('Rumours'));
    await Promise.resolve();
    expect(drawR()).toEqual(['Rumours']);
    typing('ri');
    const drawRis = typing('ris');
    expect(drawRis()).toEqual(['Rumours']);
    held.get('ris')!(suggesting('Rise and Shine'));
    await Promise.resolve();
    expect(drawRis()).toEqual(['Rise and Shine']);
    held.get('ri')!(suggesting('Rise'));
    await Promise.resolve();
    expect(drawRis()).toEqual(['Rise and Shine']);
  });
});
