import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Snackbar', () => {
  test('is announced politely and shows the message plus action', async ({ page }) => {
    await page.getByTestId('snackbar-trigger').click();
    const snackbar = page.getByTestId('snackbar-display').locator('.m3-snackbar');
    await expect(snackbar).toHaveAttribute('role', 'status');
    await expect(snackbar).toHaveAttribute('aria-live', 'polite');
    await expect(snackbar).toContainText('Added to queue');
    await expect(snackbar.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  test('the close button dismisses it', async ({ page }) => {
    await page.getByTestId('snackbar-trigger').click();
    const snackbar = page.getByTestId('snackbar-display').locator('.m3-snackbar');
    await expect(snackbar).toBeVisible();
    await snackbar.getByRole('button', { name: 'Dismiss' }).click();
    await expect(snackbar).toHaveCount(0);
  });

  test('a second enqueue while one is showing queues rather than replacing it', async ({ page }) => {
    await page.getByTestId('snackbar-trigger').click();
    await page.getByTestId('snackbar-trigger').click();
    // Still only ever one snackbar element on screen at a time.
    await expect(page.getByTestId('snackbar-display').locator('.m3-snackbar')).toHaveCount(1);
  });
});
