import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import { type Rollup, build } from 'vite';
import { type PlaybackPlan, type Player, type createPlayer } from '../src/playback';

/**
 * An open tab follows the app the server runs. The server's own `/api/health` answer is passed
 * through with its commit set by the test, standing in for a new image going live; the page's
 * clock is faked, so its minute between checks passes in a moment. A recorded tone, looped and
 * muted, stands in for audio playing.
 */
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

const tone = readFileSync(
  fileURLToPath(
    new URL('../../server/src/adapters/audiobookshelf/recordings/multi-file.mp3', import.meta.url),
  ),
);

/** The web player engine, bundled as it is, for a page to run. */
let engine: string;

test.beforeAll(async () => {
  const output = (await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('../src/playback.ts', import.meta.url)),
        name: 'AuralisPlayback',
        formats: ['iife'],
      },
    },
  })) as Rollup.RollupOutput[];
  engine = output[0]!.output[0].code;
});

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

/** The app open in a tab with its clock faked, `/api/health` reporting `commit()`. */
async function openApp(page: Page, commit: () => string | null) {
  let checks = 0;
  // The server's real answer, read once; each check gets it with the commit of the moment.
  const health = (await (await page.request.get('/api/health')).json()) as object;
  await page.route('**/api/health', (route) => {
    checks++;
    return route.fulfill({ json: { ...health, commit: commit() } });
  });
  await page.route('**/e2e/tone.mp3', (route) =>
    route.fulfill({ body: tone, contentType: 'audio/mpeg' }),
  );
  await page.clock.install();
  const firstCheck = page.waitForResponse('**/api/health');
  await page.goto('/');
  await firstCheck;
  // A mark on this document only: a reload takes it away.
  await page.evaluate(() => Object.assign(window, { beforeUpdate: true }));
  let loads = 0;
  page.on('load', () => loads++);
  return {
    checks: () => checks,
    loads: () => loads,
    /** Whether this is still the document the test opened. */
    same: () => page.evaluate(() => 'beforeUpdate' in window),
    /** Lets up to `ms` of the page's time pass, a second at a time, stopping at a reload. */
    async tick(ms: number) {
      for (let passed = 0; passed < ms && loads === 0; passed += 1_000) {
        await page.clock.runFor(1_000);
      }
    },
  };
}

test('[M0.staging/c] an open tab reloads onto the app once the server reports another commit', async ({
  page,
}) => {
  let commit = A;
  const tab = await openApp(page, () => commit);

  commit = B;
  await tab.tick(65_000);
  await expect.poll(tab.loads).toBe(1);
  expect(await tab.same()).toBe(false);
  await expect(page).toHaveTitle('Auralis');

  // The reloaded tab started on the new commit: it stays.
  const checksAfter = tab.checks();
  for (let passed = 0; passed < 130_000; passed += 1_000) await page.clock.runFor(1_000);
  expect(tab.checks()).toBeGreaterThan(checksAfter);
  expect(tab.loads()).toBe(1);
});

test('[M0.staging/c] an open tab waits while audio plays, and reloads once it stops', async ({
  page,
}) => {
  let commit = A;
  const tab = await openApp(page, () => commit);
  await page.evaluate(async () => {
    const audio = new Audio('/e2e/tone.mp3');
    audio.loop = true;
    audio.muted = true;
    document.body.append(audio);
    await audio.play();
  });

  commit = B;
  const checksBefore = tab.checks();
  await tab.tick(130_000);
  expect(tab.checks()).toBeGreaterThan(checksBefore);
  expect(tab.loads()).toBe(0);
  expect(await tab.same()).toBe(true);
  expect(await page.evaluate(() => document.querySelector('audio')!.paused)).toBe(false);

  await page.evaluate(() => document.querySelector('audio')!.pause());
  await tab.tick(5_000);
  await expect.poll(tab.loads).toBe(1);
  expect(await tab.same()).toBe(false);
});

test('[M0.staging/c] an open tab on a server reporting no commit never reloads', async ({
  page,
}) => {
  let commit: string | null = null;
  const tab = await openApp(page, () => commit);

  commit = B;
  const checksBefore = tab.checks();
  await tab.tick(130_000);
  expect(tab.checks()).toBeGreaterThan(checksBefore);
  expect(tab.loads()).toBe(0);
  expect(await tab.same()).toBe(true);
});

test('[M0.staging/c] an open tab waiting on the player reloads once the player is gone', async ({
  page,
}) => {
  let commit = A;
  const tab = await openApp(page, () => commit);
  await page.addScriptTag({ content: engine });
  await page.evaluate(async () => {
    const { createPlayer: create } = (
      window as unknown as { AuralisPlayback: { createPlayer: typeof createPlayer } }
    ).AuralisPlayback;
    const plan: PlaybackPlan = {
      tracks: [{ url: '/e2e/tone.mp3', mime: 'audio/mpeg', duration: 5, offset: 0 }],
      chapters: [],
      startAt: 0,
      progressTarget: { playId: 'e2e-play' },
    };
    const player = create(plan);
    await player.play();
    // The player's own elements, looped and muted so the tone plays on for as long as the test.
    document.querySelectorAll('audio').forEach((audio) => {
      audio.loop = true;
      audio.muted = true;
    });
    Object.assign(window, { player });
  });

  commit = B;
  const checksBefore = tab.checks();
  await tab.tick(130_000);
  expect(tab.checks()).toBeGreaterThan(checksBefore);
  expect(tab.loads()).toBe(0);
  expect(
    await page.evaluate(() => [...document.querySelectorAll('audio')].some((a) => !a.paused)),
  ).toBe(true);

  // The player is destroyed mid-play: its elements leave the page before they say they stopped.
  await page.evaluate(() => (window as unknown as { player: Player }).player.destroy());
  expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBe(0);
  await tab.tick(65_000);
  await expect.poll(tab.loads).toBe(1);
  expect(await tab.same()).toBe(false);
});
