import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Marquee', () => {
  test('scrolls text that overflows its container', async ({ page }) => {
    const text = page.getByTestId('marquee-overflowing').locator('.m3-marquee__text');
    await expect(text).toHaveClass(/m3-marquee__text--animating/);
    const animationName = await text.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).not.toBe('none');
  });

  test('does not scroll text that already fits', async ({ page }) => {
    const text = page.getByTestId('marquee-short').locator('.m3-marquee__text');
    await expect(text).not.toHaveClass(/m3-marquee__text--animating/);
    const animationName = await text.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe('none');
  });

  test('honours prefers-reduced-motion by not scrolling even when it overflows', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const text = page.getByTestId('marquee-overflowing').locator('.m3-marquee__text');
    await expect(text).not.toHaveClass(/m3-marquee__text--animating/);
  });
});
