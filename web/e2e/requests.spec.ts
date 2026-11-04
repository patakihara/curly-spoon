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

/** The Search page for a person with one request. */
async function searchWithARequest(page: Page, q: string, before?: () => Promise<void>) {
  await open(page, '/search');
  await request(page, 'book', 'Steady Stand-in', 1);
  await before?.();
  await page.goto(`${recorded.origin}/search?q=${q}`);
  await fontsLoaded(page);
}

test('[M3.requests] a person with requests reaches them from a Search holding only their library', async ({
  page,
}) => {
  await searchWithARequest(page, 'the', () =>
    page.route('**/api/search?*', async (route) => {
      const answered = await route.fetch();
      const { results, ...rest } = (await answered.json()) as { results: object[] };
      await route.fulfill({
        response: answered,
        json: { ...rest, results: results.map((r) => ({ ...r, inYourLibrary: true })) },
      });
    }),
  );
  await expect(page.getByText('In your library', { exact: true })).toBeVisible(LOOKING_AGAIN);
  await page.getByRole('button', { name: 'Your requests', exact: true }).click({ timeout: 5_000 });
  await expect(page).toHaveURL(`${recorded.origin}/requests`);
});

test('[M3.requests] a person with requests reaches them from a Search that found nothing', async ({
  page,
}) => {
  await searchWithARequest(page, 'zzzqqq');
  await expect(page.getByText('Nothing found', { exact: true })).toBeVisible(LOOKING_AGAIN);
  await page.getByRole('button', { name: 'Your requests', exact: true }).click({ timeout: 5_000 });
  await expect(page).toHaveURL(`${recorded.origin}/requests`);
});

test('[M3.requests] a verb that fails says so on the page', async ({ page }) => {
  await open(page, '/requests');
  await request(page, 'book', 'Steady Stand-in', 1);
  await page.reload();
  await fontsLoaded(page);
  const row = requestRow(page, 'Steady Stand-in', 'Cancel');
  await expect(row).toContainText('Downloading · 38%', LOOKING_AGAIN);
  const before = await page.locator('body').innerText();
  for (const refuse of ['network', 'refused'] as const) {
    await page.route('**/api/requests/*/cancel', (route) =>
      refuse === 'network' ? route.abort() : route.fulfill({ status: 409, json: {} }),
    );
    await press(row, 'Cancel');
    await expect
      .poll(() => page.locator('body').innerText(), { message: refuse, timeout: 3_000 })
      .not.toBe(before);
    await page.unroute('**/api/requests/*/cancel');
  }
});

test('[M3.requests] a double tap on a verb sends it once', async ({ page }) => {
  await open(page, '/requests');
  await request(page, 'book', 'Steady Stand-in', 1);
  await page.reload();
  await fontsLoaded(page);
  const row = requestRow(page, 'Steady Stand-in', 'Cancel');
  await expect(row).toContainText('Downloading · 38%', LOOKING_AGAIN);
  const answers: number[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/cancel')) answers.push(response.status());
  });
  await row.getByRole('button', { name: 'Cancel', exact: true }).dblclick();
  await expect(page.getByText('Nothing requested', { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  expect(answers).toEqual([200]);
});

test('[M3.requests] a verb still on its way shows it is working', async ({ page }) => {
  await open(page, '/requests');
  await request(page, 'book', 'Steady Stand-in', 1);
  await page.reload();
  await fontsLoaded(page);
  const row = requestRow(page, 'Steady Stand-in', 'Cancel');
  await expect(row).toContainText('Downloading · 38%', LOOKING_AGAIN);
  await page.route('**/api/requests/*/cancel', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });
  const cancel = row.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.click();
  await expect
    .poll(
      async () =>
        (await page.locator('[aria-busy="true"]').count()) > 0 ||
        (await cancel.count()) === 0 ||
        (await cancel.isDisabled()),
      { timeout: 1_500 },
    )
    .toBe(true);
});

test('[M3.requests] a verb on its way draws its row disabled, and a failed one back as it was', async ({
  page,
}) => {
  await open(page, '/requests');
  await request(page, 'book', 'Steady Stand-in', 1);
  await page.reload();
  await fontsLoaded(page);
  const row = requestRow(page, 'Steady Stand-in', 'Cancel');
  await expect(row).toContainText('Downloading · 38%', LOOKING_AGAIN);
  await page.route('**/api/requests/*/cancel', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ status: 409, json: {} });
  });
  const cancel = row.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.click();
  await expect(cancel).toBeDisabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('could not be cancelled', LOOKING_AGAIN);
  await expect(cancel).toBeEnabled();
  await expect(row).toContainText('Downloading · 38%');
});

test('[M3.requests/c] a list that failed to load is asked for again, and then draws', async ({
  page,
}) => {
  await open(page, '/requests');
  await request(page, 'book', 'Steady Stand-in', 1);
  let answering = false;
  await page.route('**/api/requests', (route) =>
    answering ? route.continue() : route.fulfill({ status: 500, body: 'no' }),
  );
  await page.reload();
  await fontsLoaded(page);
  await expect(page.getByText('Requests did not load', { exact: true })).toBeVisible();
  answering = true;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Requests did not load', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Steady Stand-in', { exact: true })).toBeVisible();
});

