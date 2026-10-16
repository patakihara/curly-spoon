import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import {
  advances,
  audios,
  fontsLoaded,
  keyOf,
  playedTo,
  signIn as signInAt,
  titleIn as titleAt,
} from './shell-steps';

/**
 * The web shell for a signed-in member, on the server with recorded upstreams (M1.shell): every
 * page free of the canvas's samples, a reload that keeps what plays, and a sign-in lost mid-play.
 * Its own server, so its sign-ins count against their own rate limit.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

const signIn = (page: Page, path: string) => signInAt(page, recorded.origin, path);
const titleIn = (page: Page, medium: string, ref: { source: string; id: string }) =>
  titleAt(page, recorded.origin, medium, ref);

/** Where the design lives: nav.json's pages and each page's canvas placeholder. */
const appDir = fileURLToPath(new URL('../../design/app/', import.meta.url));

/**
 * The canvas's own sample words: every name, title, line and address its placeholders and its
 * player's picture draw. Words the page keeps (its labels, its kind, its section names) are under
 * other keys and are left out.
 */
function canvasSamples(): string[] {
  const SAMPLE_KEYS = new Set([
    'title',
    'sub',
    'meta',
    'description',
    'notes',
    'subject',
    'query',
    'server',
    'address',
    'author',
    'show',
    'artist',
    'host',
    'narrator',
    'heading',
    'body',
    'lines',
  ]);
  const found = new Set<string>();
  const walk = (value: unknown, key: string | null) => {
    if (typeof value === 'string') {
      if (key !== null && SAMPLE_KEYS.has(key) && value.length >= 6) found.add(value);
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  for (const file of readdirSync(`${appDir}placeholders`)) {
    walk(JSON.parse(readFileSync(`${appDir}placeholders/${file}`, 'utf8')), null);
  }
  walk(
    (JSON.parse(readFileSync(`${appDir}shell.json`, 'utf8')) as { playing: unknown }).playing,
    null,
  );
  return [...found];
}

test.describe('[M1.shell] a member sees only their own library', () => {
  test("visits every page in nav.json and finds none of the canvas's samples", async ({ page }) => {
    test.setTimeout(180_000);
    const { pages } = JSON.parse(readFileSync(`${appDir}nav.json`, 'utf8')) as {
      pages: { id: string; route: string }[];
    };
    const samples = canvasSamples();
    expect(samples.length).toBeGreaterThan(50);
    const refs: Record<string, string> = {
      book: keyOf(recorded.multiFile),
      show: keyOf(recorded.show),
      episode: keyOf(recorded.episode),
      album: keyOf(recorded.album),
    };
    await signIn(page, '/');
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const { id, route } of pages) {
        if (id === 'signIn') continue;
        const path = route
          .replace(':ref', refs[id] ?? 'abs:none')
          .replace(':id', 'none')
          .replace('*', '/no-such-page');
        await page.goto(`${recorded.origin}${path}`);
        await page.waitForLoadState('networkidle');
        // Each piece of text the page draws, whole: a sample shows as one, never inside a word.
        const drawn = new Set(
          (await page.locator('body').innerText()).split('\n').map((line) => line.trim()),
        );
        for (const sample of samples) {
          expect(drawn.has(sample), `${id} at ${width}: ${sample}`).toBe(false);
        }
      }
    }
  });
});

test.describe('[M1.shell] a reload and a lost sign-in', () => {
  test('a reload mid-play keeps what plays, where it was, in the mini-player', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    const book = await titleIn(page, 'books', recorded.multiFile);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await expect.poll(() => playedTo(page), { timeout: 15_000 }).toBeGreaterThan(3);
    // Well before the first 10 s report: only the last report, as the page goes, keeps the place.
    const at = (await audios(page)).find((a) => !a.paused)!.time;
    await page.reload();
    await fontsLoaded(page);
    await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: `Open player, ${book}` }).click();
    await expect(page).toHaveURL(`${recorded.origin}/playing`);
    const elapsed = page
      .getByRole('slider')
      .locator('xpath=following-sibling::div[1]/span[1]')
      .locator('visible=true')
      .first();
    const shown = async () => {
      const [m, s] = (await elapsed.innerText()).split(':').map(Number);
      return m! * 60 + s!;
    };
    await expect.poll(shown).toBeGreaterThanOrEqual(Math.floor(at) - 1);
    expect(await shown()).toBeLessThanOrEqual(Math.ceil(at) + 1);
  });

  test('a sign-in lost mid-play stops playback and goes to sign in', async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await advances(page);
    await context.clearCookies();
    await page.getByRole('button', { name: 'Pause', exact: true }).first().click();
    await expect(page).toHaveURL(/\/sign-in\?/);
  });
});
