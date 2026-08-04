/**
 * Podcast detail (Phase 8, wave C): the episode list reached from the podcast
 * library, episode ordering, per-episode progress state, and starting playback
 * of one episode through the existing player.
 *
 * Fixture data (`apps/server/src/testSupport/fakes/fixtures/items-podcasts.json`):
 * `item-dailytech` ("Daily Tech Briefing") in `lib-podcasts`, with two episodes —
 * `ep-dailytech-1` "Pilot" (published 2026-07-01, 300s) and `ep-dailytech-2`
 * "The One About Rust" (published 2026-07-02, 360s) — so "Rust" is newer and
 * sorts first under the page's default ordering.
 */
import { expect, test, type Page } from '@playwright/test';

/** Opens the podcast library and clicks through to the Daily Tech Briefing detail page. */
async function openDailyTech(page: Page) {
  await page.goto('/library/lib-podcasts');
  await expect(page.getByTestId('library-page')).toBeVisible();
  await page.getByTestId('item-card-item-dailytech').click();
  await expect(page).toHaveURL(/\/podcast\/item-dailytech$/);
  await expect(page.getByTestId('podcast-detail-page')).toBeVisible();
}

test('the podcast library links to a detail page with the podcast’s own metadata', async ({
  page,
}) => {
  await openDailyTech(page);

  await expect(page.getByTestId('podcast-detail-page')).toContainText('Daily Tech Briefing');
  await expect(page.getByTestId('podcast-detail-page')).toContainText('Signal Media');
  await expect(page.getByTestId('podcast-detail-page')).toContainText(
    'Five minutes of technology news every weekday.',
  );
});

test('episodes are listed newest first by default', async ({ page }) => {
  await openDailyTech(page);

  const list = page.getByTestId('podcast-episode-list');
  await expect(list).toBeVisible();
  await expect(page.getByTestId('podcast-episode-ep-dailytech-1')).toBeVisible();
  await expect(page.getByTestId('podcast-episode-ep-dailytech-2')).toBeVisible();

  const headlines = list.locator('.m3-list-item__headline');
  await expect(headlines).toHaveText(['The One About Rust', 'Pilot']);
});

test('switching to oldest-first reorders the episode list', async ({ page }) => {
  await openDailyTech(page);

  await page.getByTestId('episode-order-oldest').click();

  const headlines = page.getByTestId('podcast-episode-list').locator('.m3-list-item__headline');
  await expect(headlines).toHaveText(['Pilot', 'The One About Rust']);
});

test('an episode marked finished shows as played in the list', async ({ page, request }) => {
  // Seed progress directly against the BFF (bypassing the UI, which has no
  // progress-editing surface of its own) — mirrors how a real listener would
  // arrive at this state: finishing the episode in another client.
  const response = await request.patch('/api/v1/progress/item-dailytech?episodeId=ep-dailytech-1', {
    data: { currentTime: 300, duration: 300, progress: 1, isFinished: true },
  });
  expect(response.ok()).toBe(true);

  await openDailyTech(page);

  await expect(page.getByTestId('podcast-episode-ep-dailytech-1')).toContainText('Played');
});

test('playing an episode from the detail page starts the mini player', async ({ page }) => {
  // The fixture audio can't decode — same neutralisation `e2e/app/player.spec.ts`
  // uses, for the same reason: without it, `HTMLMediaElement`'s native `error`
  // event and `play()` rejecting both race the assertions below.
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype;
    proto.play = () => Promise.resolve();
    proto.pause = function () {};
    Object.defineProperty(proto, 'src', {
      configurable: true,
      get(this: HTMLMediaElement & { _auralisSrc?: string }) {
        return this._auralisSrc ?? '';
      },
      set(this: HTMLMediaElement & { _auralisSrc?: string }, value: string) {
        this._auralisSrc = value;
      },
    });
  });

  await openDailyTech(page);

  await page.getByTestId('podcast-episode-ep-dailytech-2').click();

  await expect(page.getByTestId('mini-player')).toBeVisible();
  // The mini player shows the *episode's* own title as the primary line — every
  // episode of a show looked identical while playing before this, since the store
  // only ever held the podcast (the library item `load()` is handed, per
  // PodcastDetailPage.tsx's header comment) — with the podcast's own title
  // demoted to the secondary line, the way a book shows title-over-author. See
  // playerUi.ts's `playerDisplayMeta`.
  await expect(page.getByTestId('mini-player-title')).toContainText('The One About Rust');
  await expect(page.locator('.auralis-mini-player__author')).toContainText('Daily Tech Briefing');
});

test('the mini player and Now Playing surface the episode title, not the podcast title, while an episode plays', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype;
    proto.play = () => Promise.resolve();
    proto.pause = function () {};
    Object.defineProperty(proto, 'src', {
      configurable: true,
      get(this: HTMLMediaElement & { _auralisSrc?: string }) {
        return this._auralisSrc ?? '';
      },
      set(this: HTMLMediaElement & { _auralisSrc?: string }, value: string) {
        this._auralisSrc = value;
      },
    });
  });

  await openDailyTech(page);
  await page.getByTestId('podcast-episode-ep-dailytech-2').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();

  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();

  const title = page.getByTestId('now-playing').locator('.auralis-now-playing__title');
  const author = page.getByTestId('now-playing').locator('.auralis-now-playing__author');
  await expect(title).toContainText('The One About Rust');
  await expect(author).toContainText('Daily Tech Briefing');
});
