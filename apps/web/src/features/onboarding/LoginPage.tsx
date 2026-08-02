/**
 * Onboarding step 2 — Audiobookshelf credentials, exchanged by the BFF for a
 * session cookie (`POST /api/v1/auth/login`). The password field is never
 * echoed back into the DOM: it lives only in this component's own state and is
 * cleared from state immediately after the request settles, success or fail.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, CircularProgress } from '@auralis/ui';
import { useLoginMutation } from '../../api/queries.js';
import { ApiError } from '../../api/errors.js';
import { OnboardingCard } from './OnboardingCard.js';

function describeLoginError(err: ApiError): string {
  if (err.isNetworkError)
    return "Couldn't reach the Auralis server. Check it's running and try again.";
  if (err.code === 'invalid_credentials') return 'Incorrect username or password.';
  if (err.code === 'not_configured') return 'Setup was reset — go back and reconnect your server.';
  return err.message || 'Something went wrong signing in.';
}

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const mutation = useLoginMutation();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync({ username, password });
      setPassword('');
      await navigate({ to: '/setup/services' });
    } catch (err) {
      setPassword('');
      const apiError =
        err instanceof ApiError ? err : new ApiError('unknown_error', String(err), 0);
      setError(describeLoginError(apiError));
    }
  };

  return (
    <OnboardingCard
      step={2}
      totalSteps={3}
      title="Sign in"
      subtitle="Use the same username and password you use for Audiobookshelf."
    >
      <form onSubmit={(e) => void handleSubmit(e)} data-testid="login-form">
        <label className="auralis-field" htmlFor="login-username">
          <span className="auralis-field__label">Username</span>
          <input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            data-testid="login-username-input"
          />
        </label>
        <label className="auralis-field" htmlFor="login-password">
          <span className="auralis-field__label">Password</span>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="login-password-input"
          />
        </label>

        {error ? (
          <div className="auralis-field-error" role="alert" data-testid="login-error">
            <p>{error}</p>
          </div>
        ) : null}

        <div className="auralis-onboarding-actions">
          <Button
            type="submit"
            variant="filled"
            disabled={mutation.isPending || !username || !password}
            data-testid="login-submit"
          >
            {mutation.isPending ? (
              <>
                <CircularProgress size={18} indeterminate aria-label="Signing in" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </div>
      </form>
    </OnboardingCard>
  );
}