test('[M3.requests] Requests says so when its list failed to load, rather than drawing nothing', async ({
  page,
}) => {
  await open(page, '/requests');
  await page.route('**/api/requests', (route) => route.fulfill({ status: 500, body: 'no' }));
  await page.reload();
  await fontsLoaded(page);
  await expect(page.getByText(/did not answer|failed/i).first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('Nothing requested', { exact: true })).toHaveCount(0);
});

test('[M3.requests/c] a library home says so when its list failed to load, rather than drawing nothing', async ({
  page,
}) => {
  await open(page, '/books');
  await page.route('**/api/library/books*', (route) => route.fulfill({ status: 500, body: 'no' }));
  await page.reload();
  await fontsLoaded(page);
  await expect(page.getByText(/did not answer|failed/i).first()).toBeVisible({ timeout: 5_000 });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Whether the text `words` names is cut off where it is drawn. */
  const cutOff = (page: Page, words: string | RegExp) =>
    page
      .getByText(words)
      .first()
      .evaluate((el) => el.scrollWidth > el.clientWidth);

  test("[M3.requests] a failed request's reason is not cut off", async ({ page }) => {
    await open(page, '/requests');
    await request(page, 'book', 'Alone', 1);
    await page.reload();
    await fontsLoaded(page);
    await expect(page.getByText(/The download failed/).first()).toBeAttached(LOOKING_AGAIN);
    expect(await cutOff(page, /The download failed/)).toBe(false);
  });

  test("[M3.requests] a long request's candidates can be told apart", async ({ page }) => {
    const title = 'Paper Stand-in, the Complete Recordings in a Very Long Deluxe Edition';
    await open(page, '/requests');
    await request(page, 'album', title, 1);
    await page.reload();
    await fontsLoaded(page);
    await expect(page.getByText(`${title} [FLAC]`, { exact: true })).toBeAttached(LOOKING_AGAIN);
    // A row's title stays on one line; what tells a release from the others is the line that wraps.
    await expect(page.getByText(/^FLAC · /).first()).toBeVisible();
    expect(await cutOff(page, /^FLAC · /)).toBe(false);
  });
});

test('[M3.requests/c] Settings offers no switch saying off when it never read the setting', async ({
  page,
}) => {
  await open(page, '/settings');
  const toggle = page.getByRole('switch');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.route('**/api/settings', (route) => route.abort());
  await page.reload();
  await fontsLoaded(page);
  await page.waitForTimeout(1_000);
  // It is on at the server. Unread, the switch may not say off and take a tap as if it knew.
  expect({
    says: await toggle.getAttribute('aria-checked'),
    takesATap: await toggle.isEnabled(),
  }).not.toEqual({ says: 'false', takesATap: true });
});

test('[M3.requests/c] a switch that could not be set says so on the page', async ({ page }) => {
  await open(page, '/settings');
  const toggle = page.getByRole('switch');
  await expect(toggle).toBeEnabled();
  const before = await page.locator('body').innerText();
  await page.route('**/api/settings', (route) =>
    route.request().method() === 'PUT' ? route.abort() : route.continue(),
  );
  await toggle.click();
  await expect.poll(() => page.locator('body').innerText(), { timeout: 3_000 }).not.toBe(before);
});

test("[M3.requests/c] a request's card greyed in a home keeps its status readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/books');
  await request(page, 'book', 'Alone Stand-in', 1);
  await request(page, 'book', 'Steady Stand-in', 2);
  const card = page.getByRole('button', { name: /Alone Stand-in/ });
  const steady = page.getByRole('button', { name: /Steady Stand-in/ });
  await expect
    .poll(async () => {
      await page.reload();
      return `${await card.innerText()} ${await steady.innerText()}`;
    }, LOOKING_AGAIN)
    .toMatch(/Failed.*38%/s);
  const contrastIn = (pill: ReturnType<typeof page.getByText>, theme: 'light' | 'dark') =>
    pill.evaluate((el, theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      type Colour = [number, number, number, number];
      const read = (css: string): Colour => {
        const [a = 0, b = 0, c = 0, d = 1] = (css.match(/[\d.]+/g) ?? []).map(Number);
        return css.startsWith('color(') ? [a * 255, b * 255, c * 255, d] : [a, b, c, d];
      };
      const light = ([r, g, b]: Colour) => {
        const part = (v: number) =>
          v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
        return 0.2126 * part(r) + 0.7152 * part(g) + 0.0722 * part(b);
      };
      const back = read(getComputedStyle(el).backgroundColor);
      const ink = read(getComputedStyle(el).color);
      const over = ink.map((v, i) =>
        i === 3 ? 1 : v * ink[3]! + (back[i] ?? 0) * (1 - ink[3]!),
      ) as Colour;
      const [high, low] = [light(over), light(back)].sort((x, y) => y - x) as [number, number];
      return (high + 0.05) / (low + 0.05);
    }, theme);
  await expect(card).toBeDisabled();
  for (const theme of ['light', 'dark'] as const) {
    for (const [what, pill] of [
      ['Failed', card.getByText('Failed', { exact: true })],
      ['Downloading', steady.getByText('38%')],
    ] as const) {
      expect(await contrastIn(pill, theme), `${what}, ${theme}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('[M3.requests] Browse draws no blank card for a person with nothing to preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/');
  await fontsLoaded(page);
  await page.waitForTimeout(1_500);
  await expect(page.getByText(/Preview episode/)).toHaveCount(0);
});
