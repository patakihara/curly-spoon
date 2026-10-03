import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * 11-front.md's "Shell and navigation", walked by tapping the shell's own controls, never by
 * going to a URL in between: ✕ returns to whatever opened a page, each destination keeps its own
 * stack, the mini-player opens Now Playing, the player's tabs switch sheets, a sheet closes to the
 * page under it, and the browser's back goes to the previous view. A reload carries on where it
 * was. The same journey runs on the phone's bottom bar and on the desktop's rail, whose hamburger
 * collapses it and back. A page's menu starts closed, opens from its button and closes on the
 * phone's scrim, back to the page under it, or on an item.
 */
const SIZES = [
  { name: 'phone, through the bottom bar', width: 390, height: 844, phone: true },
  { name: 'desktop, through the rail', width: 1440, height: 900, phone: false },
];

/**
 * A destination on the bottom bar or the rail: the button named by its label, not a toggle (a
 * page's segmented filter can share the name, and says whether it is pressed).
 */
const destination = (page: Page, label: string): Locator =>
  page.getByRole('button', { name: label, exact: true }).and(page.locator(':not([aria-pressed])'));

/**
 * Waits until nothing that ends is still animating (the rail easing, a pill fading), so the next
 * tap lands on a control at rest rather than racing it on a slow machine.
 */
const settle = (page: Page) =>
  page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    for (let quiet = 0; quiet < 2;) {
      await frame();
      const running = document
        .getAnimations()
        .filter(
          (a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity,
        );
      if (running.length === 0) quiet++;
      else {
        quiet = 0;
        await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
      }
    }
  });

/** Taps a destination and waits for its page, at rest. */
async function goTo(page: Page, label: string, url: string) {
  await destination(page, label).click();
  await expect(page).toHaveURL(url);
  await settle(page);
}

/** The mini-player: on the phone the whole bar, on desktop the player bar's track block. */
const miniPlayer = (page: Page, phone: boolean): Locator => {
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  return phone
    ? pause.locator('xpath=..')
    : pause.locator('xpath=ancestor::div[contains(@style, "grid-template-columns")][1]/div[1]');
};

/** A card or row showing `title`, tapped to open what it names. */
const item = (page: Page, title: string) => page.getByText(title, { exact: true }).first();

/** The album header's artist, a link to the artist's page. */
const artistLink = (page: Page, name: string) =>
  page.locator('div[style*="cursor: pointer"]', { hasText: new RegExp(`^${name}$`) }).first();

/**
 * The album header's menu: the page binds none of its verbs yet, so its button is drawn disabled
 * (Material's disabled state, M0.states) and the menu stays shut when it is pressed.
 */
async function useAlbumMenu(page: Page) {
  const menu = page.getByRole('menu');
  const button = page.getByRole('button', { name: 'More options', exact: true }).first();
  await expect(menu).toBeHidden();
  await expect(button).toBeDisabled();
  await button.click({ force: true });
  await expect(menu).toBeHidden();
}

/** The page's heading, as the canvas test finds it. */
const heading = (page: Page, text: string) =>
  expect(
    page
      .getByText(new RegExp(`^\\s*${text}\\s*$`, 'i'))
      .locator('visible=true')
      .first(),
  ).toBeVisible();

