import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * 12-front.md's "Shell and navigation", walked by tapping the shell's own controls, never by
 * going to a URL in between: ✕ returns to whatever opened a page, each destination keeps its own
 * stack, the mini-player opens Now Playing, the player's tabs switch sheets, a sheet closes to the
 * page under it, and the browser's back goes to the previous view. A reload carries on where it
 * was. The same journey runs on the phone's bottom bar and on the desktop's rail, whose hamburger
 * collapses it and back. A page's menu starts closed, opens from its button and closes on the
 * phone's scrim, back to the page under it, or on an item.
 */
const SIZES = [
  { name: 'phone, through the bottom bar', width: 390, height: 844, phone: true },
  { name: 'desktop, through the rail', width: 1440, height: 900, phone: false },
];

/** A destination on the bottom bar or the rail: the row drawing its icon and its label. */
const destination = (page: Page, label: string): Locator =>
  page
    .locator(
      `xpath=//div[span[text()="${label}"] and span/span[contains(@style, "Material Symbols")]]`,
    )
    .first();

/** The mini-player: on the phone the whole bar, on desktop the player bar's track block. */
const miniPlayer = (page: Page, phone: boolean): Locator => {
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  return phone
    ? pause.locator('xpath=..')
    : pause.locator('xpath=ancestor::div[contains(@style, "grid-template-columns")][1]/div[1]');
};

/** A card or row showing `title`, tapped to open what it names. */
const item = (page: Page, title: string) => page.getByText(title, { exact: true }).first();

/** The album header's artist, a link to the artist's page. */
const artistLink = (page: Page, name: string) =>
  page.locator('div[style*="cursor: pointer"]', { hasText: new RegExp(`^${name}$`) }).first();

/**
 * The album header's menu: closed as the album opens, it opens from its button; on the phone a
 * sheet over a scrim, which a tap closes back to the album, and anywhere an item closes it.
 */
async function useAlbumMenu(page: Page, phone: boolean) {
  const menu = page.getByRole('menu');
  const button = page.getByRole('button', { name: 'More options', exact: true }).first();
  await expect(menu).toBeHidden();
  if (phone) {
    await button.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(page.viewportSize()!.width / 2, 40);
    await expect(menu).toBeHidden();
  }
  await button.click();
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /Add to library/ }).click();
  await expect(menu).toBeHidden();
}

/** The page's heading, as the canvas test finds it. */
const heading = (page: Page, text: string) =>
  expect(
    page
      .getByText(new RegExp(`^\\s*${text}\\s*$`, 'i'))
      .locator('visible=true')
      .first(),
  ).toBeVisible();

for (const size of SIZES) {
  test(`[M0.canvas] the shell navigates the map by tapping, on a ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/', { waitUntil: 'networkidle' });

    await destination(page, 'Music').click();
    await expect(page).toHaveURL('/music');
    await item(page, 'Between Lines of Light').click();
    await expect(page).toHaveURL('/music/albums/between-lines-of-light');
    await useAlbumMenu(page, size.phone);
    await expect(page).toHaveURL('/music/albums/between-lines-of-light');
    await artistLink(page, 'Deep Inertia').click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
    await item(page, 'Shadows and Sighs').click();
    await expect(page).toHaveURL('/music/albums/shadows-and-sighs');

    // A reload carries on where it was: ✕ still returns to whatever opened the album, the artist.
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
    await heading(page, 'Deep Inertia');

    // Music keeps its stack while Books is open: back on the album, whose ✕ goes to the artist.
    await item(page, 'Shadows and Sighs').click();
    await destination(page, 'Books').click();
    await expect(page).toHaveURL('/books');
    await destination(page, 'Music').click();
    await expect(page).toHaveURL('/music/albums/shadows-and-sighs');

    // The mini-player opens Now Playing; its tabs switch sheets; closing returns to the album.
    await miniPlayer(page, size.phone).click();
    await expect(page).toHaveURL('/playing');
    await heading(page, 'Now Playing');
    await page.getByRole('tab', { name: 'Queue' }).click();
    await expect(page).toHaveURL('/playing/queue');
    await page
      .getByRole('button', { name: size.phone ? 'Collapse player' : 'Close Player', exact: true })
      .click();
    await expect(page).toHaveURL('/music/albums/shadows-and-sighs');

    // The browser's back goes to the previous view, wherever that was: the sheet just closed.
    await page.goBack();
    await expect(page).toHaveURL('/playing/queue');
    await page.goBack();
    await expect(page).toHaveURL('/music/albums/shadows-and-sighs');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');

    // Tapping the destination showing adds no history: the browser's back leaves it.
    await destination(page, 'Books').click();
    await destination(page, 'Books').click();
    await page.goBack();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
  });
}

test("[M0.canvas] the rail's hamburger collapses the labelled rail to the icon rail and back, staying so from page to page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/music', { waitUntil: 'networkidle' });
  const collapse = page.getByRole('button', { name: 'Collapse rail', exact: true });
  const expand = page.getByRole('button', { name: 'Expand rail', exact: true });
  const rail = collapse.locator('xpath=ancestor::*[contains(@style, "rail-width")][1]');
  const wide = (await rail.boundingBox())!.width;

  await collapse.click();
  await expect(expand).toBeVisible();
  const narrow = (await expand
    .locator('xpath=ancestor::*[contains(@style, "rail-width")][1]')
    .boundingBox())!.width;
  expect(narrow).toBeLessThan(wide);

  await destination(page, 'Books').click();
  await expect(page).toHaveURL('/books');
  await expect(expand).toBeVisible();
  await destination(page, 'Settings').click();
  await expect(page).toHaveURL('/settings');
  await expect(expand).toBeVisible();

  await expand.click();
  await expect(collapse).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/books');
  await expect(collapse).toBeVisible();
});
