import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { fontsLoaded, keyOf, signIn, titlePlaying } from './shell-steps';

/**
 * A person's own library and their requests, on the server with recorded upstreams and stand-in
 * mediums (M3.requests), the recorded person having played nothing. Requests are made through the
 * API, as nothing in the shell makes one until each medium's item binds it.
 */

test.use({
  viewport: { width: 1440, height: 900 },
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
});

let recorded: Recorded;
test.beforeEach(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded({ nothingPlayed: true });
});
test.afterEach(() => recorded?.stop());

const api = (path: string) => `${recorded.origin}/api${path}`;

const open = (page: Page, path: string) => signIn(page, recorded.origin, path, { everyone: false });

/** Makes a request through the API, as the person signed in. */
async function request(page: Page, medium: 'book' | 'album', title: string, n: number) {
  const ids =
    medium === 'book'
      ? { asin: `B00000000${n}` }
      : { mbid: `00000000-0000-4000-8000-00000000000${n}` };
  const made = await page.request.post(api('/requests'), {
    headers: { origin: recorded.origin },
    data: { ref: { medium, target: { title, creator: 'A Stand-in', ids } } },
  });
  expect(made.status()).toBe(200);
}

/** The titles a library list holds. */
async function listed(page: Page, medium: string) {
  const { items } = (await (await page.request.get(api(`/library/${medium}`))).json()) as {
    items: { title: string; ref: { source: string; id: string } }[];
  };
  return items;
}

/** What the page shows between two of its section titles; to its end with none. */
async function between(page: Page, from: string, to?: string) {
  const text = await page.locator('body').innerText();
  const start = text.indexOf(from);
  return text.slice(start, to === undefined ? undefined : text.indexOf(to, start));
}

/** The row titled `title` on the Requests page, up to the box holding its action. */
const requestRow = (page: Page, title: string, action: string) =>
  page
    .getByText(title, { exact: true })
    .first()
    .locator(`xpath=ancestor::*[.//*[@role="button" or self::button][@aria-label="${action}"]][1]`);

/** Presses a row's action: a row with no tap of its own is no control, and never disabled. */
const press = (row: ReturnType<typeof requestRow>, name: string) =>
  row.getByRole('button', { name, exact: true }).click();

const LOOKING_AGAIN = { timeout: 15_000 };

