import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('SearchField', () => {
  test('is wired as a combobox', async ({ page }) => {
    const input = page.getByTestId('search-field').locator('input');
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('typing opens the suggestion listbox', async ({ page }) => {
    const field = page.getByTestId('search-field');
    const input = field.locator('input');
    await input.fill('Pir');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(field.getByRole('listbox')).toBeVisible();
    await expect(field.getByRole('option')).toHaveCount(3);
  });

  test('ArrowDown moves aria-activedescendant through suggestions, Enter selects', async ({ page }) => {
    const field = page.getByTestId('search-field');
    const input = field.locator('input');
    await input.fill('a');
    await page.keyboard.press('ArrowDown');
    const firstOptionId = await field.getByRole('option').first().getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', firstOptionId!);

    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('the clear button empties the field and returns focus to it', async ({ page }) => {
    const field = page.getByTestId('search-field');
    const input = field.locator('input');
    await input.fill('lyrics');
    await field.getByRole('button', { name: 'Clear search' }).click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
  });
});
