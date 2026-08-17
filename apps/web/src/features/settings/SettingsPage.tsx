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
              // Wave 16c-2-W-2 migrated the *selected* (filled) button's fill onto
              // `--accent`/`--accent-contrast`, matching the solid-fill pairing Chip's
              // checked state and IconButton's selected `standard` state already establish.
              // It left the unselected (`outlined`) buttons on Mantine's own
              // `theme.colors.auralis` ramp — `scheme.primary`, the old HCT-generated M3
              // primary `sourceColor` still drives (`ThemeProvider.tsx`) even though
              // `16c-2-W-1` fixed `--m3-*` itself at Sonora's static values. That ramp
              // doesn't track the accent picker *or* match Sonora's palette; it's a third,
              // orphaned tint nobody chose.
              //
              // Wave 16c-2-W-4: checked Sonora's own vendored primitives
              // (`docs/design/sonora/primitives/`) before assuming "respond to the accent
              // picker" meant "tint with `--accent`" — it doesn't, and this is the case
              // `CLAUDE.md`'s parity-review precedent calls out (16c-2-W-3 finding `Card`
              // needed nothing). Three real Sonora sources agree, unanimously: the
              // *unselected* half of every toggle-like control is plain surface tone, never
              // `--accent`. `Button.jsx`'s own `secondary` variant is
              // `background: var(--surface-card); color: var(--surface-fg);
              // border: 1px solid var(--surface-border)` — no accent reference anywhere.
              // `Chip.jsx`'s unchecked state and `IconButton.jsx`'s inactive state are the
              // same shape. This app's own `Chip.tsx` already encodes exactly this trio
              // (`chipLabelStyle`'s unchecked branch) for its unchecked state, so the values
              // below are copied from there rather than invented, fallbacks included.
              //
              // So the fix is real but isn't "make it respond to the accent picker" — it's
              // "stop the orphaned tint and adopt Sonora's actual neutral treatment," which
              // incidentally is what makes the boundary against the selected button crisp:
              // a solid accent fill against Sonora's genuine neutral, not against a random
              // leftover hue. `--surface-fg` on `--surface-card` clears WCAG AA by a wide
              // margin in both themes (~14:1 dark, ~13.5:1 light — computed against the
              // WCAG relative-luminance formula), unlike the `--accent-ink`/`--surface-card`
              // pairing already flagged with Sofia (queue `abbaca2`) — this treatment avoids
              // that failure mode entirely rather than reusing a pairing known to fail it.
              style={
                mode === candidate
                  ? { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast, #fff)' }
                  : {
                      backgroundColor: 'var(--surface-card, rgb(20, 20, 20))',
                      color: 'var(--surface-fg, currentColor)',
                      borderColor: 'var(--surface-border, rgb(255 255 255 / 8%))',
                    }
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
