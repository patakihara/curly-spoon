import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { keyOf, signIn, titlePlaying } from './shell-steps';

/**
 * Following a show, on the server with recorded upstreams. From Search, a show the household lacks
 * is subscribed to through a request: iTunes answers from its recordings, and the stand-in podcast
 * medium (`server/e2e/standInShows.ts`, never in the image) brings it as a recorded show. From a
 * show's page, its Subscribe control unfollows the show, which greys its episodes, and playing a
 * greyed episode follows the show again. Following asks no upstream, so the recorded Audiobookshelf
 * answers only the episode's play.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded({ shows: true });
});
test.afterAll(() => recorded?.stop());

type Episode = { ref: { source: string; id: string }; title: string; absent: boolean };

/** The show as the server gives it to the person signed in. */
async function showAnswer(page: Page) {
  const answer = await page.request.get(
    `${recorded.origin}/api/items/${encodeURIComponent(keyOf(recorded.show))}`,
  );
  expect(answer.status()).toBe(200);
  return (await answer.json()) as { following: boolean; episodes: Episode[] };
}

/** The colour an episode's title is drawn in. */
const colourOf = (page: Page, title: string) =>
  page
    .getByText(title, { exact: true })
    .first()
    .evaluate((element) => getComputedStyle(element).color);

test('[M3.podcasts/b] unfollowing a show greys its episodes, and playing one follows it again', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const path = `/podcasts/${keyOf(recorded.show)}`;
  await signIn(page, recorded.origin, path, { everyone: false });
  const followed = await page.request.put(
    `${recorded.origin}/api/subscriptions/${encodeURIComponent(keyOf(recorded.show))}`,
    { headers: { origin: recorded.origin } },
  );
  expect(followed.status()).toBe(200);
  await page.reload();

  const { episodes } = await showAnswer(page);
  const playable = episodes.find((e) => keyOf(e.ref) === keyOf(recorded.episode))!;
  expect(playable).toBeDefined();
  const subscribed = page.getByRole('button', { name: 'Subscribed', exact: true });
  await expect(subscribed).toHaveAttribute('aria-pressed', 'true');
  const ownColour = await colourOf(page, playable.title);

  await subscribed.click();
  const subscribe = page.getByRole('button', { name: 'Subscribe', exact: true });
  await expect(subscribe).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => colourOf(page, playable.title)).not.toBe(ownColour);
  const unfollowed = await showAnswer(page);
  expect(unfollowed.following).toBe(false);
  expect(unfollowed.episodes.every((e) => e.absent)).toBe(true);
  await page.screenshot({ path: info.outputPath('unfollowed.png'), fullPage: true });

  const row = page
    .locator('[role=button]:has([aria-label="Play episode"])')
    .filter({ hasText: playable.title })
    .first();
  await row.getByRole('button', { name: 'Play episode' }).click();
  await expect.poll(() => titlePlaying(page), { timeout: 15_000 }).toBe(playable.title);

  await expect.poll(async () => (await showAnswer(page)).following).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Subscribed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => colourOf(page, playable.title)).toBe(ownColour);
  await page.screenshot({ path: info.outputPath('followed-again.png'), fullPage: true });
});

test('[M3.podcasts] a show the household lacks is subscribed to from Search, and its row opens the show', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, recorded.origin, '/search?q=maintenance%20phase', { everyone: false });
  const row = page
    .getByText('Maintenance Phase', { exact: true })
    .first()
    .locator('xpath=ancestor::div[3]');
  await expect(row).toContainText('Podcast · Aubrey Gordon & Michael Hobbes · 162 episodes');
  await page.screenshot({ path: info.outputPath('search-lacks.png'), fullPage: true });

  await row.getByRole('button', { name: 'Subscribe', exact: true }).click();
  const subscribed = row.getByRole('button', { name: 'Subscribed', exact: true });
  await expect(subscribed).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await page.screenshot({ path: info.outputPath('search-held.png'), fullPage: true });

  await page.getByText('Maintenance Phase', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/podcasts\/abs(:|%3A)/);
  await expect(page.getByRole('button', { name: 'Subscribed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
