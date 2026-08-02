/**
 * One `QueryClient` for the app. Two things live here beyond defaults:
 *
 * - A **global 401 handler**: any query or mutation that fails with an
 *   `ApiError` whose `status` is 401 redirects to `/login`, so an expired
 *   session degrades into "please sign in again" rather than a component tree
 *   full of broken, half-loaded panels. It's a no-op while already on `/login`
 *   or anywhere under `/setup` — onboarding's own 401s (e.g. a stale cookie from
 *   a previous install) are handled by those pages themselves, not by yanking
 *   the user away from the very flow that would fix it.
 * - Query results are treated as reasonably fresh for 30s by default — this is a
 *   personal media server, not a multi-writer system, so refetching on every
 *   focus/mount is wasted work, not correctness.
 */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './errors.js';
import { router } from '../router/router.js';

function isExemptFromAuthRedirect(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/setup');
}

function handlePossibleAuthError(error: unknown): void {
  if (!(error instanceof ApiError) || error.status !== 401) return;
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
