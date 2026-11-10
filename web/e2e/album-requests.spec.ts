import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { fontsLoaded, keyOf, signIn } from './shell-steps';

/**
 * Asking for an album the library lacks, on the server with recorded upstreams: Search's album rows
 * are MusicBrainz's recorded release-group search, through the real catalogue, and the stand-in
 * medium (`server/e2e/standInMedia.ts`, never in the image) answers an album's request with a choice
 * of two releases, the one chosen then queued. An album whose every track is a kept song is the
 * recorded album made so (`server/e2e/standInAlbums.ts`).
 */

const SLIP = 'The Slip';
const LOOKING_AGAIN = { timeout: 15_000 };

test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
});

let recorded: Recorded;
test.beforeEach(() => test.setTimeout(90_000));
test.afterEach(() => recorded?.stop());

/** The album's row in Search: ResultRow's root, around its title's line and its text column. */
const albumRow = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).first().locator('xpath=ancestor::div[3]');

/** The requests the server lists for the person signed in. */
async function requested(page: Page) {
  const list = await page.request.get(`${recorded.origin}/api/requests`);
  return (await list.json()) as {
    inFlight: { title: string; medium: string; status: string }[];
    needsChoice: { title: string; medium: string }[];
  };
}

test('[M3.albums] an album found in Search is added to the library, stands on its row, and is chosen on Requests', async ({
  page,
}, info) => {
  recorded = await serveRecorded({ nothingPlayed: true });
  await signIn(page, recorded.origin, '/search?q=nine+inch+nails+the+slip', { everyone: false });
  const shot = (step: string) =>
    page.screenshot({ path: info.outputPath(`${step}.png`), fullPage: true });

  const row = albumRow(page, SLIP);
  const add = row.getByRole('button', { name: 'Add to library', exact: true });
  await expect(add).toBeVisible(LOOKING_AGAIN);
  await expect(row).toContainText('Album · Nine Inch Nails · 2008');
  await shot('offered');

  await add.click();
  await expect(row).toContainText('Needs choice', LOOKING_AGAIN);
  await expect(row.getByRole('button', { name: 'Add to library', exact: true })).toHaveCount(0);
  await shot('needs-choice');
  expect((await requested(page)).needsChoice).toEqual([
    expect.objectContaining({ title: SLIP, medium: 'album' }),
  ]);

  // Its row leads to Requests, which lists it with its two releases; one tap starts the one chosen.
  await row.getByText(SLIP, { exact: true }).click();
  await expect(page).toHaveURL(`${recorded.origin}/requests`);
  await fontsLoaded(page);
  const flac = page.getByRole('button', { name: `${SLIP} [FLAC]`, exact: true });
  await expect(flac).toBeVisible(LOOKING_AGAIN);
  await expect(page.getByText(`${SLIP} [MP3 320]`, { exact: true })).toBeVisible();
  await shot('requests-choice');
  await flac.click();
  await expect(flac).toHaveCount(0, LOOKING_AGAIN);
  await expect(page.locator('body')).toContainText('Queued', LOOKING_AGAIN);
  await shot('requests-queued');
  expect((await requested(page)).inFlight).toEqual([
    expect.objectContaining({ title: SLIP, medium: 'album', status: 'queued' }),
  ]);

  await page.goto(`${recorded.origin}/search?q=nine+inch+nails+the+slip`);
  await fontsLoaded(page);
  await expect(albumRow(page, SLIP)).toContainText('Queued', LOOKING_AGAIN);
});

test("[M3.albums] a kept-only album's page offers Add to library, which asks for the album", async ({
  page,
}, info) => {
  recorded = await serveRecorded({ nothingPlayed: true, keptAlbum: true });
  const path = `/music/albums/${keyOf(recorded.album)}`;
  await signIn(page, recorded.origin, path, { everyone: false });
  const posts: unknown[] = [];
  page.on('request', (sent) => {
    if (sent.method() === 'POST' && new URL(sent.url()).pathname === '/api/requests') {
      posts.push(sent.postDataJSON());
    }
  });

  const detail = (await (
    await page.request.get(`${recorded.origin}/api/items/${keyOf(recorded.album)}`)
  ).json()) as { title: string; request: unknown };
  expect(detail.request).not.toBeNull();

  const menu = page.getByRole('button', { name: 'More options', exact: true }).first();
  await expect(menu).toBeEnabled(LOOKING_AGAIN);
  await menu.click();
  const offer = page.getByRole('menuitem').filter({ hasText: 'Add to library' });
  await expect(offer).toBeVisible();
  await expect(offer).toContainText('A lossless copy, by torrent');
  await page.screenshot({ path: info.outputPath('kept-album-menu.png'), fullPage: true });
  await offer.click();

  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ ref: detail.request });
  await expect
    .poll(async () => (await requested(page)).needsChoice.map(({ title }) => title), LOOKING_AGAIN)
    .toEqual([detail.title]);
});

test('[M3.albums] an album page of the household offers nothing in its menu', async ({ page }) => {
  recorded = await serveRecorded({ nothingPlayed: true });
  await signIn(page, recorded.origin, `/music/albums/${keyOf(recorded.album)}`, {
    everyone: false,
  });
  await fontsLoaded(page);
  await expect(
    page.getByRole('button', { name: 'More options', exact: true }).first(),
  ).toBeDisabled(LOOKING_AGAIN);
});
