import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Skeleton', () => {
  test('renders text, circular and rectangular shapes, hidden from a11y tree', async ({ page }) => {
    for (const testId of ['skeleton-text', 'skeleton-circular', 'skeleton-rectangular']) {
      const skeleton = page.getByTestId(testId);
      await expect(skeleton).toBeVisible();
      await expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    }
  });

  test('shimmers by default', async ({ page }) => {
    const skeleton = page.getByTestId('skeleton-text');
    const animationName = await skeleton.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).not.toBe('none');
  });

  test('honours prefers-reduced-motion by not shimmering', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const skeleton = page.getByTestId('skeleton-text');
    const animationName = await skeleton.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe('none');
  });
});
