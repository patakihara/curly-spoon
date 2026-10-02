import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { givesWay, pathOf, webPages, type NavPage } from './nav-pages';

/**
 * Every control on every page the web draws, pressed in the running app: one with no action bound
 * is disabled and a press changes nothing, and one left enabled visibly does something when
 * pressed. So staging shows which controls work: none is a live-looking button that does nothing.
 * A control a press reveals, a menu's item, a dialog's button or a field, is pressed the same way.
 */

/** A phone and a desktop wide enough for the side panel, for every page. */
const PAGE_WIDTHS = [390, 1440];

/** The icon rail and the narrow labelled rail, for the shell's chrome around one page. */
const CHROME_WIDTHS = [600, 1024];

/**
 * How long a press is watched for its effect, enabled or disabled alike. The slowest effect of an
 * enabled control across the suite at six workers is a navigation drawing its page, measured at
 * under 700 ms; this is about twice that.
 */
const WATCH = 1_500;

/** What a press on one control can do, and nothing else on the page. */
interface Effect {
  location: string;
  /** The control's own aria state, label and value; null once it is gone. */
  own: string | null;
  /** The tab bar around the control, and the tab it shows. */
  surface: { tabs: string; shows: string } | null;
  /** Each element the control names in aria-controls: whether it shows, its scroll and state. */
  controlled: string[];
  /** Menus, dialogs and listboxes showing: a press that opens one adds to it. */
  overlays: number;
  /** Text fields showing: a press that opens one adds to it. */
  fields: number;
  /** The navigation rail's width, for the rail's own expand and collapse button. */
  rail: number | null;
}

interface Control {
  name: string;
  disabled: boolean;
  field: boolean;
  /** Already the one showing: a selected tab or the current page's own destination. */
  current: boolean;
}

/**
 * Marks every control showing with `attr=<n>`, in document order, and describes each: a Sonora
 * state host or a native or ARIA control, the host standing for the control inside it. With
 * `fresh`, only the controls marked neither `data-control` nor `data-before`: those a press
 * revealed.
 */
const mark = (page: Page, attr: string, fresh: boolean): Promise<Control[]> =>
  page.evaluate(
    ({ attr, fresh }) => {
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
      for (const el of document.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr);
      return found
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== 'hidden' &&
            el.closest('[inert]') === null &&
            !(fresh && el.matches('[data-control], [data-before]'))
          );
        })
        .map((el, i) => {
          el.setAttribute(attr, String(i));
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
            current: el.matches(
              '[aria-selected="true"], [aria-current]:not([aria-current="false"])',
            ),
          };
        });
    },
    { attr, fresh },
  );

/** What the control at `sel` can change: its own state, what it controls, and what it opens. */
const effect = (
  page: Page,
  sel: string,
  name: string,
  tabs: string | null = null,
): Promise<Effect> =>
  page.evaluate(
    ({ sel, name, tabs }) => {
      const shows = (el: Element) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          getComputedStyle(el).visibility !== 'hidden' &&
          el.closest('[inert]') === null
        );
      };
      const ARIA = ['expanded', 'selected', 'pressed', 'checked', 'current'];
      const state = (el: Element) => ARIA.map((a) => el.getAttribute(`aria-${a}`)).join(',');
      const named = (e: Element) => {
        const label = (e.getAttribute('aria-label') ?? e.textContent ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 48);
        const role = e.getAttribute('role');
        return `${e.tagName.toLowerCase()}${role === null ? '' : `[${role}]`} "${label}"`;
      };
      // A control its own press redraws in a new element, as a tab of a panel page that the tab
      // replaces, is the one showing in its place under the same name.
      const el =
        document.querySelector(sel) ??
        [...document.querySelectorAll('button, input, textarea, select, a[href], [role]')].find(
          (e) => named(e) === name && shows(e),
        ) ??
        null;
      const host = el?.closest('.sn-int') ?? el;
      // The tab the control's surface shows: the nearest tab bar around it, as a panel's close
      // control taking the panel from Queue back to Now playing. A control gone with its press
      // is followed to the tab bar holding the same tabs.
      const tabsOf = (bar: Element) =>
        [...bar.querySelectorAll('[role=tab]')].map((t) => t.textContent).join('|');
      let bar: Element | null = null;
      for (let a = el?.parentElement ?? null; a !== null && bar === null; a = a.parentElement)
        bar = a.querySelector('[role=tablist]');
      if (el === null && tabs !== null)
        bar =
          [...document.querySelectorAll('[role=tablist]')].find((b) => tabsOf(b) === tabs) ?? null;
      const surface =
        bar === null
          ? null
          : {
              tabs: tabsOf(bar),
              shows: [...bar.querySelectorAll('[role=tab][aria-selected=true]')]
                .map((t) => t.textContent)
                .join('|'),
            };
      const own =
        el === null || host === null
          ? null
          : JSON.stringify([
              state(el),
              state(host),
              (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
              el.matches('input, textarea') ? (el as HTMLInputElement).value : null,
            ]);
      const ids = new Set(
        [el, host].flatMap((e) => (e?.getAttribute('aria-controls') ?? '').split(/\s+/)),
      );
      const controlled = [...ids]
        .filter((id) => id !== '')
        .map((id) => {
          const t = document.getElementById(id);
          return t === null
            ? `${id} gone`
            : `${id} ${shows(t)} ${t.scrollLeft},${t.scrollTop} ${state(t)} ${(t.textContent ?? '').length}`;
        });
      const overlays = [
        ...document.querySelectorAll(
          '[role=menu], [role=dialog], [role=alertdialog], [role=listbox]',
        ),
      ].filter(shows).length;
      const fields = [...document.querySelectorAll('input, textarea')].filter(shows).length;
      let rail: number | null = null;
      if (el?.matches('[aria-label$=" rail"]'))
        for (let a = el.parentElement; a !== null; a = a.parentElement)
          if (a.getBoundingClientRect().height > innerHeight / 2) {
            rail = Math.round(a.getBoundingClientRect().width);
            break;
          }
      return {
        location: location.pathname + location.search + location.hash,
        own,
        surface,
        controlled,
        overlays,
        fields,
        rail,
      };
    },
    { sel, name, tabs },
  );

