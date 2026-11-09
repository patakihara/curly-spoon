import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { fontsLoaded, signIn } from './shell-steps';

/**
 * Keeping a song from Search's menu, on the server with recorded upstreams, the stand-in YouTube
 * Music (`server/e2e/standInMusic.ts`) and stand-in song steps (`server/e2e/standInMedia.ts`), whose
 * keep stages its stream at 38% for as long as the test looks. Titles come from the server's answer.
 */

/** Each size, and what a row downloading at 38% says: a phone's row has room for the share alone. */
const SIZES = [
  { name: 'phone', viewport: { width: 390, height: 844 }, downloading: '38%' },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, downloading: 'Downloading · 38%' },
];

let recorded: Recorded;
test.beforeEach(() => test.setTimeout(90_000));
test.afterEach(() => recorded?.stop());

interface Song {
  ref: { id: string };
  title: string;
}

/** A song's row in Search: ResultRow's root, around its title's line and its text column. */
const songRow = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).first().locator('xpath=ancestor::div[3]');

for (const { name, viewport, downloading } of SIZES) {
  test.describe(`at ${viewport.width} px`, () => {
    test.use({ viewport });

    test(`[M3.keep] a streamed song's menu keeps it, and its row then says where the keep stands (${name})`, async ({
      page,
    }, info) => {
      recorded = await serveRecorded({ nothingPlayed: true, music: 'answers' });
      await signIn(page, recorded.origin, '/search?q=never', { everyone: false });
      await fontsLoaded(page);
      const answer = await page.request.get(`${recorded.origin}/api/search?q=never`);
      const [first, second] = ((await answer.json()) as { songs: Song[] }).songs;
      const row = songRow(page, first!.title);
      const menu = row.getByRole('button', { name: 'More options', exact: true });
      const keep = page.getByRole('menuitem', { name: 'Add to library' });

      await row.scrollIntoViewIfNeeded();
      await expect(menu).toBeEnabled();
      await menu.click();
      await expect(keep).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${name}-menu.png`) });
      await keep.click();

      await expect(row).toContainText(downloading, { timeout: 20_000 });
      await expect(menu).toBeDisabled();
      await page.screenshot({ path: info.outputPath(`${name}-keeping.png`), fullPage: true });
      const requests = await page.request.get(`${recorded.origin}/api/requests`);
      const { inFlight } = (await requests.json()) as {
        inFlight: { medium: string; title: string }[];
      };
      expect(inFlight).toContainEqual(
        expect.objectContaining({ medium: 'song', title: first!.title }),
      );

      // Only the song kept changes: the next still offers to be kept.
      const other = songRow(page, second!.title);
      await expect(other).not.toContainText('38%');
      await expect(other.getByRole('button', { name: 'More options', exact: true })).toBeEnabled();
    });
  });
}
