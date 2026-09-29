import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * 12-front.md's "Shell and navigation", walked by tapping the shell's own controls, never by
 * going to a URL in between: ✕ returns to whatever opened a page, each destination keeps its own
 * stack, the mini-player opens Now Playing, the player's tabs switch sheets, a sheet closes to the
 * page under it, and the browser's back goes to the previous view. The same journey runs on the
 * phone's bottom bar and on the desktop's rail.
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
 * On the phone, an album opens with its menu up as the canvas draws it, a sheet over a scrim that
 * covers the page: tapping the scrim closes it, as it would for anyone using the app.
 */
async function dismissAlbumMenu(page: Page, phone: boolean) {
  if (!phone) return;
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.mouse.click(page.viewportSize()!.width / 2, 40);
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
    await dismissAlbumMenu(page, size.phone);
    await artistLink(page, 'Deep Inertia').click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
    await item(page, 'Shadows and Sighs').click();
    await expect(page).toHaveURL('/music/albums/shadows-and-sighs');
    await dismissAlbumMenu(page, size.phone);

    // ✕ returns to whatever opened the album: the artist.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
    await heading(page, 'Deep Inertia');

    // Music keeps its stack while Books is open: back on the album, whose ✕ goes to the artist.
    await item(page, 'Shadows and Sighs').click();
    await dismissAlbumMenu(page, size.phone);
    await destination(page, 'Books').click();
    await expect(page).toHaveURL('/books');
    await destination(page, 'Music').click();
    await expect(page).toHaveURL('/music/albums/shadows-and-sighs');
    await dismissAlbumMenu(page, size.phone);

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
    await dismissAlbumMenu(page, size.phone);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
  });
}
