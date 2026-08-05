/**
 * The book-request lifecycle, from the ask to the file landing in the library.
 *
 * The pipeline is `pending -> approved -> searching -> downloading -> importing ->
 * completed`, with `failed` reachable from any of the working states and `rejected`
 * reachable only from `pending`. The table below is the single source of truth for which
 * moves are legal — routes and services consult `canTransition` rather than re-deriving
 * the shape of the pipeline themselves.
 *
 * `importRequested` is a second, honest terminal state out of `importing` — a music
 * request's own, not a book one. `musicRequestService.ts`'s `pollOne` moves a request here
 * instead of `completed` once it has asked Jellyfin to rescan the music library
 * (`JellyfinClient.refreshItem`): that call is verified fire-and-forget with **no way to
 * observe whether the rescan actually finds the file** (see `refreshItem`'s doc comment in
 * `packages/jellyfin-client/src/client.ts`), unlike a book's `tryRescan`, whose own
 * Audiobookshelf call is equally unconfirmed but was already named `completed` before this
 * distinction was drawn (`requestService.ts`, unchanged here). Calling the music case
 * `completed` would claim a confirmation this codebase does not have; `importRequested`
 * says exactly what happened instead — a request that reaches it needs no further action,
 * so it is terminal (see `isTerminal`), but it is not a claim of success.
 */

export type RequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'searching'
  | 'downloading'
  | 'importing'
  | 'completed'
  | 'importRequested'
  | 'failed';

/**
 * Every status, in pipeline order.
 *
 * Typed as a `const` tuple rather than `readonly RequestStatus[]` so it can be handed
 * straight to `z.enum(...)` at the route boundary. An array type widens to `string[]` there
 * and forces a cast, and a cast is exactly the thing that lets this list and the schema
 * that validates against it drift apart. `satisfies` keeps the compiler checking that the
 * tuple still covers the union.
 */
export const REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'searching',
  'downloading',
  'importing',
  'completed',
  'importRequested',
  'failed',
] as const satisfies readonly RequestStatus[];

const TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  pending: ['approved', 'rejected'],
  approved: ['searching', 'failed'],
  searching: ['downloading', 'failed'],
  downloading: ['importing', 'failed'],
  // Two distinct terminal moves out of `importing` — see this file's header comment for
  // why music's `importRequested` is not folded into `completed`.
  importing: ['completed', 'importRequested', 'failed'],
  // Retry: a failed grab or import goes back to the top of the search pipeline rather
  // than being resurrected at whichever stage it died in, since the release it was on
  // may no longer be worth grabbing.
  failed: ['searching'],
  completed: [],
  importRequested: [],
  rejected: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * `completed`, `importRequested` and `rejected` only. `importRequested` belongs here for
 * the same reason `completed` does — `TRANSITIONS` gives it nowhere further to go — even
 * though, unlike `completed`, it is not a claim that the request's file actually landed;
 * see this file's header comment. `failed` is deliberately **not** terminal: retrying a
 * failed request (back to `searching`) is a legal, ordinary move, so anything that gates
 * on "is this request done" must not treat a failure as done — the obvious reading of
 * "failed" as an end state is wrong here.
 */
export function isTerminal(status: RequestStatus): boolean {
  return status === 'completed' || status === 'importRequested' || status === 'rejected';
}