/**
 * What a press did, if anything: the location moved, the control's own state or what it controls
 * changed, or a menu, dialog or field opened. A control gone after the press (a menu's item as
 * the menu closes) did nothing by going.
 */
function did(before: Effect, after: Effect): string | null {
  if (after.location !== before.location) return `goes to ${after.location}`;
  if (after.own !== null && after.own !== before.own) return 'changes its own state';
  if (
    before.surface !== null &&
    after.surface !== null &&
    after.surface.shows !== before.surface.shows
  )
    return 'changes the tab its surface shows';
  if (JSON.stringify(after.controlled) !== JSON.stringify(before.controlled))
    return 'changes what it controls';
  if (after.overlays > before.overlays) return 'opens a menu or dialog';
  if (after.fields > before.fields) return 'opens a field';
  if (after.rail !== before.rail) return 'resizes the rail';
  return null;
}

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
 * rail width carried over in the tab's session storage. Every control is marked `data-control`.
 */
async function open(context: BrowserContext, width: number, nav: NavPage) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  const path = pathOf(nav.route);
  await page.goto(path, { waitUntil: 'networkidle' });
  // Where the layout holds the player beside the page, a player sheet's route gives way to the
  // page under it, drawn as the location changes: its tab shows in the panel.
  if (givesWay(nav, width)) await page.waitForURL((u) => u.pathname !== path);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  await page.mouse.move(0, 0);
  return { page, controls: await mark(page, 'data-control', false) };
}

/**
 * Brings the control at `sel` to the middle of its scrollers and puts the pointer on it, so a
 * control that shows on hover shows. Where a press lands on it, or why none can: it is not drawn,
 * or something else is drawn over it.
 */
async function aim(page: Page, sel: string) {
  const centre = await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  await page.mouse.move(centre.x, centre.y);
  await settle(page);
  return page.evaluate(
    ({ sel, x, y }) => {
      const el = document.querySelector(sel)!;
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
    { sel, ...centre },
  );
}

/** The ripples under the state host of the control at `sel`. */
const ripples = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const host = el.closest('.sn-int') ?? el;
    return host.querySelectorAll('[data-sn-ripple]').length;
  }, sel);

/** What the press did within the watch, or null; a navigation in flight is waited out. */
async function watch(
  page: Page,
  sel: string,
  name: string,
  before: Effect,
): Promise<string | null> {
  let seen: string | null = null;
  await expect
    .poll(
      async () => {
        seen = did(
          before,
          await effect(page, sel, name, before.surface?.tabs ?? null).catch(() => before),
        );
        return seen;
      },
      { timeout: WATCH },
    )
    .not.toBeNull()
    .catch(() => undefined);
  return seen;
}

/**
 * Pressing it shows what is already showing, which needs no change to be seen: on the desktop
 * with a panel of its own, the mini-player's track block while the panel is on Now playing.
 */
const alreadyShowing = (page: Page, name: string) =>
  name.startsWith('div[button] "Open player, ') &&
  page.getByRole('tab', { name: 'Now playing', exact: true, selected: true }).isVisible();

/**
 * Presses the control at `sel` without watching what follows: where the press landed, the effect
 * before it, and any fault already seen. A disabled one must not ripple under the pointer.
 */
async function pressOnly(page: Page, sel: string, c: Control) {
  const at = await aim(page, sel);
  if (!at.drawn) return { faults: [], before: null };
  if (at.covered !== null)
    return {
      faults: [`${c.name} cannot be pressed: ${at.covered} is drawn over it`],
      before: null,
    };
  const before = await effect(page, sel, c.name);
  const faults: string[] = [];
  if (c.disabled) {
    await page.mouse.down();
    await page.waitForTimeout(120);
    if ((await ripples(page, sel)) > 0) faults.push(`disabled ${c.name} ripples`);
    await page.mouse.up();
  } else {
    // What shows just before the press, so what it reveals is told apart from what aiming did.
    await mark(page, 'data-before', false);
    await page.mouse.click(at.x, at.y);
  }
  if (c.field) await page.keyboard.type('a');
  return { faults, before };
}

