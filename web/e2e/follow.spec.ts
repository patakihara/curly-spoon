import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { keyOf, signIn, titlePlaying } from './shell-steps';

/**
 * Following a show from its page, on the server with recorded upstreams: its Subscribe control
 * unfollows the show, which greys its episodes, and playing a greyed episode follows the show again.
 * Following asks no upstream, so the recorded Audiobookshelf answers only the episode's play.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
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
