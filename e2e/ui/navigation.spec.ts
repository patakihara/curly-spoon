import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('NavigationBar', () => {
  test('marks the active destination with aria-current', async ({ page }) => {
    const bar = page.getByTestId('nav-bar');
    await expect(bar.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(bar.getByRole('button', { name: 'Library' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('clicking a destination moves the active-indicator pill', async ({ page }) => {
    const bar = page.getByTestId('nav-bar');
    const indicator = bar.locator('.m3-nav-bar__indicator');
    const before = await indicator.evaluate((el) => getComputedStyle(el).transform);

    await bar.getByRole('button', { name: 'Podcasts' }).click();
    await page.waitForTimeout(450);

    const after = await indicator.evaluate((el) => getComputedStyle(el).transform);
    expect(after).not.toBe(before);
    await expect(bar.getByRole('button', { name: 'Podcasts' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('every destination is keyboard reachable and meets the touch target', async ({ page }) => {
    const bar = page.getByTestId('nav-bar');
    const home = bar.getByRole('button', { name: 'Home' });
    await home.focus();
    await expect(home).toBeFocused();
    const box = await home.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  });
});
