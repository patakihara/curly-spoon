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
            // Wave 16e-settings-W (SETTINGS.md §6.6): this used to be a `Button` whose
            // inline `style` block hand-copied `Chip.tsx`'s own selected/unselected
            // values (see that file's `chipLabelStyle`/`chipStyleVars`) because nothing
            // here actually reused `Chip`. It now does — `Chip`'s `filter` variant
            // already encodes exactly the treatment that block used to duplicate by
            // hand (`--accent`/`--accent-contrast` filled, `--surface-card`/
            // `--surface-fg`/`--surface-border` unfilled), so this row needs no style
            // override at all.
            //
            // Accessibility note (SETTINGS.md §11): `Chip`'s underlying control is
            // Mantine's checkbox-shaped `<input type="checkbox">` (see `Chip.tsx`'s own
            // header comment and `e2e/ui/chip.spec.ts`), so there is no `aria-pressed`
            // here the way the old `Button` had — selection is conveyed by the input's
            // native `checked` state instead, asserted via `.toBeChecked()` in
            // `settings-a11y.spec.ts`. That is `role="checkbox"`/checked-state
            // semantics, not a radio group, even though these three chips are mutually
            // exclusive — a real, named gap inherited from `Chip.tsx` (out of scope
            // here; `Chip.tsx` is `packages/ui` primitive work, not this screen's
            // restyle) rather than something this wave fixed or worked around.
            <Chip
              key={candidate}
              variant="filter"
              selected={mode === candidate}
              onSelectedChange={() => setMode(candidate)}
              data-testid={`theme-mode-${candidate}`}
            >
              {candidate}
            </Chip>
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
