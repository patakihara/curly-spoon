import { expect, test } from '@playwright/test';

/**
 * The theme runtime: switching source colour or light/dark must actually repaint the
 * shell's CSS custom properties, not just update some in-memory state.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('ThemeProvider', () => {
  test('renders in dark mode by default with the amber fallback source colour', async ({ page }) => {
    await expect(page.getByTestId('mode-dark')).toBeVisible();
    const primaryText = await page.getByTestId('current-primary-value').textContent();
    expect(primaryText).toMatch(/#[0-9a-f]{6}/);
  });

  test('changing the source colour repaints --m3-primary on the theme root', async ({ page }) => {
    const root = page.locator('.auralis-theme-root');
    const before = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--m3-primary').trim());

    await page.getByTestId('color-blue').click();
    // Cross-fade takes ~500ms (spring.slow); wait past it before asserting the resting value.
    await page.waitForTimeout(700);

    const after = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--m3-primary').trim());
    expect(after).not.toBe(before);
    expect(after).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('switching mode toggles data-theme and repaints --m3-surface', async ({ page }) => {
    const root = page.locator('.auralis-theme-root');
    await expect(root).toHaveAttribute('data-theme', 'dark');
    const darkSurface = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--m3-surface').trim());

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);

    await expect(root).toHaveAttribute('data-theme', 'light');
    const lightSurface = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--m3-surface').trim());
    expect(lightSurface).not.toBe(darkSurface);

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });

  test('is deterministic: the same source colour always repaints to the same value', async ({ page }) => {
    const root = page.locator('.auralis-theme-root');
    await page.getByTestId('color-green').click();
    await page.waitForTimeout(700);
    const first = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--m3-primary').trim());

    await page.getByTestId('color-amber').click();
    await page.waitForTimeout(700);
    await page.getByTestId('color-green').click();
    await page.waitForTimeout(700);
    const second = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--m3-primary').trim());

    expect(second).toBe(first);
  });
});
