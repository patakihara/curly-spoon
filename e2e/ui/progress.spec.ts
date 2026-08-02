import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('LinearProgress', () => {
  test('determinate reports its value via aria-valuenow', async ({ page }) => {
    const bar = page.getByTestId('linear-progress-determinate').locator('[role="progressbar"]');
    await expect(bar).toHaveAttribute('aria-valuenow', '60');
  });

  test('indeterminate omits aria-valuenow and animates', async ({ page }) => {
    const bar = page.getByTestId('linear-progress-indeterminate').locator('[role="progressbar"]');
    await expect(bar).not.toHaveAttribute('aria-valuenow');
    const fill = bar.locator('.m3-linear-progress__indeterminate');
    const animationName = await fill.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).not.toBe('none');
  });

  test('wavy indeterminate uses a wave background distinct from the plain bar', async ({ page }) => {
    const wavyFill = page
      .getByTestId('linear-progress-wavy')
      .locator('.m3-linear-progress__indeterminate');
    const plainFill = page
      .getByTestId('linear-progress-indeterminate')
      .locator('.m3-linear-progress__indeterminate');
    const wavyImage = await wavyFill.evaluate((el) => getComputedStyle(el).backgroundImage);
    const plainImage = await plainFill.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(wavyImage).not.toBe(plainImage);
    expect(wavyImage).toContain('url');
  });
});

test.describe('CircularProgress', () => {
  test('determinate reports its value', async ({ page }) => {
    const ring = page.getByTestId('circular-progress-determinate').locator('[role="progressbar"]');
    await expect(ring).toHaveAttribute('aria-valuenow', '40');
  });

  test('indeterminate spins continuously', async ({ page }) => {
    const ring = page.getByTestId('circular-progress-indeterminate').locator('[role="progressbar"]');
    await expect(ring).not.toHaveAttribute('aria-valuenow');
    const animationName = await ring.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).not.toBe('none');
  });
});
