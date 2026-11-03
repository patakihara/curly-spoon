import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { goWithin, keyOf, signIn as signInAt } from './shell-steps';

/**
 * Every Play button in the web shell names its action (M1.shell, check (e)): an item's own page
 * offers Play (or Resume) and Play next as separate buttons, and a show's episode rows offer Play
 * episode, which plays it now. On the server with recorded upstreams.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

const signIn = (page: Page, path: string) => signInAt(page, recorded.origin, path);

test.describe('[M1.shell/e] each Play button names its action', () => {
  test("names an episode page's Play and Play next apart, and a show's rows Play episode", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/podcasts/episodes/${keyOf(recorded.episode)}`);
    await expect(page.getByRole('button', { name: /^play_arrow\s*(Play|Resume)$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Play next$/ })).toBeVisible();

    await goWithin(page, `/podcasts/${keyOf(recorded.show)}`);
    const rows = page.getByRole('button', { name: 'Play episode', exact: true });
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("names a book's and an album's Play as Play or Resume", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    await expect(page.getByRole('button', { name: /^play_arrow\s*(Play|Resume)$/ })).toBeVisible();
    await goWithin(page, `/music/albums/${keyOf(recorded.album)}`);
    await expect(page.getByRole('button', { name: /^play_arrow\s*(Play|Resume)$/ })).toBeVisible();
  });
});
