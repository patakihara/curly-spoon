import { expect, test, type Page } from '@playwright/test';
import { chroma, pixels } from './pixels';

/**
 * Book cards in lists, on a series: one you don't own is greyed, and a tap on it requests it
 * (docs/plan/06-get.md), its page kept in the card's menu; one you own opens its page.
 */

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** The card titled `title`: the column holding its art and caption. */
const cardOf = (page: Page, title: string) =>
  page
    .locator('div[style*="flex-direction: column"]')
    .filter({ has: page.getByText(title, { exact: true }) })
    .last();

test('[M0.canvas] a book you do not own is greyed: its art has no colour left, unlike one you own', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/books/series/sample');
  await page.evaluate(() => document.fonts.ready);
  const artOf = (title: string) =>
    cardOf(page, title).locator('div[style*="aspect-ratio"]').first();
  const owned = artOf('Shadows and Sighs');
  const greyed = artOf('A Grain of Salt');
  await expect(greyed.locator('img')).toHaveJSProperty('complete', true);
  await expect(owned.locator('img')).toHaveJSProperty('complete', true);
  expect(chroma(await pixels(page, greyed))).toBeLessThan(3);
  expect(chroma(await pixels(page, owned))).toBeGreaterThan(10);
});

for (const size of SIZES) {
  test(`[M0.canvas] tapping a book you do not own requests it, and its page stays in the card's menu, on a ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto('/books/series/sample');
    const card = cardOf(page, 'A Grain of Salt');
    await card.getByText('A Grain of Salt', { exact: true }).click();
    await expect(page).toHaveURL(/\/books\/series\/sample$/);
    await expect(card.locator('[title="Requested"]')).toBeVisible();

    await page.goto('/books/series/sample');
    const again = cardOf(page, 'A Grain of Salt');
    await again.hover();
    await again.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/books\/a-grain-of-salt$/);
  });
}

test('[M0.canvas] tapping a book you own opens its page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/books/series/sample');
  await page.getByText('Shadows and Sighs', { exact: true }).click();
  await expect(page).toHaveURL(/\/books\/shadows-and-sighs$/);
});