for (const size of SIZES) {
  test(`[M0.canvas] the shell navigates the map by tapping, on a ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/', { waitUntil: 'networkidle' });
    await settle(page);

    await goTo(page, 'Music', '/music');
    await item(page, 'Between Lines of Light').click();
    await expect(page).toHaveURL('/music/albums/between-lines-of-light');
    await useAlbumMenu(page);
    await expect(page).toHaveURL('/music/albums/between-lines-of-light');
    await artistLink(page, 'Deep Inertia').click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
    await item(page, 'Shadows and Sighs').click();
    await expect(page).toHaveURL('/music/albums/shadows-and-sighs');

    // A reload carries on where it was: ✕ still returns to whatever opened the album, the artist.
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
    await heading(page, 'Deep Inertia');

    // Music keeps its stack while Books is open: back on the album, whose ✕ goes to the artist.
    await item(page, 'Shadows and Sighs').click();
    await expect(page).toHaveURL('/music/albums/shadows-and-sighs');
    await goTo(page, 'Books', '/books');
    await goTo(page, 'Music', '/music/albums/shadows-and-sighs');

    // The mini-player opens Now Playing; its tabs switch sheets; closing returns to the album. On
    // the desktop it is the panel the layout always opens beside the album, with no close, its tab
    // never the page's.
    const album = '/music/albums/shadows-and-sighs';
    await miniPlayer(page, size.phone).click();
    await expect(page).toHaveURL(size.phone ? '/playing' : album);
    await heading(page, 'Now Playing');
    await page.getByRole('tab', { name: 'Queue' }).click();
    await expect(page).toHaveURL(size.phone ? '/playing/queue' : album);
    if (size.phone)
      await page.getByRole('button', { name: 'Collapse player', exact: true }).click();
    else await page.getByRole('tab', { name: 'Now playing' }).click();
    await expect(page).toHaveURL(album);

    // The browser's back goes to the previous view, wherever that was: the sheet just closed.
    if (size.phone) {
      await page.goBack();
      await expect(page).toHaveURL('/playing/queue');
      await page.goBack();
      await expect(page).toHaveURL(album);
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL('/music/artists/deep-inertia');

    // Tapping the destination showing adds no history: the browser's back leaves it.
    await goTo(page, 'Books', '/books');
    await goTo(page, 'Books', '/books');
    await page.goBack();
    await expect(page).toHaveURL('/music/artists/deep-inertia');
  });
}

test("the avatar leading the phone's top bar opens Settings, whose close returns to the page under it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/books', { waitUntil: 'networkidle' });
  await settle(page);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page).toHaveURL('/settings');
  await heading(page, 'Settings');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/books');
});

test('an album\'s "More by" card opens that album, whose close returns to the album that opened it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/music/albums/between-lines-of-light', { waitUntil: 'networkidle' });
  await settle(page);
  await item(page, 'Between Two Worlds').click();
  await expect(page).toHaveURL('/music/albums/between-two-worlds');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/music/albums/between-lines-of-light');
});

test('a Browse shelf\'s "See all" opens the shelf in full, whose cards open their own pages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await settle(page);
  await page
    .getByText('Recently added', { exact: true })
    .locator('xpath=ancestor::*[.//button[@aria-label="See all"]][1]')
    .getByRole('button', { name: 'See all', exact: true })
    .click();
  await expect(page).toHaveURL('/shelves/recently-added');
  await settle(page);
  await item(page, 'Salt and Static').click();
  await expect(page).toHaveURL('/music/albums/salt-and-static');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/shelves/recently-added');
});

/** The player panel's tab showing, or none where no panel is drawn. */
async function panelTab(page: Page): Promise<string | null> {
  const tab = page
    .getByRole('tab', { selected: true })
    .filter({ hasText: /^(Now playing|Queue|Lyrics)$/ })
    .locator('visible=true');
  return (await tab.count()) === 0 ? null : tab.first().innerText();
}

/**
 * Which of the mini-player's Queue and Lyrics is lit, its glyph tinted the play ink; none where no
 * mini-player is drawn.
 */
async function lit(page: Page): Promise<string | null> {
  const tinted: string[] = [];
  for (const name of ['Queue', 'Lyrics']) {
    const button = page.getByRole('button', { name, exact: true }).locator('visible=true');
    if ((await button.count()) === 0) continue;
    if ((await button.evaluate((b) => b.style.color)).includes('--play-ink')) tinted.push(name);
  }
  return tinted.join(' and ') || null;
}

/** The panel shows `tab`, or none, and the mini-player lights that tab when it is Queue or Lyrics. */
async function showing(page: Page, tab: string | null) {
  await expect.poll(() => panelTab(page)).toBe(tab);
  expect(await lit(page)).toBe(tab === 'Queue' || tab === 'Lyrics' ? tab : null);
}

for (const width of [1024, 1440]) {
  test(`[M0.canvas/c] at ${width}px the mini-player's Queue and Lyrics show the player panel at that tab, the page staying as it is`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/music/albums/between-lines-of-light', { waitUntil: 'networkidle' });
    await settle(page);
    const own = width >= 1240 ? 'Now playing' : null;
    const queue = page.getByRole('button', { name: 'Queue', exact: true });
    const lyrics = page.getByRole('button', { name: 'Lyrics', exact: true });
    await showing(page, own);

    await queue.click();
    await showing(page, 'Queue');
    await lyrics.click();
    await showing(page, 'Lyrics');
    await lyrics.click();
    await showing(page, 'Now playing');
    await expect(page).toHaveURL('/music/albums/between-lines-of-light');

    // The panel's tab is apart from the page: its own tabs leave the page, and a new page leaves it.
    await queue.click();
    await page.getByRole('tab', { name: 'Lyrics' }).click();
    await showing(page, 'Lyrics');
    await expect(page).toHaveURL('/music/albums/between-lines-of-light');
    await goTo(page, 'Books', '/books');
    await showing(page, 'Lyrics');
    await page.reload({ waitUntil: 'networkidle' });
    await showing(page, 'Lyrics');

    // Its close leaves the page too; the panel the width always opens has none.
    const close = page.getByRole('button', { name: 'Close Player', exact: true });
    if (own === null) {
      await close.click();
      await showing(page, null);
    } else await expect(close).toHaveCount(0);
    await expect(page).toHaveURL('/books');
  });
}

