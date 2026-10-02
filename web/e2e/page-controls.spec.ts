import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { pathOf, webPages } from './nav-pages';

/**
 * Every control on every page the web draws, pressed in the running app: one with no action bound
 * is disabled and a press changes nothing, and one left enabled visibly does something when
 * pressed. So staging shows which controls work: none is a live-looking button that does nothing.
 */

/** A phone and a desktop wide enough for the side panel, for every page. */
const PAGE_WIDTHS = [390, 1440];

/** The icon rail and the narrow labelled rail, for the shell's chrome around one page. */
const CHROME_WIDTHS = [600, 1024];

/** What the page shows at one moment: everything a press on a control might change. */
interface Look {
  location: string;
  /** Every aria-expanded, -selected, -pressed and -checked on the page. */
  aria: string[];
  /** Which controls are disabled. */
  disabled: string[];
  /** Every menu, dialog and listbox showing. */
  overlays: number;
  /** Every text field showing, with its value. */
  fields: string[];
  /** Every scroller's position. */
  scrolls: string[];
  /** The navigation rail's width, where there is one. */
  rail: number | null;
}

/**
 * Marks every control showing with `data-control=<n>`, in document order, and describes each: a
 * Sonora state host or a native or ARIA control, the host standing for the control inside it.
 */
const mark = (page: Page) =>
  page.evaluate(() => {
    const CONTROL = 'button, input, textarea, select, a[href], [role]';
    const seen = new Set<Element>();
    const found = [
      ...document.querySelectorAll(
        '.sn-int, button, input, textarea, select, a[href], [role=button], [role=tab], [role=switch], [role=slider], [role=checkbox], [role=menuitem]',
      ),
    ].flatMap((el) => {
      const control =
        el.matches('.sn-int') && !el.matches(CONTROL) ? (el.querySelector(CONTROL) ?? el) : el;
      if (seen.has(control)) return [];
      seen.add(control);
      // A control inside another (a card's own play button) is pressed on its own.
      return [control];
    });
    for (const el of document.querySelectorAll('[data-control]'))
      el.removeAttribute('data-control');
    return found
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
          r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && el.closest('[inert]') === null
        );
      })
      .map((el, i) => {
        el.setAttribute('data-control', String(i));
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 48);
        const role = el.getAttribute('role');
        return {
          name: `${el.tagName.toLowerCase()}${role === null ? '' : `[${role}]`} "${label}"`,
          disabled:
            el.matches(':disabled, [aria-disabled="true"]') ||
            el.closest('[data-disabled]') !== null,
          field: el.matches('input, textarea'),
          /** Already the one showing: a selected tab or the current page's own destination. */
          current: el.matches('[aria-selected="true"], [aria-current]:not([aria-current="false"])'),
        };
      });
  });

const look = (page: Page): Promise<Look> =>
  page.evaluate(() => {
    // Folded away, as a local search's field is until its button is pressed, is inert.
    const shows = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(el).visibility !== 'hidden' &&
        el.closest('[inert]') === null
      );
    };
    const ARIA = ['aria-expanded', 'aria-selected', 'aria-pressed', 'aria-checked'];
    const aria = [...document.querySelectorAll(ARIA.map((a) => `[${a}]`).join(','))].flatMap(
      (el, i) =>
        ARIA.flatMap((a) => (el.hasAttribute(a) ? [`${i} ${a}=${el.getAttribute(a)}`] : [])),
    );
    const disabled = [...document.querySelectorAll('[data-control]')]
      .filter((el) => el.matches(':disabled, [aria-disabled="true"]'))
      .map((el) => el.getAttribute('data-control')!);
    const overlays = [
      ...document.querySelectorAll(
        '[role=menu], [role=dialog], [role=alertdialog], [role=listbox]',
      ),
    ].filter(shows).length;
    const fields = [...document.querySelectorAll('input, textarea')]
      .filter(shows)
      .map((el) => (el as HTMLInputElement).value);
    const scrolls = [...document.querySelectorAll('*')]
      .filter((el) => el.scrollLeft !== 0 || el.scrollTop !== 0)
      .map((el) => `${el.scrollLeft},${el.scrollTop}`);
    const toggle = document.querySelector('[aria-label$=" rail"]');
    let rail: number | null = null;
    for (let a = toggle?.parentElement ?? null; a !== null; a = a.parentElement)
      if (a.getBoundingClientRect().height > innerHeight / 2) {
        rail = Math.round(a.getBoundingClientRect().width);
        break;
      }
    return {
      location: location.pathname + location.search + location.hash,
      aria,
      disabled,
      overlays,
      fields,
      scrolls,
      rail,
    };
  });

/** Waits until nothing that ends is still animating, so a look is taken at rest. */
const settle = (page: Page) =>
  page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    for (let quiet = 0; quiet < 3;) {
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

/**
 * The page in a new tab, as a visitor first opens it: no history behind it, and no panel tab or
 * rail width carried over in the tab's session storage.
 */
async function open(context: BrowserContext, width: number, path: string) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Where the layout holds the player beside the page, a player sheet's route gives way to the
  // page under it: wait until the location holds.
  let at = page.url();
  for (;;) {
    await settle(page);
    if (page.url() === at) break;
    at = page.url();
  }
  await page.mouse.move(0, 0);
  return page;
}

