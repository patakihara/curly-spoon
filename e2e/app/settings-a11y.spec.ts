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
 * 5. (wave 16c-2-W-3) The compact bottom `NavigationBar` — `packages/ui/src/components/
 *    NavigationBar.css` — read `--m3-*` *directly* (no Mantine ramp in between, unlike the
 *    desktop rail 16c-2-W-2 found), so its active-destination pill (`--m3-secondary-
 *    container`) and text (`--m3-on-secondary-container`) were two more non-responders:
 *    fixed Sonora values post-16c-2-W-1, tracking nothing the picker changes. Moved onto
 *    the solid-fill pairing Chip's checked state and Settings' own selected mode button
 *    already use — `--accent` background, `--accent-contrast` text — rather than
 *    `--surface-card`/`--accent-ink` (the desktop rail's pairing, and `SONORA.md` §3.7's
 *    `RailItem` spec): the bar's own background, `--m3-surface-container`, was made
 *    numerically identical to `--surface-card` by 16c-2-W-1's substrate fix, so that
 *    pairing would render an invisible pill. `--accent-contrast` is fixed white and fails
 *    WCAG AA on `--accent` at all 17 presets (docs/HANDOVER.md) — the same already-shipped,
 *    already-flagged risk as Chip's checked label, not a new one, so the test below checks
 *    only that the *pill* repaints (a real colour, not a fixed one) and does not assert on
 *    the label's colour.
 * 6. (wave 16c-2-W-4) Settings' *unselected* theme-mode buttons still rode Mantine's
 *    `theme.colors.auralis` ramp — `scheme.primary`, driven by `sourceColor`, not
 *    `--accent` — an orphaned tint tracking neither the accent picker nor Sonora's
 *    palette. The wave's own spec asked "make them respond to the accent picker"; Sonora's
 *    real vendored primitives (`docs/design/sonora/primitives/`) say otherwise, unanimously:
 *    `Button.jsx`'s `secondary` variant, `Chip.jsx`'s unchecked state and
 *    `IconButton.jsx`'s inactive state all use plain surface tone with *no* `--accent`
 *    reference. So the fix moves the unselected buttons onto the same
 *    `--surface-card`/`--surface-fg`/`--surface-border` trio `Chip.tsx`'s own unchecked
 *    state already uses — deliberately *not* accent-repainting. The test below asserts
 *    that directly: the unselected button's fill must stay put across an accent change
 *    while the selected button's fill (still `--accent`) visibly moves, so a future
 *    regression that makes them merge (or that silently reverts to the orphaned ramp) both
 *    fail it.
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

test("the compact bottom nav bar's active-destination pill repaints on an accent change", async ({
  page,
}) => {
  // NavigationBar.css reads --m3-* directly (no Mantine colour ramp), unlike the desktop
  // rail — 16c-2-W-2 found that rail rode Mantine's own ramp instead. Confirmed here by
  // reading, not assumed: this asserts the pill's fill genuinely tracks the accent swatch,
  // not merely that some `--accent`/`--accent-ink` custom property changed on the root.
  await page.goto('/settings');
  await page.getByTestId('accent-swatch-teal').click();
  await page.waitForTimeout(700);

  await page.goto('/');
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.getByTestId('home-page')).toBeVisible();
  const tealBar = page.getByTestId('nav-bar');
  const tealIndicator = tealBar.locator('.m3-nav-bar__indicator');
  await expect(tealIndicator).toBeVisible();
  const tealFill = await tealIndicator.evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.goto('/settings');
  await page.getByTestId('accent-swatch-red').click();
  await page.waitForTimeout(700);

  await page.goto('/');
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.getByTestId('home-page')).toBeVisible();
  const redBar = page.getByTestId('nav-bar');
  const redIndicator = redBar.locator('.m3-nav-bar__indicator');
  await expect(redIndicator).toBeVisible();
  const redFill = await redIndicator.evaluate((el) => getComputedStyle(el).backgroundColor);

  // Inequality, not a pinned literal — color-mix()/registered-property normalisation makes
  // a literal fragile (docs/HANDOVER.md), and inequality is what actually discriminates a
  // repaint from a fixed fill.
  expect(redFill).not.toBe(tealFill);
});

