import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Fab', () => {
  test('renders sm/md/lg and extended variants', async ({ page }) => {
    await expect(page.getByTestId('fab-sm')).toBeVisible();
    await expect(page.getByTestId('fab-md')).toBeVisible();
    await expect(page.getByTestId('fab-lg')).toBeVisible();
    await expect(page.getByTestId('fab-extended')).toBeVisible();
    await expect(page.getByTestId('fab-extended')).toContainText('Create');
  });

  test('the medium FAB meets the 48px touch target', async ({ page }) => {
    const box = await page.getByTestId('fab-md').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);
  });

  test('has an accessible name via aria-label', async ({ page }) => {
    await expect(page.getByTestId('fab-md')).toHaveAccessibleName('Add');
  });
});
