/**
 * The onboarding gate: redirects to `/setup` whenever the BFF reports
 * Audiobookshelf isn't configured, unless we're already somewhere in the setup
 * flow. Session expiry (401 on an authenticated call) is handled separately, by
 * the global `QueryCache`/`MutationCache` handler in `api/queryClient.ts` — this
 * component only owns the "has /setup even run yet" gate, which is ordinary
 * (non-error) `{ configured: false }` data, not a failure.
 */
import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { CircularProgress } from '@auralis/ui';
import { useSetupQuery } from '../api/queries.js';

function isSetupFlowPath(pathname: string): boolean {
  return pathname === '/setup' || pathname.startsWith('/setup/');
}

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const setupQuery = useSetupQuery();
  const configured = setupQuery.data?.configured ?? false;

  useEffect(() => {
    if (!setupQuery.isSuccess) return;
    if (!configured && !isSetupFlowPath(location.pathname)) {
      void navigate({ to: '/setup' });
    }
  }, [setupQuery.isSuccess, configured, location.pathname, navigate]);

  if (setupQuery.isLoading) {
    return (
      <div className="auralis-boot-loading" data-testid="boot-loading">
        <CircularProgress indeterminate aria-label="Loading Auralis" />
      </div>
    );
  }

  if (setupQuery.isError) {
    const message = setupQuery.error instanceof Error ? setupQuery.error.message : 'Unknown error';
    return (
      <div className="auralis-error-surface" role="alert" data-testid="boot-error">
        <h1>Couldn't reach Auralis</h1>
        <p>{message}</p>
        <button type="button" onClick={() => void setupQuery.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
