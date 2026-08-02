/**
 * Onboarding step 3 — optional services. Jellyfin (music, Phase 8) and a
 * download client (book requests, Phase 6) have no configuration surface on the
 * BFF yet, so their fields are shown but disabled rather than wired to a fake
 * "test connection" that could never actually succeed — honesty over polish.
 * The step is entirely skippable; "Continue" and "Skip for now" both just move
 * on to the app, since there is nothing here to persist until those phases ship.
 */
import { useNavigate } from '@tanstack/react-router';
import { Button, Chip } from '@auralis/ui';
import { OnboardingCard } from './OnboardingCard.js';

function ComingSoonService({
  name,
  description,
  placeholder,
}: {
  name: string;
  description: string;
  placeholder: string;
}) {
  return (
    <fieldset className="auralis-service-fieldset" disabled>
      <legend>
        {name} <Chip variant="assist">Coming soon</Chip>
      </legend>
      <p className="auralis-field__hint">{description}</p>
      <label className="auralis-field">
        <span className="auralis-field__label">Server address</span>
        <input type="url" placeholder={placeholder} disabled />
      </label>
      <Button variant="outlined" size="sm" disabled>
        Test connection
      </Button>
    </fieldset>
  );
}

export function ServicesPage() {
  const navigate = useNavigate();
  const finish = () => void navigate({ to: '/' });

  return (
    <OnboardingCard
      step={3}
      totalSteps={3}
      title="Optional services"
      subtitle="You're all set for audiobooks and podcasts. These can be added later from Settings — skip them for now if you'd rather get started."
    >
      <div className="auralis-services-list" data-testid="services-list">
        <ComingSoonService
          name="Jellyfin"
          description="Powers the Music section. Support ships in a later phase."
          placeholder="https://jellyfin.example.com"
        />
        <ComingSoonService
          name="Download client"
          description="Powers book requests (qBittorrent/Transmission). Support ships in a later phase."
          placeholder="https://qbittorrent.example.com"
        />
      </div>

      <div className="auralis-onboarding-actions">
        <Button variant="text" onClick={finish} data-testid="services-skip">
          Skip for now
        </Button>
        <Button variant="filled" onClick={finish} data-testid="services-continue">
          Continue to Auralis
        </Button>
      </div>
    </OnboardingCard>
  );
}
