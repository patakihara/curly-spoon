import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { keyOf, signIn as signInAt, titlePlaying } from './shell-steps';

/**
 * A show's episode sort in the web shell, on the server with recorded upstreams (M2.sorting, check
 * (c)): the sort bar names the show's own order, Oldest first for the recorded serial show and
 * Newest first for the episodic one, each ordered by its recorded feed. Its menu replaces the
 * page's address, which asks `GET /api/items/{ref}` for the other order, and the rows come back
 * reversed; autoplay still takes the episode after the one playing in the show's own order. Its
 * own server, so its sign-ins count against their own rate limit.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

const signIn = (page: Page, path: string) => signInAt(page, recorded.origin, path);

type Ref = { source: string; id: string };
type Episode = { ref: Ref; title: string };

/** The show's episodes as the server lists them in `query`'s order, and the order it named. */
async function episodesIn(page: Page, show: Ref, query = '') {
  const answer = await page.request.get(
    `${recorded.origin}/api/items/${encodeURIComponent(keyOf(show))}${query}`,
  );
  expect(answer.status()).toBe(200);
  return (await answer.json()) as { episodes: Episode[]; sort: string };
}

/** The episode rows' titles, in the order the page draws them. */
const rowsShown = (page: Page, titles: string[]) =>
  page.locator('[role=button]:has([aria-label="Play episode"])').evaluateAll(
    (rows, known) =>
      rows.flatMap((row) => {
        const found = [...row.querySelectorAll('div')].find((d) =>
          known.includes(d.textContent ?? ''),
        );
        return found === undefined ? [] : [found.textContent ?? ''];
      }),
    titles,
  );

/** The sort bar's label, which opens its menu: its glyph's name, then the order it names. */
const sortButton = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^swap_vert\\s*${label}$`) });

/** The show's page asked next, as its query. */
const nextAsk = (page: Page, show: Ref) =>
  page
    .waitForRequest(
      (r) => decodeURIComponent(new URL(r.url()).pathname) === `/api/items/${keyOf(show)}`,
    )
    .then((r) => new URL(r.url()).search);

/** The recorded show other than the serial one: the episodic show. */
async function episodicShow(page: Page): Promise<Ref> {
  const listed = await page.request.get(`${recorded.origin}/api/library/podcasts`);
  const { items } = (await listed.json()) as { items: { ref: Ref }[] };
  return items.map((i) => i.ref).find((r) => keyOf(r) !== keyOf(recorded.show))!;
}

test.describe('[M2.sorting/c] a show’s episodes oldest or newest first', () => {
  test('a serial show reads Oldest first, and flipping it reverses its rows but not autoplay’s next', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/podcasts/${keyOf(recorded.show)}`);
    const own = await episodesIn(page, recorded.show);
    expect(own.sort).toBe('oldest');
    const titles = own.episodes.map((e) => e.title);
    expect(titles.length).toBeGreaterThan(1);
    await expect(sortButton(page, 'Oldest first')).toBeVisible();
    await expect.poll(() => rowsShown(page, titles)).toEqual(titles);

    const asked = nextAsk(page, recorded.show);
    await sortButton(page, 'Oldest first').click();
    await page.getByRole('menuitemradio', { name: 'Newest first' }).click();
    expect(await asked).toBe('?sort=newest');
    await expect
      .poll(() => decodeURIComponent(page.url()), 'the order replaced the address')
      .toBe(`${recorded.origin}/podcasts/${keyOf(recorded.show)}?sort=newest`);
    await expect(
      sortButton(page, 'Newest first'),
      'the bar names the order answered',
    ).toBeVisible();
    const reversed = [...titles].reverse();
    await expect.poll(() => rowsShown(page, titles)).toEqual(reversed);

    // Play the recorded episode from the flipped page: autoplay takes the episode after it in the
    // show's own order, oldest first, not the row drawn after it.
    const at = own.episodes.findIndex((e) => keyOf(e.ref) === keyOf(recorded.episode));
    const next = own.episodes[at + 1]!;
    const drawnNext = reversed[reversed.indexOf(own.episodes[at]!.title) + 1];
    expect(drawnNext, 'the flipped page draws another episode after it').not.toBe(next.title);
    const planned = page.waitForResponse(`${recorded.origin}/api/play`);
    await page
      .getByRole('button', { name: 'Play episode', exact: true })
      .nth(reversed.indexOf(own.episodes[at]!.title))
      .click();
    expect((await planned).status()).toBe(200);
    await expect.poll(() => titlePlaying(page)).not.toBeNull();
    await expect
      .poll(async () => {
        const queue = await page.request.get(`${recorded.origin}/api/queues/spoken`);
        const { current, autoplay } = (await queue.json()) as {
          current: { ref: Ref } | null;
          autoplay: { ref: Ref } | null;
        };
        return [current && keyOf(current.ref), autoplay && keyOf(autoplay.ref)];
      })
      .toEqual([keyOf(recorded.episode), keyOf(next.ref)]);
  });

  test('an episodic show reads Newest first, and flipping it lists its episodes oldest first', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, '/podcasts');
    const show = await episodicShow(page);
    const own = await episodesIn(page, show);
    expect(own.sort).toBe('newest');
    const titles = own.episodes.map((e) => e.title);
    expect(titles.length).toBeGreaterThan(1);
    await page.goto(`${recorded.origin}/podcasts/${keyOf(show)}`);
    await expect(sortButton(page, 'Newest first')).toBeVisible();
    await expect.poll(() => rowsShown(page, titles)).toEqual(titles);

    const asked = nextAsk(page, show);
    await sortButton(page, 'Newest first').click();
    await page.getByRole('menuitemradio', { name: 'Oldest first' }).click();
    expect(await asked).toBe('?sort=oldest');
    await expect(sortButton(page, 'Oldest first')).toBeVisible();
    await expect.poll(() => rowsShown(page, titles)).toEqual([...titles].reverse());
    expect((await episodesIn(page, show, '?sort=oldest')).episodes.map((e) => e.title)).toEqual(
      [...titles].reverse(),
    );
  });
});
