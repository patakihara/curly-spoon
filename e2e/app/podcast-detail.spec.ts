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
 *
 * The two tests at the bottom are phase 10's accessibility audit of this page:
 * a keyboard tab-walk (focus order matches visual order, every stop has a visible
 * ring, nothing traps) and a WCAG AA contrast check on the episode list text, in
 * both themes. Both came back clean — see each test's own comment for what was
 * actually measured, not just read off the source.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

/** Opens the podcast library and clicks through to the Daily Tech Briefing detail page. */
async function openDailyTech(page: Page) {
  await page.goto('/library/lib-podcasts');
  await expect(page.getByTestId('library-page')).toBeVisible();
  await page.getByTestId('item-card-item-dailytech').click();
  await expect(page).toHaveURL(/\/podcast\/item-dailytech$/);
  await expect(page.getByTestId('podcast-detail-page')).toBeVisible();
}

// Independent of `packages/ui/src/tokens/color.ts`'s own `contrastRatio` and of
// `e2e/app/contrast.spec.ts`'s copy of the same formula — deliberately
// re-implemented rather than imported, for the reason that file's own header
// comment gives: reusing the implementation under test would only prove it
// agrees with itself.
type Rgb = { r: number; g: number; b: number };

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): Rgb {
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(value);
  if (!match) throw new Error(`Unparseable colour: ${value}`);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

async function effectiveBackground(locator: Locator): Promise<Rgb> {
  const color = await locator.evaluate((start) => {
    let el: Element | null = start;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(bg);
      if (match && (match[4] === undefined || Number(match[4]) > 0)) return bg;
      el = el.parentElement;
    }
    return 'rgb(255, 255, 255)';
  });
  return parseRgb(color);
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

test('the header meta line composes episode count and unplayed count', async ({
  page,
  request,
}) => {
  // Seeds both episodes to a known state explicitly, rather than depending on
  // whatever progress another test in this file may already have written to
  // the shared, single-tenant fake BFF — `playwright.config.ts`'s own rule
  // that each spec makes its own preconditions true rather than inheriting
  // them, same pattern the pre-existing "marked finished" test below uses.
  const finished = await request.patch('/api/v1/progress/item-dailytech?episodeId=ep-dailytech-1', {
    data: { currentTime: 300, duration: 300, progress: 1, isFinished: true },
  });
  expect(finished.ok()).toBe(true);
  const inProgress = await request.patch(
    '/api/v1/progress/item-dailytech?episodeId=ep-dailytech-2',
    { data: { currentTime: 30, duration: 360, progress: 0.08, isFinished: false } },
  );
  expect(inProgress.ok()).toBe(true);

  await openDailyTech(page);

  // ep-1 played, ep-2 in progress: 2 episodes total, 1 still unplayed — not
  // omitted even though it's non-zero (it isn't zero here, but §5's "0 is a
  // real state, never omitted" rule is exercised by the no-episodes test
  // below, where the whole line is correctly absent instead).
  await expect(page.locator('.auralis-item-header__meta-line')).toHaveText(
    '2 episodes · 1 unplayed',
  );
});

test('"Play latest" starts the newest episode, independent of the chosen order', async ({
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
  // Switch to oldest-first, so the button's target (newest) and the list's
  // first row (oldest) disagree — proving "Play latest" reads its own
  // newest-first sort rather than the visible list order (§6).
  await page.getByTestId('episode-order-oldest').click();

  await page.getByTestId('podcast-play-latest').click();

  await expect(page.getByTestId('mini-player')).toBeVisible();
  await expect(page.getByTestId('mini-player-title')).toContainText('The One About Rust');
});

test('"Play latest" is absent when the podcast has no episodes', async ({ page }) => {
  await page.route('**/api/v1/items/item-dailytech*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        item: {
          id: 'item-dailytech',
          libraryId: 'lib-podcasts',
          coverPath: null,
          media: {
            kind: 'podcast',
            title: 'Daily Tech Briefing',
            author: 'Signal Media',
            description: null,
            episodes: [],
          },
          progress: null,
        },
      }),
    });
  });

  await page.goto('/podcast/item-dailytech');
  await expect(page.getByTestId('podcast-detail-page')).toBeVisible();

  await expect(page.getByTestId('podcast-play-latest')).toHaveCount(0);
  // No episodes at all — the meta line is omitted entirely (§5), not rendered
  // as "0 episodes · 0 unplayed".
  await expect(page.locator('.auralis-item-header__meta-line')).toHaveCount(0);
  await expect(page.getByText('This podcast has no episodes yet.')).toBeVisible();
});

