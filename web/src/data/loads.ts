import {
  ItemDetail,
  LibraryList,
  type LibraryMedium,
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
 * book, show or album, your lists, this device's queues, and search's suggestions and results. A refusal for
 * want of a sign-in throws `SignedOut`; any other failure throws too, and the page keeps what it
 * had.
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

export const loadLibrary = (api: ApiClient, medium: LibraryMedium): Promise<LibraryList> =>
  answer(api.GET('/api/library/{medium}', { params: { path: { medium } } }), (d) =>
    LibraryList.parse(d),
  );

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

/** The book, show, episode or album `ref` names, as it sits in the page's address; else none. */
export const loadItem = (api: ApiClient, ref: string | undefined): Promise<ItemDetail> => {
  if (ref === undefined || parseMediaRefKey(ref) === null) {
    return Promise.reject(new Error(`no item ${ref}`));
  }
  return answer(api.GET('/api/items/{ref}', { params: { path: { ref } } }), (d) =>
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
): Promise<{ library: LibraryList; lists: ListSummary[] | null }> {
  const [library, lists] = await Promise.allSettled([
    loadLibrary(api, 'podcasts'),
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
