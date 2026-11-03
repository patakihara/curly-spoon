import {
  EpisodeOrder,
  Feed,
  ItemDetail,
  LIBRARY_SEED_MAX,
  LibraryList,
  type LibraryMedium,
  LibrarySort,
  ListDetail,
  type ListSummary,
  ListSummaryList,
  ListeningSessionList,
  parseMediaRefKey,
  type QueueType,
  QueueView,
  SearchResults,
  SuggestionList,
} from '@auralis/schema';
import { type ApiClient } from '../api/client';
import { SignedOut } from './store';

/**
 * What the pages read from the API, each answer parsed with the schema's zod: a library list, one
 * book, show or album, Browse's shelves, your lists, this device's queues, and search's suggestions
 * and results. A refusal for want of a sign-in throws `SignedOut`; any other failure throws too,
 * and the page keeps what it had.
 */

/** The answer's data parsed, or why there is none. */
export async function answer<T>(
  asked: Promise<{ data?: unknown; response: Response }>,
  parse: (data: unknown) => T,
): Promise<T> {
  const { data, response } = await asked;
  if (response.status === 401) throw new SignedOut();
  if (data === undefined) throw new Error(`answered ${response.status}`);
  return parse(data);
}

/** The order a library list is asked in: a sort, title when absent, and a seed with random. */
export interface LibraryAsk {
  sort?: LibrarySort;
  seed?: number;
}

/**
 * The order a library home's address asks for (`?sort&seed`): a sort the server takes, and with
 * random a seed of plain digits in range. Anything else is ignored rather than refused, so a stale
 * or mistyped address still draws its page, in title order or a fresh shuffle.
 */
export function libraryAsk(params: Readonly<Record<string, string | undefined>>): LibraryAsk {
  const sort = LibrarySort.safeParse(params.sort);
  if (!sort.success) return {};
  const seed = /^\d+$/.test(params.seed ?? '') ? Number(params.seed) : NaN;
  return sort.data === 'random' && seed <= LIBRARY_SEED_MAX
    ? { sort: sort.data, seed }
    : { sort: sort.data };
}

/**
 * The query values a library home's address settles on once the server answers in `seed`'s
 * shuffle (null unless random): random with that seed, when the address asked for random without
 * a seed it takes, so a reload keeps the order; else null, which leaves the address as it is. An
 * address holding the seed answered gives null, so it settles once.
 */
export function settledAddress(
  params: Readonly<Record<string, string | undefined>>,
  seed: number | null,
): { sort: 'random'; seed: string } | null {
  return seed === null || libraryAsk(params).seed === seed
    ? null
    : { sort: 'random', seed: String(seed) };
}

export const loadLibrary = (
  api: ApiClient,
  medium: LibraryMedium,
  ask: LibraryAsk = {},
): Promise<LibraryList> =>
  answer(api.GET('/api/library/{medium}', { params: { path: { medium }, query: ask } }), (d) =>
    LibraryList.parse(d),
  );

/** Browse's shelves: Up next, then your second most recent book and show. */
export const loadFeed = (api: ApiClient): Promise<Feed> =>
  answer(api.GET('/api/feed'), (d) => Feed.parse(d));

/** Browse's shelves, or none when they could not be read; a refusal for want of a sign-in throws. */
export const feedOrNone = (api: ApiClient): Promise<Feed> =>
  loadFeed(api).catch((error: unknown) => {
    if (error instanceof SignedOut) throw error;
    return { shelves: [] };
  });

/**
 * The three library lists, books, podcasts and music; a list that fails is left out, but a
 * refusal for want of a sign-in still throws.
 */
export async function loadLibraries(api: ApiClient): Promise<LibraryList[]> {
  const settled = await Promise.allSettled(
    (['books', 'podcasts', 'music'] as const).map((medium) => loadLibrary(api, medium)),
  );
  const refused = settled.find((s) => s.status === 'rejected' && s.reason instanceof SignedOut);
  if (refused !== undefined) throw new SignedOut();
  return settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
}

