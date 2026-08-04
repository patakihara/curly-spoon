/**
 * One `QueryClient` for the app. Two things live here beyond defaults:
 *
 * - A **global 401 handler**: any query or mutation that fails with an
 *   `ApiError` whose `code` is `'unauthenticated'` — the exact code
 *   `requireSession.ts` sends for a missing or expired Auralis session cookie
 *   — redirects to `/login`, so an expired session degrades into "please sign
 *   in again" rather than a component tree full of broken, half-loaded
 *   panels. It's a no-op while already on `/login` or anywhere under
 *   `/setup` — onboarding's own 401s (e.g. a stale cookie from a previous
 *   install) are handled by those pages themselves, not by yanking the user
 *   away from the very flow that would fix it.
 *
 *   Deliberately narrower than "any 401": `httpErrors.ts` also maps upstream
 *   auth failures — Audiobookshelf's `upstream_auth_expired`, Jellyfin's
 *   `jellyfin_auth_expired` (`routes/jellyfin.ts`'s `JELLYFIN_ERROR_STATUS`)
 *   — to HTTP 401, and those have nothing to do with the *Auralis* session
 *   being invalid. Found live in Phase 9 wave A: submitting a wrong Jellyfin
 *   password from `JellyfinConnectSection` returned 401
 *   (`jellyfin_auth_expired`), and a status-only check silently signed the
 *   whole app out — the connect form's own inline error message never got a
 *   chance to render, because the global redirect fired first and unmounted
 *   it. Checking `code` instead of `status` fixes that class of bug, not
 *   just this one instance of it.
 * - Query results are treated as reasonably fresh for 30s by default — this is a
 *   personal media server, not a multi-writer system, so refetching on every
 *   focus/mount is wasted work, not correctness.
 */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './errors.js';
import { router } from '../router/router.js';

/** Exported for `queryClient.test.ts` — both are plain, router-adjacent logic
 * worth pinning directly rather than only indirectly through a live QueryClient. */
export function isExemptFromAuthRedirect(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/setup');
}

export function handlePossibleAuthError(error: unknown): void {
  if (!(error instanceof ApiError) || error.code !== 'unauthenticated') return;
  const pathname = router.state.location.pathname;
  if (isExemptFromAuthRedirect(pathname)) return;
  void router.navigate({ to: '/login' });
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  // 401/404/other 4xx are never transient — retrying just delays the useful error.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
    queryCache: new QueryCache({ onError: handlePossibleAuthError }),
    mutationCache: new MutationCache({ onError: handlePossibleAuthError }),
  });
}