test('the cover fallback tile resolves the Sonora radius, not the pre-Sonora 8px default', async ({
  page,
}) => {
  // The fixture cover bytes never decode in this environment (same as
  // `item-detail.spec.ts`'s equivalent check) — this screen is the live
  // instance `PODCAST_DETAIL.md` §9 named for the `CoverImage` fallback
  // defect fixed in `CoverImage.tsx` by 16e-podcast-W.
  await openDailyTech(page);

  const cover = page.locator('.auralis-item-header [aria-hidden="true"]').first();
  await expect(cover).toBeVisible();
  const [coverRadius, expectedRadius] = await cover.evaluate((el) => {
    const actual = getComputedStyle(el).borderRadius;
    const probe = document.createElement('span');
    probe.style.borderRadius = 'var(--radius-lg)';
    el.parentElement?.appendChild(probe);
    const expected = getComputedStyle(probe).borderRadius;
    probe.remove();
    return [actual, expected];
  });
  expect(expectedRadius).not.toBe('');
  expect(coverRadius).toBe(expectedRadius);
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

test('keyboard tab order on the podcast detail page matches visual order, with a visible ring at every stop', async ({
  page,
}) => {
  await openDailyTech(page);
  // A plain `page.locator('body').click()` is what the rest of this file's own
  // findings would call risky here: the body's bounding-box centre depends on the
  // full (scrollable) document height, not the viewport, and on this page that
  // centre can land on an episode row and start playback. Clicking the page's own
  // `<h1>` instead is inert (no click handler) but still gives the page real
  // keyboard focus, which `page.keyboard.press('Tab')` needs to do anything at
  // all in headless Chromium.
  await page.locator('h1').first().click();

  const stops: string[] = [];
  // Bumped from 8 to 10 (16e-podcast-W): the new header "Play latest" button
  // (§6) is one more real, testid-carrying focus stop ahead of the episode
  // rows, so the old budget could run out before reaching the second row.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        testId: el.getAttribute('data-testid'),
        hasRing: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
      };
    });
    if (info === null) break; // ran off the end of the document's focusables
    expect(info.hasRing, `${info.testId} has no visible focus ring`).toBe(true);
    if (info.testId) stops.push(info.testId);
  }

  // Visual order, top to bottom: the shell's top search field and nav (none of
  // which carry a `data-testid` on the exact element that receives focus — the
  // combobox `<input>` and the nav `NavLink`s don't), then the header's new
  // "Play latest" button (16e-podcast-W, §6 — a real `data-testid`-carrying
  // stop, since both episodes exist so the button renders), then this page's
  // own order-toggle chips (a chip's `data-testid` sits on the wrapper `<span>`
  // in `Chip.tsx`, not on the `<input>` that actually receives focus, so those
  // don't contribute a stop here either), then the episode list — newest
  // ("Rust") first under the page's default sort, matching `episodes are
  // listed newest first by default` above. This list only asserts on the stops
  // that do carry a `data-testid`, in the order they were reached.
  expect(stops).toEqual([
    'podcast-play-latest',
    'podcast-episode-ep-dailytech-2',
    'podcast-episode-ep-dailytech-1',
  ]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`episode list text clears WCAG AA (4.5:1) in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openDailyTech(page);

    const row = page.getByTestId('podcast-episode-ep-dailytech-2');
    await expect(row).toBeVisible();

    const headline = row.locator('.m3-list-item__headline');
    const headlineColor = await headline.evaluate((el) => getComputedStyle(el).color);
    const bg = await effectiveBackground(row);
    expect(contrastRatio(parseRgb(headlineColor), bg)).toBeGreaterThanOrEqual(4.5);

    // The supporting-text line is where episode state ("· Played" / "· In
    // progress") lives — `PodcastDetailPage.tsx` folds it into this same string
    // rather than a separate coloured badge, so this is also the line whose
    // contrast most matters for that state actually being readable.
    const supporting = row.locator('.m3-list-item__supporting');
    const supportingColor = await supporting.evaluate((el) => getComputedStyle(el).color);
    expect(contrastRatio(parseRgb(supportingColor), bg)).toBeGreaterThanOrEqual(4.5);
  });
}
