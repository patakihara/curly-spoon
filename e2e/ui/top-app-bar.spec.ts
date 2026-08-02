import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('TopAppBar', () => {
  test('small variant renders a single compact row', async ({ page }) => {
    const bar = page.getByTestId('top-app-bar-small');
    await expect(bar.getByText('Library')).toBeVisible();
  });

  test('large variant starts expanded and collapses once its container scrolls', async ({ page }) => {
    const container = page.getByTestId('top-app-bar-large-scroll-container');
    const largeTitle = container.locator('.m3-top-app-bar__title--large');
    await expect(largeTitle).toBeVisible();

    await container.evaluate((el) => el.scrollTo({ top: 200 }));
    await page.waitForTimeout(100);

    await expect(largeTitle).toHaveCount(0);
    await expect(container.locator('.m3-top-app-bar__title').first()).toBeVisible();
  });
});
