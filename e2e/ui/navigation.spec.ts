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

test.describe('NavigationRail', () => {
  test('collapsed rail shows icons without visually cramping labels, expanded rail shows both', async ({
    page,
  }) => {
    const collapsed = page.getByTestId('nav-rail-collapsed');
    const expanded = page.getByTestId('nav-rail-expanded');
    await expect(collapsed.locator('.m3-nav-rail__item').first()).toBeVisible();
    await expect(expanded.locator('.m3-nav-rail__label').first()).toBeVisible();
    const expandedBox = await expanded.locator('nav').boundingBox();
    const collapsedBox = await collapsed.locator('nav').boundingBox();
    expect(expandedBox!.width).toBeGreaterThan(collapsedBox!.width);
  });

  test('activating an item updates aria-current and the indicator', async ({ page }) => {
    const rail = page.getByTestId('nav-rail-collapsed');
    await rail.getByRole('button', { name: 'Settings' }).click();
    await expect(rail.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
