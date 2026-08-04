/**
 * Settings section for connecting Jellyfin (music). Follows
 * `ProviderSettingsSection.tsx`'s pattern — an always-visible, always-editable
 * form rather than a modal or a separate onboarding step — because, unlike
 * Audiobookshelf, Jellyfin is optional and configured after the user is already
 * signed in, not during onboarding.
 *
 * `POST /jellyfin/login` configures the shared base URL and signs the calling
 * user in, in one call (see `routes/jellyfin.ts`'s doc comment) — there is no
 * separate "test connection" step the way Audiobookshelf's onboarding has one.
 * `baseUrl` is only required the first time: once `GET /jellyfin/config`
 * reports a stored one, the field is pre-filled and reconnecting (e.g. after a
 * password change) only needs new credentials.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Chip, CircularProgress } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import { useJellyfinConfigQuery, useJellyfinLoginMutation } from '../../api/queries.js';

function describeJellyfinError(err: ApiError): string {
  if (err.isNetworkError)
    return "Couldn't reach the Auralis server. Check it's running and try again.";
  if (err.code === 'jellyfin_unreachable')
    return "Couldn't reach that Jellyfin server. Check the address and that it's running.";
  if (err.code === 'jellyfin_auth_expired') return 'Incorrect username or password.';
  if (err.code === 'jellyfin_timeout') return 'Jellyfin took too long to respond. Try again.';
  return err.message || 'Could not connect to Jellyfin.';
}

export function JellyfinConnectSection() {
  const configQuery = useJellyfinConfigQuery();
  const loginMutation = useJellyfinLoginMutation();

  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the address once it's known, but only before the user has typed
  // anything of their own — an in-progress edit should never be clobbered by a
  // background refetch of the same query.
  useEffect(() => {
    if (configQuery.data?.baseUrl && baseUrl === '') {
      setBaseUrl(configQuery.data.baseUrl);
    }
  }, [configQuery.data?.baseUrl, baseUrl]);

  const configured = configQuery.data?.configured ?? false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await loginMutation.mutateAsync({
        baseUrl: baseUrl.trim() || undefined,
        username,
        password,
      });
      setPassword('');
    } catch (err) {
      setPassword('');
      const apiError =
        err instanceof ApiError ? err : new ApiError('unknown_error', String(err), 0);
      setError(describeJellyfinError(apiError));
    }
  };

  return (
    <section data-testid="jellyfin-connect-section">
      <h2>Music (Jellyfin)</h2>
      <div className="auralis-service-row">
        <span>Jellyfin</span>
        {configQuery.isLoading ? (
          <Chip variant="assist">Checking…</Chip>
        ) : configured ? (
          <Chip variant="assist" data-testid="jellyfin-status-connected">
            Connected — {configQuery.data?.baseUrl}
          </Chip>
        ) : (
          <Chip variant="assist" data-testid="jellyfin-status-disconnected">
            Not connected
          </Chip>
        )}
      </div>
      <p className="auralis-field__hint">
        {configured
          ? 'Reconnect below to switch servers or refresh your credentials.'
          : 'Connect a Jellyfin server to browse and search your music library.'}
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} data-testid="jellyfin-connect-form">
        <label className="auralis-field" htmlFor="jellyfin-base-url">
          <span className="auralis-field__label">Server address</span>
          <input
            id="jellyfin-base-url"
            name="baseUrl"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://jellyfin.example.com"
            required={!configured}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            data-testid="jellyfin-base-url-input"
          />
        </label>
        <label className="auralis-field" htmlFor="jellyfin-username">
          <span className="auralis-field__label">Username</span>
          <input
            id="jellyfin-username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            data-testid="jellyfin-username-input"
          />
        </label>
        <label className="auralis-field" htmlFor="jellyfin-password">
          <span className="auralis-field__label">Password</span>
          <input
            id="jellyfin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="jellyfin-password-input"
          />
        </label>

        {error ? (
          <div className="auralis-field-error" role="alert" data-testid="jellyfin-connect-error">
            <p>{error}</p>
          </div>
        ) : null}

        <div className="auralis-settings-row">
          <Button
            type="submit"
            variant="filled"
            size="sm"
            disabled={
              loginMutation.isPending ||
              !username ||
              !password ||
              (!configured && baseUrl.trim().length === 0)
            }
            data-testid="jellyfin-connect-submit"
          >
            {loginMutation.isPending ? (
              <>
                <CircularProgress size={18} indeterminate aria-label="Connecting" />
                Connecting…
              </>
            ) : configured ? (
              'Reconnect'
            ) : (
              'Connect'
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
