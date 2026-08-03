/**
 * Settings: theme mode + demo source colour (Phase 5 will drive the real colour
 * from artwork instead), connection status, sign-out, and — as of Phase 6 —
 * provider and book-request configuration. Jellyfin (music) is still the one
 * "add this later" service promised during onboarding, surfaced as a
 * clearly-labelled not-yet-available entry; the download-client slot that used
 * to sit next to it is now the real thing, in `ProviderSettingsSection`.
 */
import { useNavigate } from '@tanstack/react-router';
import { AURALIS_SOURCE_COLOR, Button, Chip } from '@auralis/ui';
import { useLogoutMutation, useSetupQuery } from '../../api/queries.js';
import { useThemeStore } from '../../state/themeStore.js';
import type { ThemeMode } from '@auralis/ui';
import { ProviderSettingsSection } from '../requests/ProviderSettingsSection.js';
import { RequestSettingsSection } from '../requests/RequestSettingsSection.js';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

const COLOR_SWATCHES = [
  { label: 'Amber (default)', hex: AURALIS_SOURCE_COLOR },
  { label: 'Blue', hex: '#1B6EF3' },
  { label: 'Green', hex: '#2E7D32' },
  { label: 'Red', hex: '#B00020' },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const setupQuery = useSetupQuery();
  const logoutMutation = useLogoutMutation();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const sourceColor = useThemeStore((s) => s.sourceColor);
  const setSourceColor = useThemeStore((s) => s.setSourceColor);

  const handleSignOut = async () => {
    await logoutMutation.mutateAsync();
    await navigate({ to: '/login' });
  };

  return (
    <div className="auralis-page" data-testid="settings-page">
      <h1>Settings</h1>

      <section>
        <h2>Appearance</h2>
        <div className="auralis-settings-row" data-testid="theme-mode-controls">
          {MODES.map((candidate) => (
            <Button
              key={candidate}
              variant={mode === candidate ? 'filled' : 'outlined'}
              size="sm"
              onClick={() => setMode(candidate)}
              data-testid={`theme-mode-${candidate}`}
            >
              {candidate}
            </Button>
          ))}
        </div>
        <p className="auralis-field__hint">
          Source colour (Phase 5 will set this automatically from artwork):
        </p>
        <div className="auralis-settings-row" data-testid="theme-color-controls">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              aria-label={swatch.label}
              aria-pressed={sourceColor.toLowerCase() === swatch.hex.toLowerCase()}
              className="auralis-color-swatch"
              style={{ background: swatch.hex }}
              onClick={() => setSourceColor(swatch.hex)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>Connected services</h2>
        <div className="auralis-service-row">
          <span>Audiobookshelf</span>
          {setupQuery.data?.configured ? (
            <Chip variant="assist">{setupQuery.data.baseUrl}</Chip>
          ) : (
            <Chip variant="assist">Not connected</Chip>
          )}
        </div>
        <div className="auralis-service-row">
          <span>Jellyfin (Music)</span>
          <Chip variant="assist">Coming soon — you can add this later</Chip>
        </div>
      </section>

      <ProviderSettingsSection />

      <RequestSettingsSection />

      <section>
        <Button variant="outlined" onClick={() => void handleSignOut()} data-testid="sign-out">
          Sign out
        </Button>
      </section>
    </div>
  );
}
