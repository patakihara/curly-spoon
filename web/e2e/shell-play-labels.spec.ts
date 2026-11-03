import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { goWithin, keyOf, signIn as signInAt, titlePlaying } from './shell-steps';

/**
 * Every Play button in the web shell names its action (M1.shell, check (e)): an item's own page
 * offers Play (or Resume) and Play next as separate buttons, and a show's episode rows offer Play
 * episode, which plays it now; after Play now on an episode while another show's episode is
 * current, what follows is that episode's show's next. On the server with recorded upstreams,
 * where only the first show's recorded episode can play, so the other show's episodes are made
 * current through the queue, with a Back between them.
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

type Ref = { source: string; id: string };

test.describe('[M1.shell/e] Play now on an episode while another show plays', () => {
  test("autoplays the next episode of the episode's own show", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/podcasts/${keyOf(recorded.show)}`);
    const api = async <T>(path: string, init?: { method: string; data: object }) => {
      const answer = await page.request.fetch(`${recorded.origin}${path}`, {
        ...init,
        headers: { origin: recorded.origin },
      });
      expect(answer.status(), path).toBe(200);
      return (await answer.json()) as T;
    };
    const episodesOf = async (show: Ref) =>
      (
        await api<{ episodes: { ref: Ref | null }[] }>(
          `/api/items/${encodeURIComponent(keyOf(show))}`,
        )
      ).episodes.flatMap((e) => (e.ref === null ? [] : [e.ref]));
    const shows = await api<{ items: { ref: Ref }[] }>('/api/library/podcasts');
    const other = shows.items.map((i) => i.ref).find((r) => keyOf(r) !== keyOf(recorded.show))!;
    const [otherEpisode, earlier] = await episodesOf(other);
    const ownEpisodes = (await episodesOf(recorded.show)).map(keyOf);

    // The other show plays: one episode, then another, then Back to the first, as Sofia may
    // have pressed it (Back parks the episode it leaves ahead in the queue).
    for (const ref of [earlier!, otherEpisode!]) {
      await api('/api/queues/spoken/items', { method: 'POST', data: { ref, how: 'now' } });
    }
    await api('/api/sessions/this/step', { method: 'POST', data: { direction: 'back' } });

    const row = page
      .getByRole('button', { name: 'Play episode', exact: true })
      .nth(ownEpisodes.indexOf(keyOf(recorded.episode)));
    const planned = page.waitForResponse(`${recorded.origin}/api/play`);
    await row.click();
    expect((await planned).status()).toBe(200);
    await expect.poll(() => titlePlaying(page)).not.toBeNull();

    await expect
      .poll(async () => {
        const queue = await api<{ current: { ref: Ref } | null; autoplay: { ref: Ref } | null }>(
          '/api/queues/spoken',
        );
        return [
          queue.current && keyOf(queue.current.ref),
          queue.autoplay && keyOf(queue.autoplay.ref),
        ];
      })
      .toEqual([keyOf(recorded.episode), expect.any(String)]);
    const queue = await api<{ user: { ref: Ref }[]; autoplay: { ref: Ref } }>('/api/queues/spoken');
    expect(queue.user).toEqual([]);
    expect(ownEpisodes).toContain(keyOf(queue.autoplay.ref));
    expect(keyOf(queue.autoplay.ref)).not.toBe(keyOf(recorded.episode));
  });
});
