import {
  mediaRefKey,
  type SearchKind,
  type SearchResult,
  type SearchResults,
  type SuggestionKind,
  type SuggestionList,
} from '@auralis/schema';
import { type ApiClient } from '../api/client';
import { type SearchData } from '../generated/pages/Search';
import { type PlayQueue } from '../player';
import { type Draft, searchText } from '../query';
import { artAt, emptied } from './format';
import { loadSearch, loadSuggest } from './loads';
import { type Answer } from './store';

/**
 * Search's data from `GET /api/search/suggest` and `GET /api/search`: each suggestion as a row
 * that runs its search, and each result as a row that opens its page (a song its album) and whose
 * art plays it. The best result is the top one, the rest are in your library, and nothing is
 * outside it before M3.catalog. The page's own words (its placeholder, its kinds) stay as given;
 * what it says when a search finds nothing or fails is written in the page, which this only
 * chooses the state of.
 * The kinds' names and the meta lines are written here, as the library homes write theirs, until
 * M5.strings and M5.formats.
 */

type Row = SearchData['top'];
type SuggestionRow = SearchData['suggestions'][number];

/** What each kind of result or suggestion is called. */
export const KIND_LABELS: Record<SuggestionKind, string> = {
  track: 'Song',
  album: 'Album',
  artist: 'Artist',
  book: 'Book',
  author: 'Author',
  series: 'Series',
  show: 'Podcast',
  episode: 'Episode',
  recent: 'Recent',
};

/**
 * The page a result opens, and the queue its art plays on. A song opens its album; a show plays
 * nothing from its row; an artist, author or series has no page yet, so its row opens nothing.
 */
const KINDS: Record<
  SearchKind,
  { page: string; queue: PlayQueue; opens: boolean; plays: boolean }
> = {
  track: { page: 'album', queue: 'music', opens: true, plays: true },
  album: { page: 'album', queue: 'music', opens: true, plays: true },
  book: { page: 'book', queue: 'spoken', opens: true, plays: true },
  episode: { page: 'episode', queue: 'spoken', opens: true, plays: true },
  show: { page: 'show', queue: 'spoken', opens: true, plays: false },
  artist: { page: 'artist', queue: 'music', opens: false, plays: false },
  author: { page: 'author', queue: 'spoken', opens: false, plays: false },
  series: { page: 'series', queue: 'spoken', opens: false, plays: false },
};

/** What a result is, who it is by, and its album or show: `Song · Chappell Roan · The Rise…`. */
export function metaOf(result: SearchResult): string {
  return [KIND_LABELS[result.kind], result.creators.join(', '), result.parent?.title ?? '']
    .filter((part) => part !== '')
    .join(' · ');
}

/** One result as its row. */
export function rowOf(result: SearchResult): Row {
  const kind = KINDS[result.kind];
  const opened = result.kind === 'track' ? result.parent?.ref : result.ref;
  return {
    title: result.title,
    meta: metaOf(result),
    image: artAt(result.art, 'small'),
    page: kind.page,
    ref: kind.opens && opened !== undefined ? mediaRefKey(opened) : '',
    playRef: kind.plays ? mediaRefKey(result.ref) : '',
    queue: kind.queue,
  };
}

/** Search while a query is typed: its suggestions, each running its search, and no results. */
export function suggestData(list: SuggestionList, page: SearchData): SearchData {
  return {
    ...page,
    suggestions: list.suggestions.map((s): SuggestionRow => ({
      title: s.text,
      meta: KIND_LABELS[s.kind],
      query: s.text,
      icon: s.kind === 'recent' ? 'history' : 'search',
    })),
  };
}

/** Search's results: the best on top, the rest in your library. */
export function searchData(answer: SearchResults, page: SearchData): SearchData {
  const [top, ...rest] = answer.results.map(rowOf);
  return { ...page, ...(top === undefined ? {} : { top }), library: rest };
}

/** Search with nothing found yet: its own words as the canvas has them, every row empty. */
export function emptySearch(page: SearchData): SearchData {
  const { placeholder, kinds, activeFilters } = page;
  return { ...emptied(page), placeholder, kinds, activeFilters };
}

/** What Search asks the server for: suggestions for some text, or the results of a search. */
export type SearchAsk = { suggest: string } | { q: string };

/** What Search draws: its state, what it asks for (null: nothing yet), and the field's text. */
export interface SearchView {
  state: 'suggest' | 'full';
  asks: SearchAsk | null;
  query: string;
}

/**
 * What Search draws for the search it shows, `q` ('' for none), and the draft typed over it. The
 * field always holds the draft as it is typed, or else the search. The results show while the
 * field holds the search shown; suggestions while it holds anything else, or no search is shown,
 * asked for what has settled of the draft, and with no draft, for recent searches alone.
 */
export function searchView(q: string, draft: Draft | null): SearchView {
  const query = draft?.text ?? q;
  if (q.trim() !== '' && query === q) return { state: 'full', asks: { q: searchText(q) }, query };
  if (draft === null) return { state: 'suggest', asks: { suggest: '' }, query };
  return {
    state: 'suggest',
    asks: draft.settled === null ? null : { suggest: searchText(draft.settled) },
    query,
  };
}

/** What Search loaded: the page's data, and whether a search found anything. */
export interface SearchLoaded {
  data: SearchData;
  found: boolean;
}

/** Loads what Search asks for, over `page`: suggestions alone, or a search's results. */
export async function loadSearchPage(
  api: ApiClient,
  asks: { suggest?: string; q?: string },
  page: SearchData,
): Promise<SearchLoaded> {
  if (asks.suggest !== undefined) {
    return { data: suggestData(await loadSuggest(api, asks.suggest), page), found: true };
  }
  const answer = await loadSearch(api, asks.q ?? '');
  return { data: searchData(answer, page), found: answer.results.length > 0 };
}

/** What Search draws: its state, and its data with the field's text. */
export interface SearchDrawn {
  state: 'suggest' | 'full' | 'empty' | 'failed';
  data: SearchData;
}

/**
 * Search for the search it shows, `q`, and the draft typed over it (null if typed over another):
 * what it asks for, and what it draws given the answer (undefined while it loads) and what it drew
 * last. Suggestions are drawn only for the text they answer: the last ones stay while the next
 * load, and none are drawn when they fail. Results are drawn once found; a search that found
 * nothing draws the page's empty state, and one that failed its failed state. While a search loads,
 * what was drawn stays, the earlier search's results or the suggestions, never empty rows.
 */
export function searchLive(q: string, draft: Draft | null, page: SearchData) {
  const view = searchView(q, draft);
  const choose = (answer: Answer<SearchLoaded>, last: SearchDrawn | null): SearchDrawn => {
    const nothing: SearchDrawn = { state: 'suggest', data: page };
    if (view.state === 'suggest') {
      if (answer === 'failed') return nothing;
      if (answer !== undefined) return { state: 'suggest', data: answer.data.data };
      return last?.state === 'suggest' ? last : nothing;
    }
    if (answer === 'failed') return { state: 'failed', data: page };
    if (answer !== undefined) {
      return { state: answer.data.found ? 'full' : 'empty', data: answer.data.data };
    }
    return last ?? nothing;
  };
  return {
    asks: view.asks,
    draw(answer: Answer<SearchLoaded>, last: SearchDrawn | null): SearchDrawn {
      const drawn = choose(answer, last);
      return { state: drawn.state, data: { ...drawn.data, query: view.query } };
    },
  };
}
