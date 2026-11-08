import {
  mediaRefKey,
  type SearchBook,
  type SearchKind,
  type SearchResult,
  type SearchResults,
  type SearchSong,
  type SuggestionKind,
  type SuggestionList,
} from '@auralis/schema';
import { type ApiClient } from '../api/client';
import { type SearchData } from '../generated/pages/Search';
import { type PlayerHeard, type PlayQueue } from '../player';
import { type Refused } from '../player/store';
import { type Draft, searchText } from '../query';
import { requestKey, requestOf } from '../request';
import { artAt, emptied } from './format';
import { statusOf } from './library';
import { loadSearch, loadSuggest } from './loads';
import { type Answer } from './store';

/**
 * Search's data from `GET /api/search/suggest` and `GET /api/search`: each suggestion as a row
 * that runs its search, and each result as a row that opens its page (a song its album) and whose
 * art plays it. The best result of all is the top one, the rest go in or out of your library as
 * the server says, and every one of them plays: what the household has that you have not played
 * or asked for is outside your library, and plays through Auralis's own account. A book the library
 * lacks is a row of its own there, asked for with a tap, its string ref carrying its request. Once
 * anyone has asked, its row draws only where that request stands and leads to Requests; once the
 * request brought it, its row opens and plays the item it became. A tap that did not go through
 * leaves its button, as no request stands yet. A song from YouTube Music plays from its art and
 * opens nothing; while music plays its own button puts it next, as a song of the household's does,
 * and why it would not play, or was stepped over, takes the page's one banner, as does streaming
 * being unavailable. The page's own
 * words (its placeholder, its kinds) stay as given; what it says when a search finds nothing or
 * fails is written in the page, which this only chooses the state of.
 * The kinds' names and the meta lines are written here, as the library homes write theirs, until
 * M5.strings and M5.formats.
 */

type Row = SearchData['top'][number];
type SuggestionRow = SearchData['suggestions'][number];
type BookRow = SearchData['outside']['books'][number];
type SongRow = SearchData['outside']['music'][number];

/** What each kind of result or suggestion is called. */
const KIND_LABELS: Record<SuggestionKind, string> = {
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
    next: '',
  };
}

/**
 * One book the library lacks as its row, in the list of the three that says what the row does. Who reads it and when tells one edition from another, as
 * the catalogue lists several of a title.
 */
export function bookRowOf(book: SearchBook): BookRow {
  const row = {
    title: book.title,
    meta: ['Book', book.author, book.narrator, book.year === null ? null : String(book.year)]
      .filter((part) => part !== null)
      .join(' · '),
    image: artAt(book.art, 'small'),
  };
  const none = { asking: [], standing: [], arrived: [] };
  if (book.status === null) {
    const asking = {
      ...row,
      ref: requestKey(book.ref),
      status: null,
      tone: null,
      action: 'Request',
    };
    return { ...none, asking: [asking] } as BookRow;
  }
  const { status, tone } = statusOf({
    kind: 'requested',
    status: book.status,
    ...(book.status === 'downloading' ? { progress: book.progress ?? 0 } : {}),
  });
  const stands = { ...row, status, tone };
  return (
    book.status === 'inLibrary' && book.item !== null
      ? { ...none, arrived: [{ ...stands, ref: mediaRefKey(book.item) }] }
      : { ...none, standing: [stands] }
  ) as BookRow;
}

/**
 * Search's data saying what a tap asking for a book left: on the row `failure` names, that it did
 * not go through; a failure naming no row, in the page's banner.
 */
export function searchRequestFailed(data: SearchData, failure: string): SearchData {
  if (requestOf(failure) === null) return { ...data, errors: [{ message: failure }] };
  const said = (book: BookRow) =>
    ({
      ...book,
      asking: book.asking.map((row) =>
        row.ref === failure ? { ...row, status: 'Request failed', tone: 'error' } : row,
      ),
    }) as BookRow;
  return { ...data, outside: { ...data.outside, books: data.outside.books.map(said) } };
}

/** What Search says while no song from outside the library can play. */
const STREAMING_UNAVAILABLE = 'Streaming unavailable. Your own music still plays.';

/** Why a streamed song did not play, by the server's word; any other: that it did not. */
const REFUSED: Record<string, string> = {
  song_live: 'This song is a live stream, so it can’t play here.',
  song_premiere: 'This song hasn’t premiered yet.',
  song_no_length: 'This song has no set length, so it can’t play here.',
  song_region_blocked: 'This song isn’t available in this country.',
  song_members_only: 'This song is only for a channel’s members.',
  not_found: 'This song is no longer on YouTube Music.',
  unsupported_format: 'This song is too long to play here.',
  streaming_unavailable: STREAMING_UNAVAILABLE,
};
const COULD_NOT_PLAY = 'This song could not play.';

/**
 * What the one banner says of a refusal: why, and for one met in a queue, that the music went on;
 * or that the music stopped, autoplay having nothing after the queue.
 */
function refusedMessage({ error, skipped, stoppedAfter, ranOut }: Refused): string {
  if (ranOut === true) return 'Stopped: autoplay found nothing to play after this song.';
  if (stoppedAfter !== undefined) {
    return `Stopped: ${stoppedAfter} songs in a row could not play.`;
  }
  const why = REFUSED[error ?? ''] ?? COULD_NOT_PLAY;
  if (skipped === undefined) return why;
  return `${skipped.title === null ? 'Skipped a song' : `Skipped “${skipped.title}”`}. ${why}`;
}