test("[M0.canvas/c] at 1440px the panel's own tabs, the track block and a player sheet's route all set the one tab the mini-player lights", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/music/albums/between-lines-of-light', { waitUntil: 'networkidle' });
  await settle(page);
  const album = '/music/albums/between-lines-of-light';
  const queue = page.getByRole('button', { name: 'Queue', exact: true });
  const lyrics = page.getByRole('button', { name: 'Lyrics', exact: true });

  // The panel of its own, at Now Playing: its Queue tab is the mini-player's Queue, lit.
  await page.getByRole('tab', { name: 'Queue' }).click();
  await showing(page, 'Queue');
  await expect(page).toHaveURL(album);
  await queue.click();
  await showing(page, 'Now playing');

  // The track block shows Now Playing in the panel, from any tab, never leaving the page.
  await lyrics.click();
  await showing(page, 'Lyrics');
  await miniPlayer(page, false).click();
  await showing(page, 'Now playing');
  await expect(page).toHaveURL(album);

  // A player sheet's route shows its tab in the panel, beside the page under it.
  await page.goto('/playing/queue', { waitUntil: 'networkidle' });
  await showing(page, 'Queue');
  await expect(page).not.toHaveURL(/\/playing/);
  const under = page.url();

  // Queue pressed twice: Now Playing, nothing lit; a reload keeps it so.
  await queue.click();
  await showing(page, 'Now playing');
  await queue.click();
  await showing(page, 'Queue');
  await queue.click();
  await showing(page, 'Now playing');
  await page.reload({ waitUntil: 'networkidle' });
  await showing(page, 'Now playing');
  await expect(page).toHaveURL(under);

  // Lyrics, then a destination switch and a reload, then Lyrics again: always the one tab.
  await lyrics.click();
  await showing(page, 'Lyrics');
  await goTo(page, 'Books', '/books');
  await showing(page, 'Lyrics');
  await page.reload({ waitUntil: 'networkidle' });
  await showing(page, 'Lyrics');
  await lyrics.click();
  await showing(page, 'Now playing');
  await expect(page).toHaveURL('/books');
});

test('[M0.canvas/c] at 1440px the panel the layout always opens has no close, whatever tab it shows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/music/albums/between-lines-of-light', { waitUntil: 'networkidle' });
  await settle(page);
  const close = page.getByRole('button', { name: 'Close Player', exact: true });
  await showing(page, 'Now playing');
  await expect(close).toHaveCount(0);
  await page.getByRole('tab', { name: 'Queue' }).click();
  await showing(page, 'Queue');
  await expect(close).toHaveCount(0);
  await page.getByRole('tab', { name: 'Now playing' }).click();
  await showing(page, 'Now playing');
  await expect(close).toHaveCount(0);
  await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
  await showing(page, 'Lyrics');
  await expect(close).toHaveCount(0);
  await page.goto('/playing/queue', { waitUntil: 'networkidle' });
  await showing(page, 'Queue');
  await expect(close).toHaveCount(0);
});

/**
 * The width of the page's front layer: the scroller holding `text`, a line of the page's own
 * content, so a page squeezed beside the panel shows as narrow however its heading wraps.
 */
const pageWidth = (page: Page, text: string) =>
  page
    .getByText(text, { exact: true })
    .first()
    .evaluate((node) => {
      let scroller = node.parentElement;
      while (scroller !== null && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
        scroller = scroller.parentElement;
      if (scroller === null) throw new Error(`${node.textContent} is not in the front layer`);
      return scroller.getBoundingClientRect().width;
    });

/** The narrowest a page beside the panel may be: a phone's width. */
const USABLE = 360;

/** The player panel drawn over the page as a modal side sheet. */
const modalSheet = (page: Page) => page.locator('[role="dialog"][aria-modal="true"]');

/** Whether keyboard focus is inside the modal side sheet. */
const focusInSheet = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.closest('[role="dialog"][aria-modal="true"]') != null,
  );

