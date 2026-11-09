import {
  type RequestCandidate,
  type RequestFailure,
  type RequestList,
  type RequestMedium,
  type RequestRef,
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
 * library card uses. A failed row says why, and offers what its verbs allow: to retry, to cancel,
 * and, with other releases left, the next one in a tap. The words are written here, as the library homes write theirs, until
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
  downloadStalled: 'The download stalled',
  importFailed: 'The import failed',
  notIndexed: 'It never reached the library',
  cancelledUpstream: 'The download was cancelled',
  wrongRelease: 'The download was not the right release',
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

const reasonOf = (request: RequestView) =>
  request.reason === null ? null : FAILURES[request.reason];

const releases = (count: number) => (count === 1 ? '1 release' : `${count} releases`);

/** The audio format a release's title names, or null: `Paper Lanterns [FLAC]`. */
export const formatOf = (title: string): string | null =>
  /\b(FLAC|ALAC|MP3|AAC|OPUS|OGG|M4A|M4B|WAV)\b/i.exec(title)?.[1]?.toUpperCase() ?? null;

/** A release's row: what tells it from the others goes in its detail, which wraps on a phone. */
const candidateRow = (candidate: RequestCandidate) => ({
  id: candidate.id,
  title: candidate.title,
  detail: line(formatOf(candidate.title), candidate.source, sizeOf(candidate.size)),
});

/**
 * The page's data. A failed request it can retry goes in `failed`, or, with other releases left,
 * in `pickable`, under its row. One it cannot retry only cancels, as any other in flight. Why one
 * failed goes in its detail, which wraps on a phone where its meta is cut off.
 */
export function requestsData(list: RequestList, page: RequestsData): RequestsData {
  const pickable = (request: RequestView) => request.verbs.includes('pickAnother');
  const retries = (request: RequestView) => request.verbs.includes('retry');
  const inFlightRow = (request: RequestView) => ({
    ...row(request),
    meta: line(...firstLine(request), request.source, sizeOf(request.size)),
    detail: reasonOf(request) ?? '',
  });
  return {
    ...page,
    inFlight: list.inFlight.filter((request) => !retries(request)).map(inFlightRow),
    failed: list.inFlight
      .filter((request) => retries(request) && !pickable(request))
      .map(inFlightRow),
    pickable: list.inFlight.filter(pickable).map((request) => {
      const left = request.candidates.length;
      return {
        ...row(request),
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

const VERB_FAILURES: Record<RequestVerb, string> = {
  cancel: 'The request could not be cancelled. It stays as the server has it.',
  retry: 'The request could not be retried. It stays as the server has it.',
  choose: 'That release could not be chosen. The request stays as the server has it.',
  pickAnother: 'Another release could not be picked. The request stays as the server has it.',
};

/** What the page says when a verb fails. */
export const verbFailure = (verb: RequestVerb): string => VERB_FAILURES[verb];

/** What the page draws: empty once nothing is left, in flight or waiting. */
export const requestsState = (list: RequestList): 'empty' | 'full' =>
  list.inFlight.length + list.needsChoice.length === 0 ? 'empty' : 'full';

/** Whether anything is moving by itself, so the page should look again: not a failed one. */
export const requestsMoving = (list: RequestList): boolean =>
  list.inFlight.some((request) => request.status !== 'failed');

/** The server's refusal of one live request too many, which no row can put right. */
export class TooManyRequests extends Error {}

/** What the page's banner says of it. */
export const TOO_MANY_REQUESTS =
  'You have too many requests under way. Cancel one, or wait for one to finish, and ask again.';

/** Asks for something the library lacks, or joins the request for it already under way. */
export async function makeRequest(api: ApiClient, ref: RequestRef): Promise<void> {
  const { response, error } = await api.POST('/api/requests', { body: { ref } });
  if (response.status === 401) throw new SignedOut();
  if (response.status === 429 && (error as { error?: string })?.error === 'too_many_requests') {
    throw new TooManyRequests();
  }
  if (!response.ok) throw new Error(`a request answered ${response.status}`);
}

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
