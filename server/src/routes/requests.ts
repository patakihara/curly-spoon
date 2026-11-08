/**
 * Requests, as the person asking sees them. Everyone acts only on requests they are on: any other
 * id answers 404, as if it were not there. A list and a view carry raw values and what the person
 * can do now; releases' details and download handles stay here.
 *
 * Asking for what is already being got joins that request. If it had failed, joining retries it,
 * as someone has just asked for it, and everyone on it sees it move. What has already reached the
 * library holds no live key, so asking for it finds it there and the person gets their claim.
 *
 * A person may be on only so many live requests. Joining counts, as it can make the job do more; asking
 * again for one they are already on does not, and neither does what has reached the library.
 */
import {
  cancelRequest as cancelRequestRoute,
  chooseRelease as chooseReleaseRoute,
  createRequest as createRequestRoute,
  getRequest as getRequestRoute,
  listRequests,
  retryRequest as retryRequestRoute,
  type RequestCandidate,
  type RequestRef,
  type RequestVerb,
  type RequestView,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { indexedRow, topLevelOf } from '../libraryIndex/store.js';
import {
  ARRIVAL_CLAIM,
  cancelRequest,
  chooseRelease,
  otherReleases,
  pickAnotherRelease,
  type RequestActDeps,
  retryRequest,
} from '../requests/job.js';
import { Refusal, serve } from '../route.js';
import { addClaim } from '../store/claims.js';
import {
  arrivedRequests,
  createRequest,
  joinArrivedRequest,
  liveRequest,
  liveRequestCount,
  peopleOn,
  requestOf,
  requestsListed,
  type StoredRequest,
} from '../store/requests.js';
import { artUrl } from './art.js';
import { signedIn } from './auth.js';

const candidateOf = ({ id, title, source, size }: StoredRequest['candidates'][number]) =>
  ({ id, title, source, size }) satisfies RequestCandidate;

/** What a person can do to a request where it stands, and the candidates they can take. */
function actions(request: StoredRequest): {
  verbs: RequestVerb[];
  candidates: StoredRequest['candidates'];
} {
  switch (request.state.status) {
    case 'inLibrary':
      return { verbs: [], candidates: [] };
    case 'needsChoice':
      return { verbs: ['choose', 'cancel'], candidates: request.candidates };
    case 'failed': {
      const others = otherReleases(request);
      const verbs: RequestVerb[] = others.length > 0 ? ['retry', 'pickAnother'] : ['retry'];
      return { verbs: [...verbs, 'cancel'], candidates: others };
    }
    default:
      return { verbs: ['cancel'], candidates: [] };
  }
}

/** What asking for something takes. */
export type RequestDoorDeps = RequestActDeps & { maxLive: number };

/**
 * The one way in to a request, which `POST /requests` and `POST /keep` share: asking for a thing
 * (`askFor`), and a request as a person sees it (`viewOf`).
 */
export function requestDoor(deps: RequestDoorDeps) {
  const { db, log, now, steps, maxLive } = deps;

  const viewOf = (request: StoredRequest): RequestView => {
    const { state, result, release } = request;
    const indexed = result === null ? undefined : indexedRow(db, result.source, result.id);
    const { verbs, candidates } = steps.has(request.medium)
      ? actions(request)
      : {
          verbs: request.state.status === 'inLibrary' ? [] : (['cancel'] as const),
          candidates: [],
        };
    return {
      id: request.id,
      medium: request.medium,
      title: request.target.title,
      creator: request.target.creator,
      art: result !== null && indexed?.hasArt === true ? artUrl(result) : null,
      source: release?.source ?? null,
      size: release?.size ?? null,
      status: state.status,
      progress: state.status === 'downloading' ? state.progress : null,
      reason: state.status === 'failed' ? state.reason : null,
      verbs: [...verbs],
      candidates: candidates.map(candidateOf),
    };
  };

  /** The same thing's request that has reached the library, still in the index, if any. */
  const arrived = (ref: RequestRef) =>
    arrivedRequests(db, ref, log).find(
      ({ result }) => result !== null && indexedRow(db, result.source, result.id) !== undefined,
    );

  /**
   * Asks for a thing for a person: the request already in the library, with their claim on its
   * top-level item; the live one, joined, and retried if it had failed; or a new one.
   */
  const askFor = async (userId: string, ref: RequestRef): Promise<StoredRequest> => {
    if (!steps.has(ref.medium)) throw new Refusal(409, 'medium_unavailable');
    const there = arrived(ref);
    if (there?.result != null) {
      joinArrivedRequest(db, there.id, userId, ref, now());
      addClaim(db, userId, topLevelOf(db, there.result), ARRIVAL_CLAIM[there.medium], now());
      return there;
    }
    const live = liveRequest(db, ref, log);
    const holdsIt = live !== undefined && peopleOn(db, live.id).includes(userId);
    if (!holdsIt && liveRequestCount(db, userId, log) >= maxLive) {
      throw new Refusal(429, 'too_many_requests');
    }
    const made = createRequest(db, userId, ref, now(), log);
    const retried =
      made.joined && made.request.state.status === 'failed'
        ? await retryRequest(deps, made.request.id)
        : null;
    return retried ?? made.request;
  };

  return { askFor, viewOf };
}

export function requestRoutes(app: FastifyInstance, deps: RequestDoorDeps): void {
  const { db, log, steps } = deps;
  const { askFor, viewOf } = requestDoor(deps);

  /** The request a path names, if the signed-in person is on it. */
  const own = (request: FastifyRequest, id: string) => {
    const found = requestOf(db, id, signedIn(request).id, log);
    if (found === null) throw new Refusal(404, 'not_found');
    return found;
  };

  /** The same, for a move only its medium's steps can carry on from. */
  const movable = (request: FastifyRequest, id: string) => {
    const found = own(request, id);
    if (!steps.has(found.medium)) throw new Refusal(409, 'medium_unavailable');
    return found;
  };

  // A song is kept by `POST /keep`, which names it as search did: one door per medium.
  serve(app, createRequestRoute, async (request, _reply, { ref }) => {
    if (ref.medium === 'song') throw new Refusal(400, 'use_keep');
    return viewOf(await askFor(signedIn(request).id, ref));
  });

  serve(app, listRequests, (request) => {
    const views = requestsListed(db, signedIn(request).id, log).map(viewOf);
    return {
      inFlight: views.filter((view) => view.status !== 'needsChoice'),
      needsChoice: views.filter((view) => view.status === 'needsChoice'),
    };
  });

  serve(app, getRequestRoute, (request, _reply, _body, { params }) =>
    viewOf(own(request, params.id)),
  );

  serve(app, retryRequestRoute, async (request, _reply, _body, { params }) => {
    movable(request, params.id);
    const retried = await retryRequest(deps, params.id);
    if (retried === null) throw new Refusal(409, 'not_failed');
    return viewOf(retried);
  });

  serve(app, cancelRequestRoute, async (request, _reply, _body, { params }) => {
    const found = own(request, params.id);
    if (found.state.status === 'inLibrary') throw new Refusal(409, 'in_library');
    await cancelRequest(deps, found, signedIn(request).id);
    return { ok: true };
  });

  // One tap from a failed row makes both moves: back to the choice, then the choice. The candidate
  // is checked first, so a refused tap drops nothing.
  serve(app, chooseReleaseRoute, async (request, _reply, { candidate }, { params }) => {
    const found = movable(request, params.id);
    if (found.state.status === 'failed') {
      if (!otherReleases(found).some(({ id }) => id === candidate)) {
        throw new Refusal(409, 'not_offered');
      }
      await pickAnotherRelease(deps, params.id);
    }
    const chosen = chooseRelease(deps, params.id, candidate);
    if (chosen === null) throw new Refusal(409, 'not_offered');
    return viewOf(chosen);
  });
}
