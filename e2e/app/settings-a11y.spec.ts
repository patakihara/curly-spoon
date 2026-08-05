/**
 * Two independent a11y-audit findings (2026-08-05) that both live in Settings /
 * `ThemeProvider`, neither needing a Jellyfin/Audiobookshelf connection — they're pure
 * theme-state, so this file skips the connect dance every other `e2e/app` file needs.
 *
 * 1. `SettingsPage`'s `theme-mode-*` buttons used to convey the active mode only through
 *    `variant` (filled vs outlined) — no `aria-pressed`, no `aria-current` — while the
 *    colour-swatch buttons a few lines below already did this correctly. Fixed by giving
 *    the mode buttons the same `aria-pressed` the swatches use.
 * 2. `packages/ui/src/styles/index.css`'s `:root { color-scheme: light dark; }` never
 *    tracked `resolvedMode` the way `data-theme` does, so a pinned theme that disagreed
 *    with the OS's own `prefers-color-scheme` still rendered native form-control chrome
 *    (placeholder text among it) for the *wrong* scheme — measured 2.47:1/2.07:1 against
 *    WCAG AA's 4.5:1 floor. Fixed in `ThemeProvider.tsx` by setting `colorScheme:
 *    resolvedMode` as an inline style on the same `.auralis-theme-root` element that
 *    already carries `data-theme`, rather than inventing a second sync mechanism.
 */
import { expect, test } from '@playwright/test';

test('theme mode buttons expose aria-pressed for the active mode, matching the colour swatches below them', async ({
  page,
}) => {
  await page.goto('/settings');

  // Fresh context, so the persisted store (`themeStore.ts`, `zustand/persist`) starts at
  // its own default, 'system'.
  await expect(page.getByTestId('theme-mode-system')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('theme-mode-light')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('theme-mode-dark')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('theme-mode-dark').click();
  await expect(page.getByTestId('theme-mode-dark')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('theme-mode-system')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('theme-mode-light')).toHaveAttribute('aria-pressed', 'false');
});

test('pinning a theme mode that disagrees with the OS syncs native color-scheme, not just data-theme', async ({
  page,
}) => {
  // The OS says light; the user is about to pin dark. Before the fix, `:root`'s static
  // `color-scheme: light dark` let the browser pick light native form-control chrome
  // anyway — `data-theme` flipped, the actual rendering didn't.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await page.getByTestId('theme-mode-dark').click();

  const themeRoot = page.locator('.auralis-theme-root');
  await expect(themeRoot).toHaveAttribute('data-theme', 'dark');
  await expect(themeRoot).toHaveCSS('color-scheme', 'dark');
});
