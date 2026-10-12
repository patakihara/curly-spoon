import {
  ItemDetail,
  LibraryList,
  type LibraryMedium,
  ListeningSessionList,
  parseMediaRefKey,
  type QueueType,
  QueueView,
} from '@auralis/schema';
import { type ApiClient } from '../api/client';
import { SignedOut } from './store';

/**
 * What the pages read from the API, each answer parsed with the schema's zod: a library list, one
 * book, show or album, and this device's queues. A refusal for want of a sign-in throws
 * `SignedOut`; any other failure throws too, and the page keeps what it had.
 */

/** The answer's data parsed, or why there is none. */
async function answer<T>(
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

/** The book, show or album `ref` names, as it sits in the page's address; none for anything else. */
export const loadItem = (api: ApiClient, ref: string | undefined): Promise<ItemDetail> => {
  if (ref === undefined || parseMediaRefKey(ref) === null) {
    return Promise.reject(new Error(`no item ${ref}`));
  }
  return answer(api.GET('/api/items/{ref}', { params: { path: { ref } } }), (d) =>
    ItemDetail.parse(d),
  );
};

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
