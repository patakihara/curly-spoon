/**
 * Used as both the root route's `errorComponent` and every leaf route's — a real
 * "something broke" surface with a retry, never a blank screen. `reset` is
 * TanStack Router's own recovery hook (re-runs the route's loader/component);
 * it's paired with a hard reload fallback since a render-time error (as opposed
 * to a loader error) can leave the surrounding tree in a state `reset` alone
 * won't clear.
 */
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '@auralis/ui';

export function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="auralis-error-surface" role="alert" data-testid="route-error-boundary">
      <h1>Something went wrong</h1>
      <p>{message || 'An unexpected error occurred.'}</p>
      <div className="auralis-error-surface__actions">
        <Button variant="filled" onClick={() => reset()} data-testid="route-error-retry">
          Try again
        </Button>
        <Button variant="text" onClick={() => window.location.assign('/')}>
          Go home
        </Button>
      </div>
    </div>
  );
}
