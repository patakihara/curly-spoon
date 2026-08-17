/**
 * Settings: theme mode + accent colour, connection status, sign-out, and — as of Phase 6 —
 * provider and book-request configuration. Jellyfin (music) got its own
 * connect flow in Phase 9 wave A (`JellyfinConnectSection`), replacing the
 * "add this later" placeholder chip this section used to render inline.
 *
 * **Wave 16c-3-W.** The accent picker used to feed `sourceColor` into `ThemeProvider`'s
 * HCT-derived `--m3-*` generator; wave 16c-2-W-1 replaced that generator with Sonora's
 * fixed chroma tables, so `sourceColor` stopped doing anything visible — the picker
 * looked broken (`docs/HANDOVER.md`, "the accent picker does nothing at all"). Sonora's
 * own model is that `--accent` (not `--m3-*`) is the one user-customisable colour, offered
 * as Symphony's 17-hue preset picker (`ACCENT_PRESETS`, `@auralis/ui`'s `color.ts`) — so
 * this rewires the same swatch UI onto `accent`/`setAccent` instead of deleting it.
 * `sourceColor`/`setSourceColor` stay in `themeStore.ts` for API compatibility (still
 * accepted by `ThemeProvider`) but are no longer read here.
 */
import { useNavigate } from '@tanstack/react-router';
import { ACCENT_PRESETS, Button, Chip } from '@auralis/ui';
import { useLogoutMutation, useSetupQuery } from '../../api/queries.js';
import { useThemeStore } from '../../state/themeStore.js';
import type { ThemeMode } from '@auralis/ui';
import { JellyfinConnectSection } from '../music/JellyfinConnectSection.js';
import { MusicRequestSettingsSection } from '../music/MusicRequestSettingsSection.js';
import { ProviderSettingsSection } from '../requests/ProviderSettingsSection.js';
import { RequestSettingsSection } from '../requests/RequestSettingsSection.js';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

/** Capitalized labels for `ACCENT_PRESETS`' lowercase hue names — `aria-label`s only,
 * the swatch itself conveys colour visually. */
function accentLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function SettingsPage() {
  const navigate = useNavigate();
  const setupQuery = useSetupQuery();
  const logoutMutation = useLogoutMutation();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);

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
              // Matches the colour swatches below (`aria-pressed={accent === preset.hex}`):
              // `variant` alone is a visual-only signal (filled vs outlined), invisible to
              // assistive tech (a11y audit, 2026-08-05).
              aria-pressed={mode === candidate}
              onClick={() => setMode(candidate)}
              data-testid={`theme-mode-${candidate}`}
              // Wave 16c-2-W-2: the second conspicuous non-responder to the accent picker
              // named in docs/HANDOVER.md — these buttons sit directly next to the accent
              // swatches and ignored every one of them. `Button.tsx`'s `filled` variant
              // still rides Mantine's own `theme.colors.auralis` ramp (its own doc comment
              // says so, "out of scope for" wave 16c-1), which is `scheme.primary` — the old
              // HCT-generated M3 primary that stopped tracking anything the picker changes
              // once 16c-2-W-1 fixed `--m3-*` at Sonora's values. Overriding only the
              // *selected* (filled) button's fill follows the pairing Chip.tsx's checked
              // state and IconButton.tsx's selected `standard` state already establish for a
              // solid accent fill: `--accent` background, `--accent-contrast` text — not
              // `--accent-ink`, which is for text/icons placed *on a surface*, not for a
              // button's own solid fill. `--accent-contrast` is a fixed white and already
              // documented (docs/HANDOVER.md) to fail 4.5:1 at nine of the seventeen
              // presets — a pre-existing pairing this reuses rather than a new one. The
              // unselected (`outlined`) buttons are left on Mantine's ramp: they're
              // deliberately neutral in the same pattern (Chip's *unchecked* state doesn't
              // read `--accent` either), so leaving them alone doesn't narrow the boundary.
              style={
                mode === candidate
                  ? { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast, #fff)' }
                  : undefined
              }
            >
              {candidate}
            </Button>
          ))}
        </div>
        <p className="auralis-field__hint">Accent colour:</p>
        <div className="auralis-settings-row" data-testid="theme-color-controls">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              aria-label={accentLabel(preset.name)}
              aria-pressed={accent.toLowerCase() === preset.hex.toLowerCase()}
              className="auralis-color-swatch"
              style={{ background: preset.hex }}
              onClick={() => setAccent(preset.hex)}
              data-testid={`accent-swatch-${preset.name}`}
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
      </section>

      <JellyfinConnectSection />

      <ProviderSettingsSection />

      <RequestSettingsSection />

      <MusicRequestSettingsSection />

      <section>
        <Button variant="outlined" onClick={() => void handleSignOut()} data-testid="sign-out">
          Sign out
        </Button>
      </section>
    </div>
  );
}
