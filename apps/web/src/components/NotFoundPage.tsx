import { Link } from '@tanstack/react-router';
import { Button } from '@auralis/ui';

/** Rendered for any unmatched path (`rootRoute`'s `notFoundComponent`) — always offers a way back. */
export function NotFoundPage() {
  return (
    <div className="auralis-error-surface" data-testid="not-found-page">
      <h1>Page not found</h1>
      <p>There's nothing here. The link may be old, or the address mistyped.</p>
      <Link to="/">
        <Button variant="filled">Back to Home</Button>
      </Link>
    </div>
  );
}
