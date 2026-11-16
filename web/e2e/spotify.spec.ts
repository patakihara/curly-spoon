import { expect, test } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { advances, fontsLoaded, goWithin, signIn, titlePlaying } from './shell-steps';

/**
 * Importing a public Spotify playlist, on the server with recorded upstreams, a stand-in Spotify
 * and a stand-in YouTube Music (`server/e2e/standInSpotify.ts`, `standInMusic.ts`, never in the
 * image): Spotify answers the recorded All Out 80s, 150 places, and each place's search is the one
 * recorded for it, so 145 songs are found and 5 left off, as the recorder counted. Songs play the
 * 20 s synthesized clip. Titles and the order come from the server's answers.
 */

const LINK = 'https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeEach(() => test.setTimeout(120_000));
test.afterEach(() => recorded?.stop());

interface Detail {
  name: string;
  items: { title: string }[];
  import: { state: string; unmatched: { title: string | null }[] } | null;
}

test('[M3.spotify] a pasted playlist imports from Search, fills in order, lists what it left off, plays and is on Music', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  recorded = await serveRecorded({ nothingPlayed: true, music: 'answers', spotify: true });
  const shot = (step: string) =>
    page.screenshot({ path: info.outputPath(`${step}.png`), fullPage: true });
  await signIn(page, recorded.origin, `/search?q=${encodeURIComponent(LINK)}`, { everyone: false });
  await fontsLoaded(page);

  await expect(page.getByText('Spotify playlist · 150 songs', { exact: true })).toBeVisible();
  await shot('search');
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${recorded.origin}/music/playlists/[^/]+$`));
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(page.getByText(/^Importing/)).toBeVisible();
  await shot('importing');

  const detail = async () =>
    (await (await page.request.get(`${recorded.origin}/api/lists/${id}`)).json()) as Detail;
  await expect
    .poll(async () => (await detail()).import?.state, { timeout: 90_000, intervals: [1_000] })
    .toBe('done');
  await expect(page.getByText('From Spotify · 145 of 150 found', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  const list = await detail();
  expect(list.items).toHaveLength(145);

  // The songs in Spotify's order, then the five left off, under their own heading.
  const text = await page.locator('main, body').first().innerText();
  let from = 0;
  for (const song of list.items.slice(0, 10)) {
    const at = text.indexOf(song.title, from);
    expect(at, song.title).toBeGreaterThanOrEqual(from);
    from = at + song.title.length;
  }
  expect(text.indexOf('Not found on YouTube Music')).toBeGreaterThan(
    text.lastIndexOf(list.items.at(-1)!.title),
  );
  await expect(page.getByText('Not found on YouTube Music', { exact: true })).toBeVisible();
  await expect(page.getByText('Not found', { exact: true })).toHaveCount(5);
  await shot('imported');

  const played = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url() === `${recorded.origin}/api/lists/${id}/play`,
  );
  await page.getByRole('button', { name: /^play_arrow\s*Play$/ }).click();
  await played;
  await advances(page);
  await expect.poll(() => titlePlaying(page)).toBe(list.items[0]!.title);
  const queue = (await (await page.request.get(`${recorded.origin}/api/queues/music`)).json()) as {
    user: unknown[];
  };
  expect(queue.user.length).toBe(144);

  await goWithin(page, '/music');
  await expect(page.getByText('Playlists', { exact: true })).toBeVisible();
  await expect(page.getByText(list.name, { exact: true })).toBeVisible();
  await expect(page.getByText('Playlist · 145 songs', { exact: true })).toBeVisible();
  await shot('music');
});