test("[M0.canvas/c] at 1024px the mini-player's track block opens Now Playing as the side panel beside the page, the page still usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const album = '/music/albums/between-lines-of-light';
  await page.goto(album, { waitUntil: 'networkidle' });
  await settle(page);
  await showing(page, null);
  await miniPlayer(page, false).click();
  await showing(page, 'Now playing');
  await settle(page);
  await expect(page).toHaveURL(album);
  await expect(modalSheet(page)).toHaveCount(0);
  expect(await pageWidth(page, 'Glass Coast')).toBeGreaterThanOrEqual(USABLE);

  // Its own tabs switch within the panel, and the track block brings it back to Now Playing.
  await page.getByRole('tab', { name: 'Queue' }).click();
  await showing(page, 'Queue');
  await expect(page).toHaveURL(album);
  await miniPlayer(page, false).click();
  await showing(page, 'Now playing');

  // Its close leaves the page as it was, with no panel.
  await page.getByRole('button', { name: 'Close Player', exact: true }).click();
  await showing(page, null);
  await expect(page).toHaveURL(album);
  expect(await pageWidth(page, 'Glass Coast')).toBeGreaterThanOrEqual(USABLE);
});

test('[M0.canvas/c] at 600px the mini-player opens the player panel over the page as a modal side sheet, the page keeping its full width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 900 });
  const album = '/music/albums/between-lines-of-light';
  await page.goto(album, { waitUntil: 'networkidle' });
  await settle(page);
  await showing(page, null);
  const full = await pageWidth(page, 'Glass Coast');
  expect(full).toBeGreaterThanOrEqual(USABLE);

  // The track block: Now Playing over the page, behind a scrim, focus held in the sheet.
  await miniPlayer(page, false).click();
  await showing(page, 'Now playing');
  await settle(page);
  await expect(modalSheet(page)).toBeVisible();
  await expect(page.locator('[data-scrim]')).toBeVisible();
  await expect(page).toHaveURL(album);
  expect(await pageWidth(page, 'Glass Coast')).toBe(full);
  expect(await focusInSheet(page)).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInSheet(page)).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await focusInSheet(page)).toBe(true);

  // Its own tabs switch within the sheet; Escape closes it, the page as it was.
  await page.getByRole('tab', { name: 'Queue' }).click();
  await showing(page, 'Queue');
  await page.keyboard.press('Escape');
  await showing(page, null);
  await expect(modalSheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(album);
  expect(await pageWidth(page, 'Glass Coast')).toBe(full);

  // The mini-player's Lyrics opens it at that tab, which the Panel store keeps over a reload.
  await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
  await showing(page, 'Lyrics');
  await page.reload({ waitUntil: 'networkidle' });
  await showing(page, 'Lyrics');
  await expect(modalSheet(page)).toBeVisible();

  // A tap on the scrim closes it, as its own close does.
  await settle(page);
  await page.locator('[data-scrim]').click({ position: { x: 40, y: 300 } });
  await showing(page, null);
  await miniPlayer(page, false).click();
  await showing(page, 'Now playing');
  await page.getByRole('button', { name: 'Close Player', exact: true }).click();
  await showing(page, null);
  await expect(page).toHaveURL(album);
  expect(await pageWidth(page, 'Glass Coast')).toBe(full);
});

for (const width of [600, 1024]) {
  test(`[M0.canvas/c] at ${width}px a player sheet's route shows its tab in the panel, over or beside the page under it`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const album = '/music/albums/between-lines-of-light';
    await page.goto(album, { waitUntil: 'networkidle' });
    await settle(page);
    await page.goto('/playing/lyrics', { waitUntil: 'networkidle' });
    await showing(page, 'Lyrics');
    await expect(page).not.toHaveURL(/\/playing/);
    await expect(modalSheet(page)).toHaveCount(width < 1024 ? 1 : 0);
    const under = page.url();
    await page.reload({ waitUntil: 'networkidle' });
    await showing(page, 'Lyrics');
    await expect(page).toHaveURL(under);
    await page.getByRole('button', { name: 'Close Player', exact: true }).click();
    await showing(page, null);
    await expect(page).toHaveURL(under);
  });

  for (const [route, tab] of [
    ['/playing', 'Now playing'],
    ['/playing/queue', 'Queue'],
  ] as const) {
    test(`[M0.canvas/c] at ${width}px ${route} opened in a fresh tab shows the panel at ${tab} over or beside a usable page`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await showing(page, tab);
      await expect(page).not.toHaveURL(/\/playing/);
      await settle(page);
      const under = page.url();
      // Browse's home under it: its first shelf heading is a line of the page's own content.
      const line = 'Jump back in';
      if (width < 1024) {
        await expect(modalSheet(page)).toBeVisible();
        const over = await pageWidth(page, line);
        await page.keyboard.press('Escape');
        await showing(page, null);
        expect(await pageWidth(page, line)).toBe(over);
      } else {
        await expect(modalSheet(page)).toHaveCount(0);
        expect(await pageWidth(page, line)).toBeGreaterThanOrEqual(USABLE);
        await page.getByRole('button', { name: 'Close Player', exact: true }).click();
        await showing(page, null);
      }
      expect(await pageWidth(page, line)).toBeGreaterThanOrEqual(USABLE);
      await expect(page).toHaveURL(under);
    });
  }
}

