/**
 * Onboarding step 3 — optional services. Jellyfin (music) and a download client
 * (book requests) both have real, working configuration surfaces today —
 * `JellyfinConnectSection.tsx` and `ProviderSettingsSection.tsx`, both reachable
 * from Settings — but wiring this step to them is out of scope for a restyle
 * (SETTINGS.md §6.9): duplicating that flow here, one skip before the user has
 * even signed in, is new feature scope. So the fields stay shown-but-disabled
 * rather than wired to a fake "test connection" that could never actually
 * succeed — honesty over polish — and each fieldset instead points at Settings,
 * where the real thing already lives. The step is entirely skippable;
 * "Continue" and "Skip for now" both just move on to the app.
 *
 * **Wave 16e-settings-W (SETTINGS.md §6.9):** the previous copy — "Support
 * ships in a later phase" — was false for both services and had been for a
 * while: Jellyfin shipped its connect flow in Phase 9, the download client's
 * in Phase 6. This is a copy fix only; no flow change, no new wiring.
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
        {name} <Chip variant="assist">Configure in Settings</Chip>
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
          description="Powers the Music section. Connect Jellyfin any time from Settings, once you're signed in."
          placeholder="https://jellyfin.example.com"
        />
        <ComingSoonService
          name="Download client"
          description="Powers book requests (qBittorrent/Transmission). Configure download clients any time from Settings, once you're signed in."
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
