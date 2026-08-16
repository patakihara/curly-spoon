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
    // moves, to the resolved --accent-ink value.
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
    // Dark is the gallery's default mode; --accent-ink == --accent there (#8b5cf6).
    expect(colorAfter).toBe('rgb(139, 92, 246)');

    await toggle.click(); // restore
  });

  test('the selected accent colour also resolves in light mode, and differs from dark', async ({
    page,
  }) => {
    const toggle = page.getByTestId('icon-button-toggle');

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);

    await toggle.click();
    const lightColor = await toggle.evaluate((el) => getComputedStyle(el).color);
    // --accent-ink in light is color-mix(in oklch, var(--accent) 58%, black) — assert it
    // differs from dark's raw #8b5cf6 passthrough, proving the mix actually ran rather
    // than resolving to an empty/inherited value.
    expect(lightColor).not.toBe('rgb(139, 92, 246)');
    expect(lightColor).not.toBe('');

    await toggle.click(); // restore selected=false
    await page.getByTestId('mode-dark').click(); // restore for other tests
  });
});
