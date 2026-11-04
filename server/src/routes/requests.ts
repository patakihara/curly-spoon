/**
 * Requests, as the person asking sees them. Everyone acts only on requests they are on: any other
 * id answers 404, as if it were not there. A list and a view carry raw values and what the person
 * can do now; releases' details and download handles stay here.
 *
 * Asking for what is already being got joins that request. If it had failed, joining retries it,
 * as someone has just asked for it, and everyone on it sees it move. What has already reached the
 * library holds no live key, so asking for it finds it there and the person gets their claim.
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
import { indexedRow } from '../libraryIndex/store.js';
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
  joinRequest,
  requestOf,
  requestsOf,
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

export function requestRoutes(app: FastifyInstance, deps: RequestActDeps): void {
  const { db, log, now, steps } = deps;

  /** The request a path names, if the signed-in person is on it. */
  const own = (request: FastifyRequest, id: string) => {
    const found = requestOf(db, id, signedIn(request).id, log);
    if (found === null) throw new Refusal(404, 'not_found');
    return found;
  };

  const viewOf = (request: StoredRequest): RequestView => {
    const { state, result, release } = request;
    const indexed = result === null ? undefined : indexedRow(db, result.source, result.id);
    const { verbs, candidates } = actions(request);
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
      verbs,
      candidates: candidates.map(candidateOf),
    };
  };

  /** The same thing's request that has reached the library, still in the index, if any. */
  const arrived = (ref: RequestRef) =>
    arrivedRequests(db, ref, log).find(
      ({ result }) => result !== null && indexedRow(db, result.source, result.id) !== undefined,
    );

  serve(app, createRequestRoute, async (request, _reply, { ref }) => {
    const user = signedIn(request);
    if (!steps.has(ref.medium)) throw new Refusal(409, 'medium_unavailable');
    const there = arrived(ref);
    if (there?.result != null) {
      joinRequest(db, there.id, user.id, now());
      addClaim(db, user.id, there.result, ARRIVAL_CLAIM[there.medium], now());
      return viewOf(there);
    }
    const made = createRequest(db, user.id, ref, now(), log);
    const retried =
      made.joined && made.request.state.status === 'failed'
        ? await retryRequest(deps, made.request.id)
        : null;
    return viewOf(retried ?? made.request);
  });

  serve(app, listRequests, (request) => {
    const shown = requestsOf(db, signedIn(request).id, log).filter(
      ({ medium, state }) => medium !== 'podcast' && state.status !== 'inLibrary',
    );
    const views = shown.map(viewOf);
    return {
      inFlight: views.filter((view) => view.status !== 'needsChoice'),
      needsChoice: views.filter((view) => view.status === 'needsChoice'),
    };
  });

  serve(app, getRequestRoute, (request, _reply, _body, { params }) =>
    viewOf(own(request, params.id)),
  );

  serve(app, retryRequestRoute, async (request, _reply, _body, { params }) => {
    own(request, params.id);
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
    const found = own(request, params.id);
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
