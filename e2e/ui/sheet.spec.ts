import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Sheet', () => {
  test('opens as a modal dialog with a scrim, and traps focus', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    const panel = page.getByRole('dialog', { name: 'Queue' });
    await expect(panel).toBeVisible();
    await expect(page.locator('.m3-sheet-scrim')).toBeVisible();
    // Focus should have moved into the sheet, not stayed on the trigger button.
    await expect(page.getByTestId('sheet-open')).not.toBeFocused();
  });

  test('Escape closes it and returns focus to the trigger', async ({ page }) => {
    const trigger = page.getByTestId('sheet-open');
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Queue' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Queue' })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('clicking the scrim closes it', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    await page.locator('.m3-sheet-scrim').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog', { name: 'Queue' })).toHaveCount(0);
  });

  test('dragging the handle down past the dismiss threshold closes the sheet', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    const handle = page.locator('.m3-sheet-handle-area');
    const box = await handle.boundingBox();
    if (!box) throw new Error('handle not visible');

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Drag most of the way down the viewport — well past the dismiss threshold.
    const viewport = page.viewportSize()!;
    await page.mouse.move(startX, viewport.height - 10, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByRole('dialog', { name: 'Queue' })).toHaveCount(0);
  });

  test('dragging the handle up a little snaps to the taller detent instead of dismissing', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    const panel = page.getByRole('dialog', { name: 'Queue' });
    const heightBefore = (await panel.boundingBox())!.height;

    const handle = page.locator('.m3-sheet-handle-area');
    const box = await handle.boundingBox();
    if (!box) throw new Error('handle not visible');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const heightAfter = (await panel.boundingBox())!.height;
    expect(heightAfter).toBeGreaterThan(heightBefore);
  });

  test('Tab cycles focus within the sheet rather than escaping to the page', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    const closeButton = page.getByTestId('sheet-close');
    await closeButton.focus();
    await page.keyboard.press('Tab');
    // With only one focusable descendant, Tab should wrap back to it, not to page chrome.
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focused).toBe('sheet-close');
  });
});
