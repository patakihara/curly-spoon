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

  test('toggle selected state visually springs the glyph (transform changes)', async ({ page }) => {
    const toggle = page.getByTestId('icon-button-toggle');
    const glyph = toggle.locator('.m3-icon-button__glyph');
    const before = await glyph.evaluate((el) => getComputedStyle(el).transform);
    await toggle.click();
    await page.waitForTimeout(500);
    const after = await glyph.evaluate((el) => getComputedStyle(el).transform);
    expect(after).not.toBe(before);
    await toggle.click(); // restore
  });
});
