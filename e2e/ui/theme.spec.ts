import { expect, test } from '@playwright/test';

/**
 * The theme runtime: switching source colour or light/dark must actually repaint the
 * shell's CSS custom properties, not just update some in-memory state.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('ThemeProvider', () => {
  test('renders in dark mode by default with the amber fallback source colour', async ({
    page,
  }) => {
    await expect(page.getByTestId('mode-dark')).toBeVisible();
    const primaryText = await page.getByTestId('current-primary-value').textContent();
    expect(primaryText).toMatch(/#[0-9a-f]{6}/);
  });

  // Wave 16c-2-W-1 (docs/ROADMAP.md §16) replaced createScheme's HCT-derived generator
  // with Sonora's fixed chroma tables (docs/design/SONORA.md §1.5/§1.6); `sourceColor`
  // is accepted for API compatibility only and no longer feeds `--m3-primary` (or any
  // other `--m3-*` chroma role). This test used to assert the opposite (the gallery's
  // source-colour swatch repainting --m3-primary); it now pins the new contract, which
  // is also the real-world consequence for Sofia's Settings colour picker: it no longer
  // visibly changes any --m3-*-driven surface, only --accent (untouched by this wave).
  test('changing the source colour does NOT repaint --m3-primary — Sonora fixes the chroma role', async ({
    page,
  }) => {
    const root = page.locator('.auralis-theme-root');
    const before = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--m3-primary').trim(),
    );

    await page.getByTestId('color-blue').click();
    // Cross-fade takes ~500ms (spring.slow); wait past it before asserting the resting value.
    await page.waitForTimeout(700);

    const after = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--m3-primary').trim(),
    );
    expect(after).toBe(before);
  });

  test('switching mode toggles data-theme and repaints --m3-surface', async ({ page }) => {
    const root = page.locator('.auralis-theme-root');
    await expect(root).toHaveAttribute('data-theme', 'dark');
    const darkSurface = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--m3-surface').trim(),
    );

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);

    await expect(root).toHaveAttribute('data-theme', 'light');
    const lightSurface = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--m3-surface').trim(),
    );
    expect(lightSurface).not.toBe(darkSurface);

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });

  test('is deterministic: the same source colour always repaints to the same value', async ({
    page,
  }) => {
    const root = page.locator('.auralis-theme-root');
    await page.getByTestId('color-green').click();
    await page.waitForTimeout(700);
    const first = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--m3-primary').trim(),
    );

    await page.getByTestId('color-amber').click();
    await page.waitForTimeout(700);
    await page.getByTestId('color-green').click();
    await page.waitForTimeout(700);
    const second = await root.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--m3-primary').trim(),
    );

    expect(second).toBe(first);
  });
});