/**
 * The order a show's address asks its episodes in (`?sort`): oldest or newest first, else none,
 * the show's own; anything else is ignored rather than refused, so a stale address still draws.
 */
export function episodeAsk(params: Readonly<Record<string, string | undefined>>): {
  sort?: EpisodeOrder;
} {
  const sort = EpisodeOrder.safeParse(params.sort);
  return sort.success ? { sort: sort.data } : {};
}

/**
 * The book, show, episode or album `ref` names, as it sits in the page's address, a show's
 * episodes in the order `ask` names; else none.
 */
export const loadItem = (
  api: ApiClient,
  ref: string | undefined,
  ask: { sort?: EpisodeOrder } = {},
): Promise<ItemDetail> => {
  if (ref === undefined || parseMediaRefKey(ref) === null) {
    return Promise.reject(new Error(`no item ${ref}`));
  }
  return answer(api.GET('/api/items/{ref}', { params: { path: { ref }, query: ask } }), (d) =>
    ItemDetail.parse(d),
  );
};

/** The list `id` names, as it sits in the page's address; else none. */
export const loadList = (api: ApiClient, id: string | undefined): Promise<ListDetail> => {
  if (id === undefined || id === '') return Promise.reject(new Error('no list'));
  return answer(api.GET('/api/lists/{id}', { params: { path: { id } } }), (d) =>
    ListDetail.parse(d),
  );
};

/** Your lists, The Digest first, each with what its card draws. */
export const loadLists = async (api: ApiClient): Promise<ListSummary[]> =>
  (await answer(api.GET('/api/lists'), (d) => ListSummaryList.parse(d))).lists;

/** Your lists, or null when they could not be read; a refusal for want of a sign-in still throws. */
export const listsOrNone = (api: ApiClient): Promise<ListSummary[] | null> =>
  loadLists(api).catch((error: unknown) => {
    if (error instanceof SignedOut) throw error;
    return null;
  });

/**
 * The Podcasts page's shows and lists. Lists that fail are null, so the shows still draw; a
 * refusal for want of a sign-in still throws, and so do shows that fail.
 */
export async function loadPodcasts(
  api: ApiClient,
  ask: LibraryAsk = {},
): Promise<{ library: LibraryList; lists: ListSummary[] | null }> {
  const [library, lists] = await Promise.allSettled([
    loadLibrary(api, 'podcasts', ask),
    listsOrNone(api),
  ]);
  if (lists.status === 'rejected') throw lists.reason;
  if (library.status === 'rejected') throw library.reason;
  return { library: library.value, lists: lists.value };
}

const loadQueue = (api: ApiClient, type: QueueType) =>
  answer(api.GET('/api/queues/{type}', { params: { path: { type } } }), (d) => QueueView.parse(d));

/**
 * This device's queue the controls drive and, when the session moves over to the other queue after
 * the current item, that one too; null with no session yet.
 */
export async function loadQueues(
  api: ApiClient,
): Promise<{ active: QueueView; then: QueueView | null } | null> {
  const { sessions } = await answer(api.GET('/api/sessions'), (d) => ListeningSessionList.parse(d));
  const mine = sessions.find((s) => s.thisDevice);
  if (mine === undefined) return null;
  const switching = mine.switchAfterCurrent;
  const [active, then] = await Promise.all([
    loadQueue(api, mine.active),
    switching === null ? null : loadQueue(api, switching),
  ]);
  return { active, then };
}

/** Suggestions for what is typed so far: recent searches alone while nothing is. */
export const loadSuggest = (api: ApiClient, q: string): Promise<SuggestionList> =>
  answer(api.GET('/api/search/suggest', { params: { query: { q } } }), (d) =>
    SuggestionList.parse(d),
  );

/** The results of searching for `q`, of every kind. */
export const loadSearch = (api: ApiClient, q: string): Promise<SearchResults> =>
  answer(api.GET('/api/search', { params: { query: { q } } }), (d) => SearchResults.parse(d));