test("[M0.canvas/c] at 390px the player sheet's tabs switch within the one sheet, with no opening transition", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/playing', { waitUntil: 'networkidle' });
  await settle(page);
  // The sheet: the nearest ancestor of the tabs drawn with the sheet's opening transition, kept.
  const found = await page.getByRole('tab', { name: 'Now playing' }).evaluate((tab) => {
    let el: Element | null = tab;
    while (el !== null && !(el as HTMLElement).style?.transition.includes('clip-path'))
      el = el.parentElement;
    (window as unknown as { sheet: unknown }).sheet = el;
    return el !== null;
  });
  expect(found).toBe(true);

  await page.getByRole('tab', { name: 'Queue' }).click();
  await expect(page).toHaveURL('/playing/queue');
  // For the next frames the sheet showing is the one kept, and neither it nor its content runs a
  // transition: no clip, slide or fade.
  const moved = await page.getByRole('tab', { name: 'Queue' }).evaluate(async (tab) => {
    const kept = (window as unknown as { sheet: HTMLElement }).sheet;
    let sheet: Element | null = tab;
    while (sheet !== null && !(sheet as HTMLElement).style?.transition.includes('clip-path'))
      sheet = sheet.parentElement;
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      for (const el of [sheet, sheet?.firstElementChild]) {
        for (const a of el?.getAnimations() ?? [])
          seen.push((a as CSSTransition).transitionProperty ?? 'animation');
      }
    }
    return { same: sheet === kept, seen: [...new Set(seen)] };
  });
  expect(moved).toEqual({ same: true, seen: [] });
  await expect(page.getByRole('tab', { name: 'Queue' })).toHaveAttribute('aria-selected', 'true');
});

test("[M0.canvas/c] at 390px the browser's back from the player sheet's Queue closes the sheet to the page under it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await settle(page);
  await goTo(page, 'Books', '/books');
  await miniPlayer(page, true).click();
  await expect(page).toHaveURL('/playing');
  await page.getByRole('tab', { name: 'Queue' }).click();
  await expect(page).toHaveURL('/playing/queue');
  await page.getByRole('tab', { name: 'Lyrics' }).click();
  await expect(page).toHaveURL('/playing/lyrics');
  await page.getByRole('tab', { name: 'Queue' }).click();
  await expect(page).toHaveURL('/playing/queue');
  // The tabs replace one another: one step back leaves the sheet for the page it was opened over.
  await page.goBack();
  await expect(page).toHaveURL('/books');
  await heading(page, 'Books');
  await expect(page.getByRole('tab', { name: 'Queue' })).toHaveCount(0);
});

test("[M0.canvas] the rail's hamburger collapses the labelled rail to the icon rail and back, staying so from page to page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/music', { waitUntil: 'networkidle' });
  await settle(page);
  const collapse = page.getByRole('button', { name: 'Collapse rail', exact: true });
  const expand = page.getByRole('button', { name: 'Expand rail', exact: true });
  const rail = (toggle: Locator) =>
    toggle.locator('xpath=ancestor::*[contains(@style, "rail-width")][1]');
  const wide = await settledWidth(rail(collapse));

  await collapse.click();
  await expect(expand).toBeVisible();
  expect(await settledWidth(rail(expand))).toBeLessThan(wide);

  await goTo(page, 'Books', '/books');
  await expect(expand).toBeVisible();
  await goTo(page, 'Settings', '/settings');
  await expect(expand).toBeVisible();

  await expand.click();
  await expect(collapse).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/books');
  await expect(collapse).toBeVisible();
});

/** The element's width once its running transitions (the rail's width animation) have ended. */
async function settledWidth(element: Locator): Promise<number> {
  return element.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
    return el.getBoundingClientRect().width;
  });
}
