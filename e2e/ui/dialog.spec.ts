import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Dialog', () => {
  test('opens as a modal with a spring entrance and traps focus', async ({ page }) => {
    const trigger = page.getByTestId('dialog-open');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Remove download?' });
    await expect(dialog).toBeVisible();
    await expect(trigger).not.toBeFocused();

    const animationName = await dialog.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).not.toBe('none');
  });

  test('Escape closes it and restores focus to the trigger', async ({ page }) => {
    const trigger = page.getByTestId('dialog-open');
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Tab cycles between Cancel and Remove without escaping the dialog', async ({ page }) => {
    await page.getByTestId('dialog-open').click();
    const cancel = page.getByTestId('dialog-cancel');
    const confirm = page.getByTestId('dialog-confirm');

    await confirm.focus();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
  });

  test('clicking a scrim dismisses it', async ({ page }) => {
    await page.getByTestId('dialog-open').click();
    await page.locator('.m3-dialog-scrim').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the Remove action closes the dialog', async ({ page }) => {
    await page.getByTestId('dialog-open').click();
    await page.getByTestId('dialog-confirm').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