/** One song from YouTube Music as its row, in the list of the two that says what its button does. */
export function songRowOf(song: SearchSong): SongRow {
  const row = {
    title: song.title,
    meta: ['Song', 'Streams', song.artists.join(', '), song.album]
      .filter((part) => part !== null && part !== '')
      .join(' · '),
    image: artAt(song.art, 'small'),
    playRef: mediaRefKey(song.ref),
  };
  return { plays: [row], follows: [] } as SongRow;
}

/** Whether a row of the household's is one song: it opens its album, and plays itself. */
const isSong = ({ page, ref, playRef }: Row) => page === 'album' && ref !== playRef;

/**
 * Search's data as the player has it: while music is loaded a song's button says Play next, the
 * household's own songs and the streamed alike, and a song the server refused, or the player
 * stepped over, says why in the banner, in place of anything it said.
 */
export function searchHeard(data: SearchData, heard: PlayerHeard): SearchData {
  const said = (song: SongRow) =>
    ({
      plays: heard.music ? [] : [...song.plays, ...song.follows],
      follows: heard.music ? [...song.plays, ...song.follows] : [],
    }) as SongRow;
  const held = (row: Row): Row => ({ ...row, next: heard.music && isSong(row) ? 'Play next' : '' });
  const { refused } = heard;
  return {
    ...data,
    top: data.top.map(held),
    library: data.library.map(held),
    outside: {
      ...data.outside,
      household: data.outside.household.map(held),
      music: data.outside.music.map(said),
    },
    errors: refused === null ? data.errors : [{ message: refusedMessage(refused) }],
  };
}

/** The way to Requests, drawn while the person has any request, whatever the search shows. */
const yourRequests = (has: boolean): SearchData['yourRequests'] =>
  has ? [{ title: 'Your requests' }] : [];

/** Search while a query is typed: its suggestions, each running its search, and no results. */
export function suggestData(list: SuggestionList, page: SearchData): SearchData {
  return {
    ...page,
    yourRequests: yourRequests(list.hasRequests),
    suggestions: list.suggestions.map((s): SuggestionRow => ({
      title: s.text,
      meta: KIND_LABELS[s.kind],
      query: s.text,
      icon: s.kind === 'recent' ? 'history' : 'search',
    })),
  };
}

/** Search's results: the best of all on top, the rest in or out of your library. */
export function searchData(answer: SearchResults, page: SearchData): SearchData {
  const [best, ...rest] = answer.results;
  const rows = (inYourLibrary: boolean) =>
    rest.filter((result) => result.inYourLibrary === inYourLibrary).map(rowOf);
  return {
    ...page,
    yourRequests: yourRequests(answer.hasRequests),
    top: best === undefined ? [] : [rowOf(best)],
    library: rows(true),
    outside: {
      ...page.outside,
      household: rows(false),
      books: answer.books.map(bookRowOf),
      music: answer.songs.map(songRowOf),
    },
    errors: answer.streaming === 'unavailable' ? [{ message: STREAMING_UNAVAILABLE }] : [],
  };
}

/** Search with nothing found yet: its own words as the canvas has them, every row empty. */
export function emptySearch(page: SearchData): SearchData {
  const { placeholder, kinds, activeFilters } = page;
  return { ...emptied(page), placeholder, kinds, activeFilters };
}

/** What Search asks the server for: suggestions for some text, or the results of a search. */
type SearchAsk = { suggest: string } | { q: string };

/** What Search draws: its state, what it asks for (null: nothing yet), and the field's text. */
interface SearchView {
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

/**
 * What Search loaded: the page's data, whether a search found anything, and whether a book it lists
 * is on its way, so the page should look again.
 */
export interface SearchLoaded {
  data: SearchData;
  found: boolean;
  moving: boolean;
}

const movingBook = ({ status }: SearchBook) =>
  status !== null && status !== 'failed' && status !== 'inLibrary';

/** Loads what Search asks for, over `page`: suggestions alone, or a search's results. */
export async function loadSearchPage(
  api: ApiClient,
  asks: { suggest?: string; q?: string },
  page: SearchData,
): Promise<SearchLoaded> {
  if (asks.suggest !== undefined) {
    const list = await loadSuggest(api, asks.suggest);
    return { data: suggestData(list, page), found: true, moving: false };
  }
  const answer = await loadSearch(api, asks.q ?? '');
  return {
    data: searchData(answer, page),
    found: answer.results.length + answer.books.length + answer.songs.length > 0,
    moving: answer.books.some(movingBook),
  };
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
 * what was drawn stays, the earlier search's results or the suggestions, never empty rows. A failed
 * answer cannot say whether the person has requests, so the way to them stays as it last was.
 */
export function searchLive(q: string, draft: Draft | null, page: SearchData) {
  const view = searchView(q, draft);
  const choose = (answer: Answer<SearchLoaded>, last: SearchDrawn | null): SearchDrawn => {
    const offered = { ...page, yourRequests: last?.data.yourRequests ?? page.yourRequests };
    const nothing: SearchDrawn = { state: 'suggest', data: offered };
    if (view.state === 'suggest') {
      if (answer === 'failed') return nothing;
      if (answer !== undefined) return { state: 'suggest', data: answer.data.data };
      return last?.state === 'suggest' ? last : nothing;
    }
    if (answer === 'failed') return { state: 'failed', data: offered };
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
