import {
  type RequestCandidate,
  type RequestFailure,
  type RequestList,
  type RequestMedium,
  type RequestVerb,
  type RequestView,
} from '@auralis/schema';
import { type ApiClient } from '../api/client';
import { type RequestsData } from '../generated/pages/Requests';
import { artAt, bytes } from './format';
import { statusOf } from './library';
import { SignedOut } from './store';

/**
 * The Requests page's data from `GET /api/requests`, and its verbs. Each row names what it is, who
 * by, and its release's source and size once it has one, and says where it stands in the words a
 * library card uses. A failed row says why, and offers to retry, or, with other releases left, the
 * next one in a tap. The words are written here, as the library homes write theirs, until
 * M5.strings.
 */

const MEDIUM_LABELS: Record<RequestMedium, string> = {
  book: 'Book',
  album: 'Album',
  song: 'Song',
  podcast: 'Podcast',
};

const FAILURES: Record<RequestFailure, string> = {
  noRelease: 'No release was found',
  searchFailed: 'The search failed',
  downloadFailed: 'The download failed',
  importFailed: 'The import failed',
  notIndexed: 'It never reached the library',
  cancelledUpstream: 'The download was cancelled',
};

const line = (...parts: (string | null)[]) =>
  parts.filter((part): part is string => part !== null && part !== '').join(' · ');

const sizeOf = (size: number | null) => (size === null ? null : bytes(size));

/** A request's status, in the words and the tone a library card uses. */
const statusWords = (request: RequestView) => {
  const { status, tone } = statusOf({
    kind: 'requested',
    status: request.status,
    ...(request.status === 'downloading' ? { progress: request.progress ?? 0 } : {}),
  });
  return { status: status ?? '', tone: tone ?? '' };
};

const firstLine = (request: RequestView) => [MEDIUM_LABELS[request.medium], request.creator];

const row = (request: RequestView) => ({
  id: request.id,
  title: request.title,
  image: artAt(request.art, 'small'),
  ...statusWords(request),
});

/** A row's one action: retrying what failed, cancelling anything else. */
const action = (request: RequestView) =>
  request.status === 'failed'
    ? { action: 'Retry', actionIcon: 'refresh', verb: 'retry' }
    : { action: 'Cancel', actionIcon: 'close', verb: 'cancel' };

const reasonOf = (request: RequestView) =>
  request.reason === null ? null : FAILURES[request.reason];

const releases = (count: number) => (count === 1 ? '1 release' : `${count} releases`);

const candidateRow = (candidate: RequestCandidate) => ({
  id: candidate.id,
  title: candidate.title,
  meta: line(candidate.source, sizeOf(candidate.size)),
});

/** The page's data. A failed request with other releases left goes in `pickable`, under its row. */
export function requestsData(list: RequestList, page: RequestsData): RequestsData {
  const pickable = (request: RequestView) => request.verbs.includes('pickAnother');
  return {
    ...page,
    inFlight: list.inFlight
      .filter((request) => !pickable(request))
      .map((request) => ({
        ...row(request),
        ...action(request),
        meta: line(...firstLine(request), request.source, sizeOf(request.size), reasonOf(request)),
      })),
    pickable: list.inFlight.filter(pickable).map((request) => {
      const left = request.candidates.length;
      return {
        ...row(request),
        ...action(request),
        meta: line(...firstLine(request), request.source, sizeOf(request.size)),
        others: `${reasonOf(request) ?? 'It failed'}; ${releases(left)} left`,
        next: request.candidates[0]?.id ?? '',
      };
    }),
    needsChoice: list.needsChoice.map((request) => ({
      ...row(request),
      meta: line(
        ...firstLine(request),
        `${releases(request.candidates.length)}, none clearly best`,
      ),
      candidates: request.candidates.map(candidateRow),
    })),
  };
}

/** What the page draws: empty once nothing is left, in flight or waiting. */
export const requestsState = (list: RequestList): 'empty' | 'full' =>
  list.inFlight.length + list.needsChoice.length === 0 ? 'empty' : 'full';

/** Whether anything is moving by itself, so the page should look again: not a failed one. */
export const requestsMoving = (list: RequestList): boolean =>
  list.inFlight.some((request) => request.status !== 'failed');

/**
 * Does a verb to a request. A choice takes its candidate, and picking another is the same route,
 * from a failed request. A refusal for want of a sign-in throws `SignedOut`, any other throws too.
 */
export async function requestVerb(
  api: ApiClient,
  ref: string,
  verb: RequestVerb,
  candidate?: string,
): Promise<void> {
  const path = { params: { path: { id: ref } } };
  const { response } = await (verb === 'retry'
    ? api.POST('/api/requests/{id}/retry', path)
    : verb === 'cancel'
      ? api.POST('/api/requests/{id}/cancel', path)
      : api.POST('/api/requests/{id}/choose', {
          ...path,
          body: { candidate: candidate ?? '' },
        }));
  if (response.status === 401) throw new SignedOut();
  if (!response.ok) throw new Error(`${verb} answered ${response.status}`);
}
