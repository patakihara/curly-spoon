import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('IconButton', () => {
  test('every variant has an accessible name and meets the touch target', async ({ page }) => {
    for (const variant of ['standard', 'filled', 'tonal', 'outlined']) {
      const button = page.getByTestId(`icon-button-${variant}`);
      await expect(button).toHaveAccessibleName(variant);
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(48);
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }
  });

  test('toggle mode flips aria-pressed on click and is keyboard operable', async ({ page }) => {
    const toggle = page.getByTestId('icon-button-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('toggle selected state changes the glyph colour to the Sonora accent (no scale transform)', async ({
    page,
  }) => {
    // Wave 16c-1: Sonora ships no spring/motion tokens, and its own active-state
    // guidance (RailItem, docs/design/SONORA.md §3.7) is a colour change, not the old
    // M3-Expressive glyph-scale spring. This now asserts the opposite half of what the
    // pre-migration test pinned: the transform stays constant and the colour is what
    // moves, to the resolved --accent value. Reconciled against docs/design/sonora/
    // primitives/IconButton.jsx: `active` uses plain `var(--accent)`, not `--accent-ink`.
    const toggle = page.getByTestId('icon-button-toggle');
    const glyph = toggle.locator('.m3-icon-button__glyph');
    const transformBefore = await glyph.evaluate((el) => getComputedStyle(el).transform);
    const colorBefore = await toggle.evaluate((el) => getComputedStyle(el).color);

    await toggle.click();
    await page.waitForTimeout(300);

    const transformAfter = await glyph.evaluate((el) => getComputedStyle(el).transform);
    const colorAfter = await toggle.evaluate((el) => getComputedStyle(el).color);
    expect(transformAfter).toBe(transformBefore);
    expect(colorAfter).not.toBe(colorBefore);
    expect(colorAfter).toBe('rgb(139, 92, 246)'); // --accent, static across both themes

    await toggle.click(); // restore
  });

  test('the selected accent colour is the same static value in light mode (--accent is not theme-scoped)', async ({
    page,
  }) => {
    // Wave 16c-1: unlike the first draft's --accent-ink (a theme-scoped, colour-mixed
    // value that differed by mode), the reconciled --accent is defined once on bare
    // :root (packages/ui/src/styles/sonora-tokens.css) and never varies with
    // [data-theme]. So the correct invariant is now equality across themes, not
    // difference — proves the token still resolves after a mode switch, without
    // depending on a per-theme mix that no longer applies here.
    const toggle = page.getByTestId('icon-button-toggle');

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);

    await toggle.click();
    const lightColor = await toggle.evaluate((el) => getComputedStyle(el).color);
    expect(lightColor).toBe('rgb(139, 92, 246)');

    await toggle.click(); // restore selected=false
    await page.getByTestId('mode-dark').click(); // restore for other tests
  });

  // Wave 16e-nowplaying (docs/design/screens/NOW_PLAYING.md §3.3): the new optional `size`
  // prop, added for the Now Playing surface's differentiated transport-button sizing
  // (48/56/72px). Both halves matter — the new prop must actually resize the button
  // (discriminates: this fails against the pre-wave IconButton, which had no `size` prop
  // at all and always rendered 48px regardless), and every pre-existing call site that
  // omits `size` must be completely unaffected (discriminates against a regression that
  // changed the *default*, not just one that failed to add the override).
  test('the optional size prop overrides the 48px default, and every call site that omits it is unaffected', async ({
    page,
  }) => {
    const sized = page.getByTestId('icon-button-size-64');
    const sizedBox = await sized.boundingBox();
    expect(sizedBox?.width).toBeCloseTo(64, 0);
    expect(sizedBox?.height).toBeCloseTo(64, 0);

    // Every default-sized variant from the first test in this file, re-checked here
    // alongside the new sized button so "additive only" is proven in the same test as
    // the new capability, rather than in a separate test that could pass on its own
    // while a shared default silently shifted.
    for (const variant of ['standard', 'filled', 'tonal', 'outlined']) {
      const button = page.getByTestId(`icon-button-${variant}`);
      const box = await button.boundingBox();
      expect(box?.width).toBeCloseTo(48, 0);
      expect(box?.height).toBeCloseTo(48, 0);
    }
  });
});