/**
 * Brings control `n` to the middle of its scrollers and puts the pointer on it, so a control that
 * shows on hover shows. Where a press lands on it, or why none can: it is not drawn, or something
 * else is drawn over it.
 */
async function aim(page: Page, n: number) {
  const centre = await page.evaluate((n) => {
    const el = document.querySelector(`[data-control="${n}"]`)!;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, n);
  await page.mouse.move(centre.x, centre.y);
  await settle(page);
  return page.evaluate(
    ({ n, x, y }) => {
      const el = document.querySelector(`[data-control="${n}"]`)!;
      let opacity = 1;
      for (let a: Element | null = el; a !== null; a = a.parentElement)
        opacity *= Number(getComputedStyle(a).opacity);
      const top = document.elementFromPoint(x, y);
      const own = top !== null && (el.contains(top) || top.contains(el));
      const over =
        top === null
          ? 'nothing'
          : `${top.tagName.toLowerCase()} "${(top.textContent ?? '').trim().slice(0, 24)}"`;
      return { x, y, drawn: opacity >= 0.05, covered: own ? null : over };
    },
    { n, ...centre },
  );
}

/** The ripples under control `n`'s state host. */
const ripples = (page: Page, n: number) =>
  page.evaluate((n) => {
    const el = document.querySelector(`[data-control="${n}"]`)!;
    const host = el.closest('.sn-int') ?? el;
    return host.querySelectorAll('[data-sn-ripple]').length;
  }, n);

/** A look that differs from `before` within `timeout`; a navigation in flight is waited out. */
const changes = (page: Page, before: Look, timeout: number) =>
  expect
    .poll(
      async () => JSON.stringify(await look(page).catch(() => before)) !== JSON.stringify(before),
      { timeout },
    )
    .toBe(true)
    .then(
      () => true,
      () => false,
    );

/**
 * Pressing it shows what is already showing, which needs no change to be seen: on the desktop
 * with a panel of its own, the mini-player's track block while the panel is on Now playing.
 */
const alreadyShowing = (page: Page, name: string) =>
  name.startsWith('div[button] "Open player, ') &&
  page.getByRole('tab', { name: 'Now playing', exact: true, selected: true }).isVisible();

/**
 * Every control showing on `path` at `width`: a disabled one ignores a press, an enabled one does
 * something visible. Every press is made on the page as first opened, in a tab of its own.
 */
async function pressEvery(context: BrowserContext, width: number, path: string) {
  let page = await open(context, width, path);
  const controls = await mark(page);
  expect(controls.length, `${path} shows controls`).toBeGreaterThan(0);
  const faults: string[] = [];
  let changed = false;
  for (const [n, c] of controls.entries()) {
    if (changed) {
      await page.close();
      page = await open(context, width, path);
      const again = await mark(page);
      expect(again[n]?.name, `${path} draws the same controls each time`).toBe(c.name);
    }
    changed = false;
    const at = await aim(page, n);
    if (!at.drawn) continue;
    if (at.covered !== null) {
      faults.push(`${c.name} cannot be pressed: ${at.covered} is drawn over it`);
      continue;
    }
    const before = await look(page);
    if (c.disabled) {
      await page.mouse.down();
      await page.waitForTimeout(120);
      const waves = await ripples(page, n);
      await page.mouse.up();
      if (c.field) await page.keyboard.type('a');
      if (waves > 0) faults.push(`disabled ${c.name} ripples`);
      await settle(page);
      changed = await changes(page, before, 300);
      if (changed) faults.push(`disabled ${c.name} changes the page on a press`);
      continue;
    }
    await page.mouse.click(at.x, at.y);
    if (c.field) await page.keyboard.type('a');
    // Opened afresh after an enabled press either way: a change can come late.
    changed = true;
    if (await changes(page, before, 2_000)) continue;
    if (c.current || (await alreadyShowing(page, c.name))) continue;
    faults.push(`enabled ${c.name} does nothing visible on a press`);
  }
  await page.close();
  expect(faults, `controls on ${path} at ${width}px`).toEqual([]);
}

test.describe.configure({ mode: 'parallel' });

for (const p of webPages) {
  for (const width of PAGE_WIDTHS) {
    test(`[M0.states/d] on ${p.id} at ${width}px, every control without a bound action is disabled`, async ({
      context,
    }) => {
      test.setTimeout(240_000);
      await pressEvery(context, width, pathOf(p.route));
    });
  }
}

for (const width of CHROME_WIDTHS) {
  test(`[M0.states/d] on browse at ${width}px, every control without a bound action is disabled`, async ({
    context,
  }) => {
    test.setTimeout(240_000);
    await pressEvery(context, width, pathOf(webPages.find((p) => p.id === 'browse')!.route));
  });
}