/**
 * Presses the control at `sel` once: a disabled one must ignore it, an enabled one must do
 * something within the watch. The faults it finds, and what the press did.
 */
async function press(page: Page, sel: string, c: Control) {
  const { faults, before } = await pressOnly(page, sel, c);
  if (before === null) return { faults, did: null, pressed: false };
  const done = await watch(page, sel, c.name, before);
  if (c.disabled) {
    if (done !== null) faults.push(`disabled ${c.name} ${done} on a press`);
  } else if (done === null && !c.current && !(await alreadyShowing(page, c.name)))
    faults.push(`enabled ${c.name} does nothing visible on a press`);
  return { faults, did: done, pressed: true };
}

/**
 * Presses a run of disabled controls one after another, then watches them all together for the
 * same window a single press gets, so each is watched at least that long. Whether any did
 * anything; where one did, the run is pressed again one at a time to name it.
 */
async function pressRun(page: Page, run: { sel: string; c: Control }[], faults: string[]) {
  const pressed: { sel: string; c: Control; before: Effect }[] = [];
  for (const { sel, c } of run) {
    const done = await pressOnly(page, sel, c);
    faults.push(...done.faults);
    if (done.before !== null) pressed.push({ sel, c, before: done.before });
  }
  const any = async () => {
    for (const { sel, c, before } of pressed)
      if (
        did(
          before,
          await effect(page, sel, c.name, before.surface?.tabs ?? null).catch(() => before),
        ) !== null
      )
        return true;
    return false;
  };
  return expect
    .poll(any, { timeout: WATCH })
    .toBe(true)
    .then(
      () => true,
      () => false,
    );
}

/**
 * Every control showing on `nav`'s page at `width`, and every control a press on one of them
 * reveals: a disabled one ignores a press, an enabled one does something visible. Every press is
 * made on the page as first opened, in a tab of its own.
 */
async function pressEvery(context: BrowserContext, width: number, nav: NavPage) {
  const path = pathOf(nav.route);
  const first = await open(context, width, nav);
  let { page } = first;
  const { controls } = first;
  expect(controls.length, `${path} shows controls`).toBeGreaterThan(0);
  const faults: string[] = [];
  /** A fresh tab with the controls marked as first drawn. */
  const again = async () => {
    await page.close();
    const opened = await open(context, width, nav);
    page = opened.page;
    expect(
      opened.controls.map((c) => c.name),
      `${path} draws the same controls each time`,
    ).toEqual(controls.map((c) => c.name));
  };
  let dirty = false;
  /** Disabled controls waiting to be pressed together. */
  let run: { sel: string; c: Control }[] = [];
  const flush = async () => {
    if (run.length === 0) return;
    if (dirty) await again();
    dirty = false;
    const quiet: string[] = [];
    if (await pressRun(page, run, quiet)) {
      // Something moved: each pressed alone on a fresh page, to name the one that did it.
      for (const { sel, c } of run) {
        await again();
        const result = await press(page, sel, c);
        faults.push(...result.faults);
      }
      dirty = true;
    } else faults.push(...quiet);
    run = [];
  };
  for (const [n, c] of controls.entries()) {
    const sel = `[data-control="${n}"]`;
    if (c.disabled) {
      run.push({ sel, c });
      continue;
    }
    await flush();
    if (dirty) await again();
    dirty = false;
    const result = await press(page, sel, c);
    faults.push(...result.faults);
    if (!result.pressed) continue;
    // Opened afresh after an enabled press either way: a change can come late.
    dirty = true;
    if (result.did !== 'opens a menu or dialog' && result.did !== 'opens a field') continue;
    // One level down: what the press revealed, each pressed after the same press afresh.
    const revealed = await mark(page, 'data-revealed', true);
    for (const [k, r] of revealed.entries()) {
      await again();
      const parent = await aim(page, sel);
      await mark(page, 'data-before', false);
      await page.mouse.click(parent.x, parent.y);
      await settle(page);
      const shown = await mark(page, 'data-revealed', true);
      expect(shown[k]?.name, `${c.name} reveals the same controls each time`).toBe(r.name);
      const inner = await press(page, `[data-revealed="${k}"]`, r);
      faults.push(...inner.faults.map((f) => `${f}, revealed by ${c.name}`));
    }
  }
  await flush();
  await page.close();
  expect(faults, `controls on ${path} at ${width}px`).toEqual([]);
}

test.describe.configure({ mode: 'parallel' });

for (const p of webPages) {
  for (const width of PAGE_WIDTHS) {
    test(`[M0.states/d] on ${p.id} at ${width}px, every control without a bound action is disabled`, async ({
      context,
    }) => {
      test.setTimeout(300_000);
      await pressEvery(context, width, p);
    });
  }
}

for (const width of CHROME_WIDTHS) {
  test(`[M0.states/d] on browse at ${width}px, every control without a bound action is disabled`, async ({
    context,
  }) => {
    test.setTimeout(300_000);
    await pressEvery(
      context,
      width,
      webPages.find((p) => p.id === 'browse')!,
    );
  });
}