test("Settings' unselected mode button stays neutral across an accent change, and stays visually distinct from the selected one", async ({
  page,
}) => {
  // Wave 16c-2-W-4. Before the fix, the unselected buttons had no style override at all
  // and fell through to Mantine's own `outline`-variant CSS reading the `auralis` colour
  // ramp — transparent background, a tinted border/text from `scheme.primary`. That value
  // is neither `--surface-card` nor accent-derived, so this test's first assertion
  // (unselected background resolves to the theme root's own `--surface-card`) is a real
  // red-to-green check: it fails against the pre-fix code, which paints no
  // `--surface-card` at all here, and passes once the inline override lands.
  await page.goto('/settings');
  const themeRoot = page.locator('.auralis-theme-root');

  // Default mode is 'system' (selected); 'light' and 'dark' are unselected. Only accent
  // swatches are clicked below — never a mode button — so 'system' stays selected and
  // 'light' stays unselected throughout, isolating the accent-change variable.
  await expect(page.getByTestId('theme-mode-system')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('theme-mode-light')).toHaveAttribute('aria-pressed', 'false');
  const selected = page.getByTestId('theme-mode-system');
  const unselected = page.getByTestId('theme-mode-light');

  const surfaceCard = await themeRoot.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--surface-card').trim(),
  );
  const surfaceFg = await themeRoot.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--surface-fg').trim(),
  );

  const unselectedBgDefault = await unselected.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  const unselectedColorDefault = await unselected.evaluate((el) => getComputedStyle(el).color);
  expect(unselectedBgDefault).toBe(surfaceCard);
  expect(unselectedColorDefault).toBe(surfaceFg);

  const selectedBgDefault = await selected.evaluate((el) => getComputedStyle(el).backgroundColor);
  // Distinctness: a solid accent fill against Sonora's genuine neutral, not two shades of
  // the same thing — the failure mode this whole wave exists to avoid narrowing.
  expect(selectedBgDefault).not.toBe(unselectedBgDefault);

  await page.getByTestId('accent-swatch-red').click();
  await page.waitForTimeout(700);

  const selectedBgRed = await selected.evaluate((el) => getComputedStyle(el).backgroundColor);
  // The selected button still tracks the accent picker (16c-2-W-2) — confirms the
  // mechanism is live, so the unselected button's non-response below is a deliberate
  // opt-out, not a broken picker.
  expect(selectedBgRed).not.toBe(selectedBgDefault);

  const unselectedBgRed = await unselected.evaluate((el) => getComputedStyle(el).backgroundColor);
  const unselectedColorRed = await unselected.evaluate((el) => getComputedStyle(el).color);
  // The core assertion: the unselected button's fill does not move with the accent swatch.
  expect(unselectedBgRed).toBe(unselectedBgDefault);
  expect(unselectedColorRed).toBe(unselectedColorDefault);
  expect(unselectedBgRed).not.toBe(selectedBgRed);
});

test("the accent picker's own selection ring tracks the accent being picked", async ({ page }) => {
  // The picker's indicator read --m3-primary, which 16c-2-W-1 fixed at Sonora's value —
  // so the ring marking "this is your accent" sat in a colour that never changed when the
  // accent did. Android hit the identical bug and fixed it in 16f-A-2.
  //
  // This asserts the ring's own resolved outline-color changes between two presets, which
  // is the user-visible property. Reading --accent off the root instead would pass even
  // with the ring still pointing at a fixed token — the exact hole that let this ship.
  await page.goto('/settings');

  const ringColorFor = async (swatch: string) => {
    await page.getByTestId(`accent-swatch-${swatch}`).click();
    await page.waitForTimeout(700);
    return page
      .getByTestId(`accent-swatch-${swatch}`)
      .evaluate((el) => getComputedStyle(el).outlineColor);
  };

  const teal = await ringColorFor('teal');
  const red = await ringColorFor('red');

  expect(teal, 'the selection ring must resolve to a real colour').toMatch(/rgb|oklch|#/);
  expect(red, 'the selection ring must repaint when a different accent is picked').not.toBe(teal);
});
