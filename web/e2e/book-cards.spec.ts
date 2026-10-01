import { expect, test, type Page } from '@playwright/test';
import { chroma, pixels } from './pixels';

/**
 * Book cards in lists, on a series: one you don't own is greyed; until requests exist
 * (docs/plan/06-get.md) a tap on it opens its page, as a tap on one you own does.
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
  // No request endpoint exists yet, so the page binds no request: the card claims none and a tap
  // opens the book's page, as one you own does.
  test(`[M0.states/c] until requests exist, tapping a book you do not own claims no request and opens its page, on a ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto('/books/series/sample');
    const card = cardOf(page, 'A Grain of Salt');
    await card.getByText('A Grain of Salt', { exact: true }).click();
    await expect(page).toHaveURL(/\/books\/a-grain-of-salt$/);
    await expect(page.locator('[title="Requested"]')).toHaveCount(0);
  });
}

test('[M0.canvas] tapping a book you own opens its page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/books/series/sample');
  await page.getByText('Shadows and Sighs', { exact: true }).click();
  await expect(page).toHaveURL(/\/books\/shadows-and-sighs$/);
});