test('[M3.requests] opens Requests from Search, chooses, retries, picks another, cancels, and ends empty', async ({
  page,
}) => {
  await open(page, '/requests');
  await expect(page.getByText('Nothing requested', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Search', exact: true }).click();
  await expect(page).toHaveURL(`${recorded.origin}/search`);

  await request(page, 'book', 'Steady Stand-in', 1);
  await request(page, 'album', 'Paper Stand-in', 2);
  await request(page, 'book', 'Alone Stand-in', 3);
  await request(page, 'book', 'Spare Stand-in', 4);

  // From Search's "Your requests", as a person gets there.
  await page.goto(`${recorded.origin}/search?q=the`);
  await fontsLoaded(page);
  await page.getByRole('button', { name: 'Your requests', exact: true }).click();
  await expect(page).toHaveURL(`${recorded.origin}/requests`);

  await expect(requestRow(page, 'Steady Stand-in', 'Cancel')).toContainText(
    'Downloading · 38%',
    LOOKING_AGAIN,
  );
  await expect(requestRow(page, 'Steady Stand-in', 'Cancel')).toContainText(
    'Book · A Stand-in · Stand-in · 286 MB',
  );

  // A needs-choice album, whose candidate moves it to Queued in one tap.
  await expect(page.getByText('Paper Stand-in [FLAC]', { exact: true })).toBeVisible(LOOKING_AGAIN);
  await page.getByRole('button', { name: 'Paper Stand-in [FLAC]', exact: true }).click();
  await expect(page.getByText('Paper Stand-in [FLAC]', { exact: true })).toHaveCount(0);
  await expect(requestRow(page, 'Paper Stand-in', 'Cancel')).toContainText('Queued', LOOKING_AGAIN);

  // A failed row, retried.
  const alone = requestRow(page, 'Alone Stand-in', 'Retry');
  await expect(alone).toContainText('The download failed', LOOKING_AGAIN);
  await press(alone, 'Retry');
  await expect(requestRow(page, 'Alone Stand-in', 'Cancel')).toContainText(
    'Downloading · 38%',
    LOOKING_AGAIN,
  );

  // A failed row with another release left, picked in one tap.
  await expect(page.getByText('The download failed; 1 release left')).toBeVisible(LOOKING_AGAIN);
  await page.getByRole('button', { name: 'Pick another', exact: true }).click();
  await expect(page.getByText('Pick another release', { exact: true })).toHaveCount(0);
  await expect(requestRow(page, 'Spare Stand-in', 'Cancel')).toContainText(
    'Downloading · 38%',
    LOOKING_AGAIN,
  );
  await expect(requestRow(page, 'Spare Stand-in', 'Cancel')).toContainText('412 MB');

  // Each cancelled in turn, until the page says nothing is left.
  for (const title of ['Steady Stand-in', 'Paper Stand-in', 'Alone Stand-in', 'Spare Stand-in']) {
    await press(requestRow(page, title, 'Cancel'), 'Cancel');
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Nothing requested', { exact: true })).toBeVisible();
});

test('[M3.requests] a failed request offers retry and cancel on a phone and a desktop, and cancelling removes it', async ({
  page,
}) => {
  await open(page, '/requests');
  await request(page, 'book', 'Alone Stand-in', 1);
  await request(page, 'book', 'Spare Stand-in', 2);
  await page.reload();
  await fontsLoaded(page);
  const alone = requestRow(page, 'Alone Stand-in', 'Retry');
  const spare = requestRow(page, 'Spare Stand-in', 'Retry');
  await expect(alone).toContainText('The download failed', LOOKING_AGAIN);
  await expect(page.getByText('The download failed; 1 release left')).toBeVisible(LOOKING_AGAIN);

  // No control of a failed row is off, and each has room, at either width.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const row of [alone, spare]) {
      for (const name of ['Retry', 'Cancel']) {
        const control = row.getByRole('button', { name, exact: true });
        await expect(control, `${name} at ${width}`).toBeEnabled();
        await expect(control, `${name} at ${width}`).toBeInViewport({ ratio: 1 });
        const { opacity } = await control.evaluate((el) => getComputedStyle(el));
        expect(opacity, `${name} at ${width}`).toBe('1');
      }
    }
  }

  // The verbs the row draws come from the server's.
  const { inFlight } = (await (await page.request.get(api('/requests'))).json()) as {
    inFlight: { title: string; verbs: string[] }[];
  };
  expect(inFlight.map((r) => [r.title, r.verbs]).sort()).toEqual([
    ['Alone Stand-in', ['retry', 'cancel']],
    ['Spare Stand-in', ['retry', 'pickAnother', 'cancel']],
  ]);

  await press(alone, 'Cancel');
  await expect(page.getByText('Alone Stand-in', { exact: true })).toHaveCount(0);
  await press(spare, 'Cancel');
  await expect(page.getByText('Spare Stand-in', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Pick another release', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Nothing requested', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Nothing requested', { exact: true })).toBeVisible();
});

test('[M3.requests] Requests draws no title over a section with nothing in it', async ({
  page,
}) => {
  await open(page, '/requests');
  await request(page, 'book', 'Steady Stand-in', 1);
  await page.reload();
  await expect(page.getByText('Steady Stand-in', { exact: true })).toBeVisible();
  await expect(page.getByText('In flight', { exact: true })).toBeVisible();
  await expect(page.getByText('Needs choice', { exact: true })).toHaveCount(0);

  await press(requestRow(page, 'Steady Stand-in', 'Cancel'), 'Cancel');
  await expect(page.getByText('Nothing requested', { exact: true })).toBeVisible();
  await request(page, 'album', 'Paper Stand-in', 2);
  await page.reload();
  await expect(page.getByText('Paper Stand-in [FLAC]', { exact: true })).toBeVisible(LOOKING_AGAIN);
  await expect(page.getByText('Needs choice', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('In flight', { exact: true })).toHaveCount(0);
});

test('[M3.requests] Search draws no title over a section with nothing in it, and no blank row', async ({
  page,
}) => {
  await open(page, '/search');
  // Every result but the top one is the household's, so nothing lands in the person's library.
  await page.goto(`${recorded.origin}/search?q=the`);
  await fontsLoaded(page);
  await expect(page.getByText('Top result', { exact: true })).toBeVisible(LOOKING_AGAIN);
  await expect(page.getByText('Not in your library', { exact: true })).toBeVisible();
  await expect(page.getByText('In your library', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Show all', { exact: true })).toHaveCount(0);

  // The same answer with every result the person's own: nothing is left outside.
  await page.route('**/api/search?*', async (route) => {
    const answered = await route.fetch();
    const { results, ...rest } = (await answered.json()) as { results: object[] };
    await route.fulfill({
      response: answered,
      json: { ...rest, results: results.map((r) => ({ ...r, inYourLibrary: true })) },
    });
  });
  await page.reload();
  await fontsLoaded(page);
  await expect(page.getByText('In your library', { exact: true })).toBeVisible(LOOKING_AGAIN);
  await expect(page.getByText('Not in your library', { exact: true })).toHaveCount(0);
});

test('[M3.requests/c] the homes say they are empty, then draw a request among the items', async ({
  page,
}) => {
  for (const [path, words] of [
    ['/books', 'No books yet'],
    ['/music', 'No music yet'],
    ['/podcasts', 'No podcasts yet'],
  ] as const) {
    if (path === '/books') await open(page, path);
    else await page.goto(`${recorded.origin}${path}`);
    await expect(page.getByText(words, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Search', exact: true })).toBeVisible();
  }
  await request(page, 'book', 'Steady Stand-in', 1);
  await page.goto(`${recorded.origin}/books`);
  await expect(page.getByText('No books yet', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Steady Stand-in', { exact: true })).toBeVisible();
  // It has no page to open yet, so its card draws disabled, saying where it stands.
  const card = page.getByRole('button', { name: /Steady Stand-in/ });
  await expect(card).toBeDisabled();
  await expect
    .poll(async () => {
      await page.reload();
      return card.innerText();
    }, LOOKING_AGAIN)
    .toContain('Downloading · 38%');
  await request(page, 'album', 'Paper Stand-in', 2);
  await page.goto(`${recorded.origin}/music`);
  await expect(page.getByText('Paper Stand-in', { exact: true })).toBeVisible();
});

test('[M3.requests/d] on a person who has played nothing, Search puts the household outside their library, and it plays', async ({
  page,
}) => {
  await open(page, '/search');
  expect(await listed(page, 'books')).toEqual([]);
  const item = (await (
    await page.request.get(api(`/items/${keyOf(recorded.multiFile)}`))
  ).json()) as {
    title: string;
  };
  // A word of the book's title that other results share, so it is not the top result.
  type Answer = { results: { title: string; inYourLibrary: boolean; ref: object }[] };
  let q = '';
  for (const word of item.title.split(' ').flatMap((w) => [w, w.slice(0, 2), w.slice(0, 1)])) {
    const asked = await page.request.get(api(`/search?q=${encodeURIComponent(word)}`));
    const { results } = (await asked.json()) as Answer;
    const at = results.findIndex((r) => r.title === item.title);
    if (at > 0) {
      q = word;
      expect(results.every((r) => !r.inYourLibrary)).toBe(true);
      break;
    }
  }
  expect(q, `no word of ${item.title} leaves it below the top result`).not.toBe('');

  await page.goto(`${recorded.origin}/search?q=${encodeURIComponent(q)}`);
  await fontsLoaded(page);
  await expect(page.getByText('Top result', { exact: true })).toBeVisible();
  await expect.poll(() => between(page, 'Not in your library')).toContain(item.title);
  await expect(page.getByText('In your library', { exact: true })).toHaveCount(0);

  const row = page
    .getByRole('button', { name: item.title, exact: true })
    .locator('xpath=ancestor::*[.//*[@aria-label="Play"]][1]');
  await row.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => titlePlaying(page), LOOKING_AGAIN).not.toBeNull();

  // Played, it is theirs: the next search puts it in their library.
  await expect
    .poll(async () => (await listed(page, 'books')).map((b) => b.title), LOOKING_AGAIN)
    .toContain(item.title);
  await page.reload();
  await fontsLoaded(page);
  await expect
    .poll(() => between(page, 'In your library', 'Not in your library'))
    .toContain(item.title);
});

test("[M3.requests/c] Settings' switch shows everyone's library, then only the person's own", async ({
  page,
}) => {
  await open(page, '/books');
  await expect(page.getByText('No books yet', { exact: true })).toBeVisible();

  const flip = async (checked: boolean) => {
    await page.goto(`${recorded.origin}/settings`);
    await fontsLoaded(page);
    const toggle = page.getByRole('switch');
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute('aria-checked', String(!checked));
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', String(checked));
  };

  await flip(true);
  const everything = await listed(page, 'books');
  expect(everything.length).toBeGreaterThan(1);
  // Closing Settings within the app, the home under it loads afresh.
  await page.goto(`${recorded.origin}/books`);
  await expect(page.getByText('No books yet', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(`${recorded.origin}/settings`);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(`${recorded.origin}/books`);
  for (const { title } of everything.slice(0, 3)) {
    await expect(page.getByRole('button', { name: title, exact: true }).first()).toBeVisible();
  }

  // Off again, within the app, the same home goes back to the person's own list.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const toggle = page.getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(`${recorded.origin}/books`);
  await expect(page.getByText('No books yet', { exact: true })).toBeVisible();
  expect(await listed(page, 'books')).toEqual([]);
});
