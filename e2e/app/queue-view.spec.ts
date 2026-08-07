/**
 * The web queue view (`QueueView.tsx`), clear-queue, and queueable audiobook chapters
 * (docs/ROADMAP.md §12f). Same fixture-audio neutralization as `player.spec.ts`/
 * `music-queue.spec.ts` — see either file's header for why.
 *
 * Coverage split deliberately, per what each content type's queue can actually be
 * populated by today:
 * - **Music**: playing an album track already auto-creates a real queue
 *   (`musicQueueController.beginMusicQueue`, wired from `MusicAlbumPage.tsx`) — exercised
 *   here end to end.
 * - **Audiobook**: this wave's own new UI (`ChapterList.tsx`'s "Play next"/"Play last")
 *   is the only way to populate one — exercised here end to end, which also proves the
 *   enqueue UI itself works.
 * - **Podcast**: no page in this app calls `podcastQueueStore.setQueue` anywhere yet (confirmed
 *   before writing this file — `docs/HANDOVER.md`'s agent log: "podcasts have no queue concept
 *   at all today; each episode is a single `load()`"), and this wave adds no such page — only
 *   the queue *view*, clear action, and chapter queueing were asked for. So a podcast queue
 *   can never be non-empty via any real user flow today, and "clear queue empties a podcast
 *   queue, leaving playback intact" is verified instead as a store-level unit test against the
 *   real `usePodcastQueueStore` (`queueClearing.test.ts`), not here. What *is* exercised here
 *   for podcasts is the empty state and the no-leak-across-types routing (assertion 6): playing
 *   a podcast episode must show the podcast's own (empty) queue, never a stale music queue left
 *   over from a previous session.
 */
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
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
});

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

/** Opens Dune's item page and starts playback — same helper `player.spec.ts` uses. */
async function startDune(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('shelf-item-item-dune').click();
  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page')).toBeVisible();
  await page.getByTestId('item-play').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();
}

test('connecting Jellyfin from Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

test('a music queue view lists both tracks, marks the playing one current, and clearing it empties the list without stopping playback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-track-driftwave-1').click();
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();

  const list = page.getByTestId('queue-list');
  await expect(list).toBeVisible();
  // "Tidal Lines" (track 1, now playing) and "Static Coast" (track 2, upcoming).
  await expect(list).toContainText('Tidal Lines');
  await expect(list).toContainText('Static Coast');
  const current = list.locator('[aria-current="true"]');
  await expect(current).toContainText('Tidal Lines');

  await expect(page.getByTestId('player-play-toggle')).toHaveAttribute('aria-label', 'Pause');

  await page.getByTestId('queue-clear').click();

  await expect(page.getByTestId('queue-empty')).toBeVisible();
  await expect(page.getByTestId('queue-list')).toHaveCount(0);
  // Clearing the up-next list must not touch what's currently playing.
  await expect(page.getByTestId('player-play-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.getByTestId('now-playing').getByRole('heading', { level: 1 })).toHaveText(
    'Tidal Lines',
  );
});

test('a podcast queue view shows its own empty state, never a stale music queue left over from a previous session', async ({
  page,
}) => {
  // The music queue from the previous test is still populated in a fresh page load's stores
  // only if state persisted — it doesn't (playerStore/queue stores are in-memory, reset on
  // navigation to a fresh document) — but this also exercises the *routing*, not just an
  // empty-by-default state: `queueContentTypeOf` must resolve to 'podcast' here, not 'music'.
  await page.goto('/library/lib-podcasts');
  await expect(page.getByTestId('library-page')).toBeVisible();
  await page.getByTestId('item-card-item-dailytech').click();
  await expect(page.getByTestId('podcast-detail-page')).toBeVisible();
  await page.getByTestId('podcast-episode-ep-dailytech-2').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();

  await expect(page.getByTestId('queue-empty')).toBeVisible();
  await expect(page.getByTestId('queue-list')).toHaveCount(0);
  // The clear-queue control is still present for every content type, even an empty one.
  await expect(page.getByTestId('queue-clear')).toBeVisible();
});

test('a chapter’s "Play next" inserts right after the cursor and "Play last" appends — the audiobook queue view reflects both, and clearing it empties the list without stopping playback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await startDune(page);
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();

  // Starts empty: nothing has been queued for this book yet.
  await expect(page.getByTestId('queue-empty')).toBeVisible();

  // An empty queue's very first enqueue bootstraps a one-entry queue at `cursor: 0`
  // regardless of which action added it (`createQueueStore.ts`'s own doc comment — there's
  // no other sensible cursor for a queue with nothing else in it), so "Play next" and
  // "Play last" are only distinguishable once something is already queued. Three clicks,
  // then: chapter 1 bootstraps the queue and becomes "current"; chapter 2 is appended
  // ("Play last"); chapter 1 is queued a second time with "Play next", which must land
  // immediately after the cursor — ahead of the already-appended chapter 2 — proving "next"
  // and "last" really do insert at different positions, not just append in click order.
  await page.getByTestId('chapter-play-next-1').click(); // bootstraps: [Part One] (current)
  await page.getByTestId('chapter-play-last-2').click(); // appends: [Part One, Part Two]
  await page.getByTestId('chapter-play-next-1').click(); // inserts after cursor: [Part One, Part One, Part Two]

  const list = page.getByTestId('queue-list');
  await expect(list).toBeVisible();
  const entries = list.locator('li');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText('Part One');
  await expect(entries.nth(0).locator('[aria-current="true"]')).toBeVisible();
  await expect(entries.nth(0)).toContainText('Dune');
  // The second "Play next" landed at index 1 — right after the cursor, ahead of the
  // "Play last" entry that was already queued — not at index 2 (which would mean it had
  // just been appended like "last" instead).
  await expect(entries.nth(1)).toContainText('Part One');
  await expect(entries.nth(1).locator('[aria-current="true"]')).toHaveCount(0);
  await expect(entries.nth(2)).toContainText('Part Two');

  await expect(page.getByTestId('player-play-toggle')).toHaveAttribute('aria-label', 'Pause');

  await page.getByTestId('queue-clear').click();

  await expect(page.getByTestId('queue-empty')).toBeVisible();
  await expect(page.getByTestId('queue-list')).toHaveCount(0);
  await expect(page.getByTestId('player-play-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.getByTestId('now-playing').getByRole('heading', { level: 1 })).toHaveText(
    'Dune',
  );
});
