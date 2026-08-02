import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Card', () => {
  test('renders elevated, filled and outlined variants', async ({ page }) => {
    await expect(page.getByTestId('card-elevated')).toBeVisible();
    await expect(page.getByTestId('card-filled')).toBeVisible();
    await expect(page.getByTestId('card-outlined')).toBeVisible();
  });

  test('a static card is not a button and has no interactive semantics', async ({ page }) => {
    const card = page.getByTestId('card-elevated');
    const tagName = await card.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('div');
  });

  test('an interactive card is a real, keyboard-operable button', async ({ page }) => {
    const card = page.getByTestId('card-interactive');
    const tagName = await card.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('button');
    await card.focus();
    await expect(card).toBeFocused();
  });
});
