import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { advances, fontsLoaded, goWithin, signIn, titlePlaying } from './shell-steps';

/**
 * Songs from outside the library, on the server with recorded upstreams and a stand-in YouTube Music
 * (`server/e2e/standInMusic.ts`, never in the image): the rows are the recorded search, and every
 * song plays the 20 s synthesized Opus clip through the server's real cache. The recorded search's
 * last song is the one whose failure is its own. Titles come from the server's answer.
 */

const SIZES = [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeEach(() => test.setTimeout(90_000));
test.afterEach(() => recorded?.stop());

const search = async (page: Page, q: string) => {
  await signIn(page, recorded.origin, `/search?q=${encodeURIComponent(q)}`, { everyone: false });
  await fontsLoaded(page);
};

interface Song {
  ref: { id: string };
  title: string;
}

const songsOf = async (page: Page, q: string) => {
  const answer = await page.request.get(`${recorded.origin}/api/search?q=${q}`);
  return ((await answer.json()) as { songs: Song[] }).songs;
};

/** A song's row in Search: ResultRow's root, around its title's line and its text column. */
const songRow = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).first().locator('xpath=ancestor::div[3]');

const artPlay = async (page: Page, title: string) => {
  const play = songRow(page, title).getByRole('button', { name: 'Play', exact: true });
  await songRow(page, title).scrollIntoViewIfNeeded();
  await songRow(page, title).locator('.rr-art').hover();
  await play.click();
};

for (const { name, viewport } of SIZES) {
  test.describe(`at ${viewport.width} px`, () => {
    test.use({ viewport });

    test(`[M3.ytmusic] a streamed song plays at once from Search and is carried like any other (${name})`, async ({
      page,
    }, info) => {
      recorded = await serveRecorded({ nothingPlayed: true, music: 'answers' });
      const away: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol.startsWith('http'))
          away.push(url.hostname);
      });
      await search(page, 'never');
      const shot = (step: string) =>
        page.screenshot({ path: info.outputPath(`${name}-${step}.png`), fullPage: true });
      const [first, second] = await songsOf(page, 'never');
      const row = songRow(page, first!.title);

      await expect(row).toContainText('Streams');
      const cover = row.locator('.rr-art img, .rr-art [style*="background-image"]').first();
      await expect(cover).toBeAttached();
      await shot('offered');
      await expect(row.getByRole('button', { name: 'Play next' })).toHaveCount(0);

      await artPlay(page, first!.title);
      await expect.poll(() => titlePlaying(page)).toBe(first!.title);
      await advances(page);
      await expect(page.locator('body')).toContainText(first!.title);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const meta = navigator.mediaSession.metadata;
            return meta === null ? null : { title: meta.title, art: meta.artwork[0]?.src ?? '' };
          }),
        )
        .toMatchObject({
          title: first!.title,
          art: expect.stringContaining(`/api/media/ytmusic:${first!.ref.id}/art`),
        });
      expect(await page.locator('video').count()).toBe(0);

      // While music plays, a song's button is Play next, and it goes next in the queue.
      const follow = songRow(page, second!.title).getByRole('button', { name: 'Play next' });
      await expect(follow).toBeVisible();
      await shot('music-playing');
      await follow.click();

      await expect
        .poll(async () => {
          const answer = await page.request.get(`${recorded.origin}/api/queues/music`);
          return JSON.stringify(await answer.json());
        })
        .toContain(second!.ref.id);

      await goWithin(page, '/playing/queue');
      await expect(page.getByText(second!.title, { exact: true }).first()).toBeInViewport();
      await page.waitForTimeout(600);
      await page.screenshot({ path: info.outputPath(`${name}-queue.png`) });
      await goWithin(page, '/playing');
      await expect(page.getByText(first!.title, { exact: true }).first()).toBeInViewport();
      await page.waitForTimeout(600);
      await page.screenshot({ path: info.outputPath(`${name}-now-playing.png`) });

      // The end of the song steps to the one put next, a streamed song like any other, and the end
      // of that to what YouTube Music's radio picks.
      const toTheEnd = () =>
        page.evaluate(() => {
          const audio = [...document.querySelectorAll('audio')].find((a) => !a.paused);
          if (audio !== undefined) audio.currentTime = audio.duration - 0.3;
        });
      await expect.poll(() => titlePlaying(page)).toBe(first!.title);
      await advances(page);
      await toTheEnd();
      await expect.poll(() => titlePlaying(page), { timeout: 15_000 }).toBe(second!.title);
      await advances(page);
      await toTheEnd();
      await expect.poll(() => titlePlaying(page), { timeout: 15_000 }).not.toBe(second!.title);
      expect(await titlePlaying(page)).not.toBeNull();
      expect(away).toEqual([]);
      expect(await page.locator('video').count()).toBe(0);
    });

    test(`[M3.ytmusic] a song whose failure is its own says so in the banner, and plays nothing (${name})`, async ({
      page,
    }, info) => {
      recorded = await serveRecorded({ nothingPlayed: true, music: 'answers' });
      await search(page, 'never');
      const songs = await songsOf(page, 'never');
      const blocked = songs.at(-1)!;
      await artPlay(page, blocked.title);
      // The song tapped is the last on the page, and the banner at its head comes into sight.
      await expect(page.getByText('This song isn’t available in this country.')).toBeInViewport();
      expect(await titlePlaying(page)).toBeNull();
      await page.screenshot({ path: info.outputPath(`${name}-refused.png`), fullPage: true });

      // A song that can play takes the banner away.
      await artPlay(page, songs[0]!.title);
      await expect(page.getByText('This song isn’t available in this country.')).toHaveCount(0);
      await expect.poll(() => titlePlaying(page)).toBe(songs[0]!.title);
    });

    test(`[M3.ytmusic] Search says streaming is unavailable, with the library rows still drawn (${name})`, async ({
      page,
    }, info) => {
      recorded = await serveRecorded({ nothingPlayed: true, music: 'unavailable' });
      await search(page, 'never');
      const answer = await page.request.get(`${recorded.origin}/api/search?q=never`);
      const { results, streaming } = (await answer.json()) as {
        results: { title: string }[];
        streaming: string;
      };
      expect(streaming).toBe('unavailable');
      const title = results[0]!.title;
      await expect(
        page.getByText('Streaming unavailable. Your own music still plays.'),
      ).toBeVisible();
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Streams')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`${name}-unavailable.png`), fullPage: true });
    });
  });
}
