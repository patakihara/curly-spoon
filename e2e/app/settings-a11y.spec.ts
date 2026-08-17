/**
 * Independent a11y/theming findings that all live in Settings / `ThemeProvider`, none
 * needing a Jellyfin/Audiobookshelf connection — they're pure theme-state, so this file
 * skips the connect dance every other `e2e/app` file needs.
 *
 * 1. (2026-08-05) `SettingsPage`'s `theme-mode-*` buttons used to convey the active mode
 *    only through `variant` (filled vs outlined) — no `aria-pressed`, no `aria-current` —
 *    while the colour-swatch buttons a few lines below already did this correctly. Fixed
 *    by giving the mode buttons the same `aria-pressed` the swatches use.
 * 2. (2026-08-05) `packages/ui/src/styles/index.css`'s `:root { color-scheme: light
 *    dark; }` never tracked `resolvedMode` the way `data-theme` does, so a pinned theme
 *    that disagreed with the OS's own `prefers-color-scheme` still rendered native
 *    form-control chrome (placeholder text among it) for the *wrong* scheme — measured
 *    2.47:1/2.07:1 against WCAG AA's 4.5:1 floor. Fixed in `ThemeProvider.tsx` by setting
 *    `colorScheme: resolvedMode` as an inline style on the same `.auralis-theme-root`
 *    element that already carries `data-theme`, rather than inventing a second sync
 *    mechanism.
 * 3. (wave 16c-3-W) Settings' accent-colour picker (`theme-color-controls`) used to feed
 *    `sourceColor`, which stopped driving anything visible once wave 16c-2-W-1 fixed
 *    `--m3-*` to Sonora's chroma tables — the picker's own selection ring moved but
 *    nothing else did. Rewired onto `--accent` (Sonora's one customisable colour,
 *    `themeStore.ts`'s `accent`/`setAccent`), which the five already-migrated primitives
 *    (`Slider`, `Chip`, `IconButton`'s active state, …) read directly.
 * 4. (wave 16c-3-W) `apps/web/src/styles/app.css`'s `html body { background: var(--m3-
 *    surface); color: var(--m3-on-surface); }` rule can never see `.auralis-theme-root`'s
 *    `data-theme`-scoped inline values — `body` is an *ancestor*, and custom properties
 *    don't inherit downward past where they're set — so it always resolved against
 *    `index.css`'s static, deliberately-light-only `:root` fallback. A user with the app
 *    pinned dark against a light OS got near-invisible `rgb(25, 25, 25)` text (the light
 *    `--m3-on-surface`) wherever a descendant inherited `color` rather than setting its
 *    own. Fixed by also painting `.auralis-theme-root` itself — the element `ThemeProvider`
 *    actually applies the live scheme to — so inheritance stops there instead of reaching
 *    past it to the static fallback; `html body`'s rule stays as the pre-mount/edge-case
 *    fallback it already was for other reasons (see `app.css`'s comment).
 */
import { expect, test } from '@playwright/test';

/** DARK/LIGHT `surface`/`onSurface` from `packages/ui/src/tokens/color.ts` — literal,
 * not re-derived, so this test fails if either table's values drift without the fixture
 * changing with them (an intentional design change should update both). */
const DARK_SURFACE = 'rgb(12, 12, 12)';
const DARK_ON_SURFACE = 'rgb(225, 225, 225)';
const LIGHT_SURFACE = 'rgb(235, 235, 235)';
const LIGHT_ON_SURFACE = 'rgb(25, 25, 25)';

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

test('the accent picker actually repaints --accent (and its derived --accent-ink), not just its own selection ring', async ({
  page,
}) => {
  await page.goto('/settings');
  const themeRoot = page.locator('.auralis-theme-root');

  // Fresh context: the persisted store's own default, Sonora violet — the swatch reads
  // it as pressed and the token resolves to the same hex.
  await expect(page.getByTestId('accent-swatch-violet')).toHaveAttribute('aria-pressed', 'true');
  const defaultAccent = await themeRoot.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--accent').trim(),
  );
  const defaultAccentInk = await themeRoot.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--accent-ink').trim(),
  );
  // `--accent` is registered via `CSS.registerProperty({ syntax: '<color>' })`
  // (ThemeProvider.tsx, for the cross-fade), which normalises a computed read to
  // `rgb(...)` rather than preserving the literal hex — #8b5cf6 == rgb(139, 92, 246).
  expect(defaultAccent).toBe('rgb(139, 92, 246)');

  await page.getByTestId('accent-swatch-red').click();
  // Cross-fade takes ~500ms (spring.slow, same registered-property transition --m3-*
  // rides); wait past it before asserting the resting value.
  await page.waitForTimeout(700);

  await expect(page.getByTestId('accent-swatch-red')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('accent-swatch-violet')).toHaveAttribute('aria-pressed', 'false');

  const redAccent = await themeRoot.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--accent').trim(),
  );
  const redAccentInk = await themeRoot.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--accent-ink').trim(),
  );
  expect(redAccent).toBe('rgb(239, 68, 68)'); // #ef4444, same registered-property normalisation
  // --accent-ink (sonora-theme.css) references var(--accent) — it must re-derive, not
  // stay pinned to the old accent's ink.
  expect(redAccentInk).not.toBe(defaultAccentInk);

  // Scope discipline: --m3-primary is still Sonora's *fixed* chroma role (wave
  // 16c-2-W-1) and must NOT respond to the accent picker — only --accent does, until a
  // later wave migrates more components onto it.
  const primaryBefore = await themeRoot.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--m3-primary').trim(),
  );
  await page.getByTestId('accent-swatch-blue').click();
  await page.waitForTimeout(700);
  const primaryAfter = await themeRoot.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--m3-primary').trim(),
  );
  expect(primaryAfter).toBe(primaryBefore);
});

test('.auralis-theme-root paints the correct background/text colour even when the OS disagrees with the pinned theme', async ({
  page,
}) => {
  // Before the fix, only `html body` painted a background/colour at all, and it could
  // only ever see `index.css`'s static, permanently-light `:root` fallback — never
  // `.auralis-theme-root`'s own `data-theme`-scoped values, because `body` is an
  // *ancestor* of the theme root, and custom properties don't inherit downward past
  // where they're set. So a descendant that inherited `color` rather than setting its
  // own always rendered the light `--m3-on-surface` (rgb(25, 25, 25)), regardless of
  // `data-theme` — near-invisible on a correctly-dark card background.
  const themeRoot = page.locator('.auralis-theme-root');

  // App pinned dark, OS light — the exact mismatch the bug report reproduced.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await page.getByTestId('theme-mode-dark').click();
  await expect(themeRoot).toHaveAttribute('data-theme', 'dark');
  await expect(themeRoot).toHaveCSS('background-color', DARK_SURFACE);
  await expect(themeRoot).toHaveCSS('color', DARK_ON_SURFACE);

  // App pinned light, OS dark — the reverse mismatch.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByTestId('theme-mode-light').click();
  await expect(themeRoot).toHaveAttribute('data-theme', 'light');
  await expect(themeRoot).toHaveCSS('background-color', LIGHT_SURFACE);
  await expect(themeRoot).toHaveCSS('color', LIGHT_ON_SURFACE);
});
