import { expect, test, type Page } from '@playwright/test';

/**
 * Wave 16b-2 (docs/ROADMAP.md §16): Sonora's token layer landed alongside the app's
 * existing `--m3-*` tokens (packages/ui/src/styles/sonora-tokens.css,
 * packages/ui/src/styles/sonora-theme.css). This is its reader.
 *
 * The real bug this file exists to catch, per docs/HANDOVER.md: a token defined in light
 * and forgotten in dark (or vice versa) renders as nothing — an invalid `var()` reference
 * resolves to the CSS "guaranteed-invalid value", which `getComputedStyle` reports back as
 * an empty string for the custom property itself. Nothing else in this repo's test suite
 * can see that; it isn't a rendering crash, just a silently missing colour/radius/etc.
 *
 * Every specimen in the gallery (packages/ui/gallery/App.tsx, the `Sonora *` sections)
 * carries a `data-token="--the-exact-name"` attribute. This spec enumerates every such
 * element rather than hard-coding the token list, so a token added to the gallery later
 * without a dark (or light) value fails here automatically — no second list to keep in
 * sync.
 */

async function readTokenValues(page: Page): Promise<Record<string, string>> {
  return page.$$eval('[data-token]', (nodes) =>
    Object.fromEntries(
      nodes.map((node) => {
        const name = node.getAttribute('data-token')!;
        const value = getComputedStyle(node).getPropertyValue(name).trim();
        return [name, value];
      }),
    ),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Sonora token layer', () => {
  test('every token specimen resolves to a non-empty value in dark mode (the gallery default)', async ({
    page,
  }) => {
    await expect(page.getByTestId('mode-dark')).toBeVisible();
    const values = await readTokenValues(page);

    // Sanity check on the enumeration itself: the wave lands ~90 distinct token names
    // across neutral/surface/accent/state/app-level/radius/space/spacing/text/leading/
    // heading/shadow. A near-empty result here would mean the gallery selector matched
    // nothing (e.g. `data-token` renamed) and every assertion below would vacuously pass.
    const names = Object.keys(values);
    expect(names.length).toBeGreaterThan(70);

    for (const [name, value] of Object.entries(values)) {
      expect(value, `${name} should resolve to a non-empty value in dark mode`).not.toBe('');
    }
  });

  test('every token specimen also resolves to a non-empty value in light mode', async ({
    page,
  }) => {
    await page.getByTestId('mode-light').click();
    // Matches theme.spec.ts's own wait: --m3-tertiary (which --tone-request references in
    // dark, though not in light — see sonora-theme.css) is a registered `<color>` custom
    // property and cross-fades over spring.slow (~500ms) on a mode switch.
    await page.waitForTimeout(700);

    await expect(page.locator('.auralis-theme-root')).toHaveAttribute('data-theme', 'light');
    const values = await readTokenValues(page);
    const names = Object.keys(values);
    expect(names.length).toBeGreaterThan(70);

    for (const [name, value] of Object.entries(values)) {
      expect(value, `${name} should resolve to a non-empty value in light mode`).not.toBe('');
    }

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });

  test('spot-checks resolved values against docs/design/SONORA.md, so "non-empty" alone cannot hide a typo', async ({
    page,
  }) => {
    const root = page.locator('.auralis-theme-root');

    // Static tokens (packages/ui/src/styles/sonora-tokens.css) — same value regardless of
    // theme. SONORA.md §1.3, §1.10.
    const accent = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--accent').trim(),
    );
    expect(accent.replace(/\s+/g, '').toLowerCase()).toBe('#8b5cf6');

    const radiusPill = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--radius-pill').trim(),
    );
    expect(radiusPill).toBe('999px');

    const h1Size = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--h1-size').trim(),
    );
    expect(h1Size).toBe('2.25rem');

    // Theme-dependent tokens (packages/ui/src/styles/sonora-theme.css) — SONORA.md §1.2.
    // Dark is the gallery's default (packages/ui/gallery/App.tsx pins `mode="dark"`).
    const surfaceBgDark = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--surface-bg').trim(),
    );
    expect(surfaceBgDark.replace(/\s+/g, '')).toBe('rgb(12,12,12)');

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);

    const surfaceBgLight = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--surface-bg').trim(),
    );
    expect(surfaceBgLight.replace(/\s+/g, '')).toBe('rgb(235,235,235)');

    // The app-level token most likely to get a light value wrong (SONORA.md §2): it is
    // NOT var(--m3-tertiary) in light, it's its own literal.
    const toneRequestLight = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--tone-request').trim(),
    );
    expect(toneRequestLight.replace(/\s+/g, '').toLowerCase()).toBe('#5b3b57');

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });

  test('the two CSS-function tokens (color-mix, gradient) resolve to real used values, not just non-empty strings', async ({
    page,
  }) => {
    // `getComputedStyle(el).getPropertyValue('--accent-ink')` (used by every test above)
    // reports the *substituted token stream* for a custom property, not a used value — a
    // malformed `color-mix()` (wrong colour space name, wrong argument order) still comes
    // back as a non-empty string and would pass every assertion above while resolving to
    // nothing wherever a component actually consumes it. Each gallery specimen also sets a
    // *real* CSS property (`background`) from the token, on its `.sonora-token-sample`
    // child — asserting that element's computed `backgroundColor`/`backgroundImage` is the
    // only way to prove the function itself evaluated, which is what SONORA.md §2 warns
    // is otherwise invisible ("no error anywhere").

    // --accent-ink only exercises color-mix() in light mode (dark is a plain var(--accent)
    // passthrough, which can't catch this class of bug).
    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);

    const accentInkSample = page.getByTestId('token-accent-ink').locator('.sonora-token-sample');
    const accentInkColor = await accentInkSample.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(accentInkColor).toMatch(/^rgba?\(/);
    // The initial/failed-to-apply value for an unset background-color — a malformed
    // color-mix() leaves the property at this, not at an error.
    expect(accentInkColor).not.toBe('rgba(0, 0, 0, 0)');

    const overlaySample = page
      .getByTestId('token-surface-overlay-header')
      .locator('.sonora-token-sample');
    const overlayImage = await overlaySample.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(overlayImage).toMatch(/^linear-gradient\(/);

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });
});
