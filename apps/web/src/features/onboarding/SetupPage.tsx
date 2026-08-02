/**
 * Onboarding step 1 — point the app at an Audiobookshelf server. Probes via the
 * BFF's `POST /api/v1/setup` before persisting anything (a typo'd URL is never
 * saved over a working one — see apps/server/src/routes/setup.ts), and turns a
 * failed probe into one of `describeSetupError`'s specific diagnoses rather than
 * a generic "failed to connect".
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, CircularProgress } from '@auralis/ui';
import { useSubmitSetupMutation } from '../../api/queries.js';
import { ApiError } from '../../api/errors.js';
import { describeSetupError, type SetupDiagnosis } from '../../api/setupErrors.js';
import { OnboardingCard } from './OnboardingCard.js';

export function SetupPage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [diagnosis, setDiagnosis] = useState<SetupDiagnosis | null>(null);
  const navigate = useNavigate();
  const mutation = useSubmitSetupMutation();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDiagnosis(null);
    try {
      await mutation.mutateAsync(baseUrl.trim());
      await navigate({ to: '/login' });
    } catch (err) {
      const apiError =
        err instanceof ApiError ? err : new ApiError('unknown_error', String(err), 0);
      setDiagnosis(describeSetupError(apiError));
    }
  };

  return (
    <OnboardingCard
      step={1}
      totalSteps={3}
      title="Connect to Audiobookshelf"
      subtitle="Enter the address of your Audiobookshelf server. You can find this in your browser's address bar when you have it open."
    >
      <form onSubmit={(e) => void handleSubmit(e)} data-testid="setup-form">
        <label className="auralis-field" htmlFor="setup-base-url">
          <span className="auralis-field__label">Server address</span>
          <input
            id="setup-base-url"
            name="baseUrl"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://audiobookshelf.example.com"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            data-testid="setup-base-url-input"
          />
        </label>

        {diagnosis ? (
          <div className="auralis-field-error" role="alert" data-testid="setup-error">
            <strong>{diagnosis.heading}</strong>
            <p>{diagnosis.detail}</p>
          </div>
        ) : null}

        <div className="auralis-onboarding-actions">
          <Button
            type="submit"
            variant="filled"
            disabled={mutation.isPending || baseUrl.trim().length === 0}
            data-testid="setup-submit"
          >
            {mutation.isPending ? (
              <>
                <CircularProgress size={18} indeterminate aria-label="Testing connection" />
                Testing connection…
              </>
            ) : (
              'Test connection & continue'
            )}
          </Button>
        </div>
      </form>
    </OnboardingCard>
  );
}
