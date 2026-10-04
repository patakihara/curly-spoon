import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The rail moves as Sonora Prime's does, 11-front.md's "The shell stays mounted between pages":
 * one rail for the whole app, never remounted, so switching destinations or toggling the
 * hamburger changes the same rail in place. Its width and its pills ease over `--duration-slow`,
 * the lit pill fades from one row to the next, and no pill regrows from icon width.
 *
 * Nothing here watches the wall clock: the page's own observers record what happens (a node
 * removed, a size drawn, a transition started), and the rail's width transition is paused and
 * stepped through by hand, so a slow machine can neither fake a failure nor hide one.
 */
const SIZES = [
  { name: 'the labelled rail', width: 1440, height: 900, expanded: true },
  { name: 'the icon rail', width: 800, height: 900, expanded: false },
];

/** An expanded pill is its icon's 56px, its label and 20px: 76px is a pill with no label yet. */
const ICON_PILL = 76;

/** Where the rail's width transition is stepped to, as fractions of its duration. */
const STEPS = [0, 0.25, 0.5, 0.75, 1];

/** A destination on the rail: the row drawing its icon and its label. */
const destination = (page: Page, label: string): Locator =>
  page
    .locator(`xpath=//div[span[text()="${label}"] and span/span[contains(@style, "--font-icon")]]`)
    .first();

const toggle = (page: Page) => page.getByRole('button', { name: /^(Collapse|Expand) rail$/ });

interface Timing {
  duration: number;
  easing: string;
}

interface Run extends Timing {
  property: string;
}

/** What the page saw while an action ran, from its own observers. */
interface Guarded {
  /** The stashed rail or pills taken out of the page, by name. */
  removed: string[];
  /** Every width each stashed pill was drawn at, by pill index. */
  pillSizes: number[][];
  /** The CSS transitions each stashed pill started, by pill index. */
  pillRuns: Run[][];
  /** The CSS transitions the stashed rail started. */
  railRuns: Run[];
}

/** In the page: the rail (found from its hamburger, as shell-nav.spec does) and its pills. */
function railScript() {
  return `
    window.__findRail = () => {
      const button = [...document.querySelectorAll('button')].find((b) =>
        /^(Collapse|Expand) rail$/.test(b.getAttribute('aria-label') ?? ''));
      let el = button ?? null;
      while (el !== null && !(el.getAttribute('style') ?? '').includes('rail-width')) el = el.parentElement;
      return el;
    };
    window.__findPills = (rail) =>
      [...rail.querySelectorAll('div[style*="cursor: pointer"] > span:first-child')];
  `;
}

type RailWindow = Window & {
  __findRail: () => HTMLElement | null;
  __findPills: (rail: Element) => HTMLElement[];
  __rail?: HTMLElement;
  __pills?: HTMLElement[];
  __unguard?: () => Guarded;
  __railRun?: { animation: CSSTransition; duration: number; easing: string };
};

/**
 * Waits, frame by frame, until nothing on the page is moving to an end: every running animation
 * that ends has finished, and two frames in a row start none, so a transition a frame late is
 * waited for too. An endless one (a playing indicator) never settles, so it is left running.
 */
async function settle(page: Page) {
  await page.evaluate(async () => {
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
}

/** Keeps the rail and its pills as they are now, to check later that they are the same elements. */
async function stash(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as RailWindow;
    const rail = w.__findRail();
    if (rail === null) throw new Error('no rail on the page');
    w.__rail = rail;
    w.__pills = w.__findPills(rail);
  });
}

/** Whether the rail showing is the one stashed, every stashed pill still in it. */
async function sameRail(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as RailWindow;
    const rail = w.__findRail();
    return {
      connected: w.__rail?.isConnected === true,
      same: rail !== null && rail === w.__rail,
      pills: (w.__pills ?? []).every((p) => p.isConnected && rail !== null && rail.contains(p)),
    };
  });
}

/**
 * Starts the page's observers on the stashed rail and pills: a MutationObserver on the shell for
 * either being removed, a ResizeObserver for every width a pill is drawn at, and `transitionrun`
 * for every CSS transition either starts.
 */
async function guard(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as RailWindow;
    const rail = w.__rail!;
    const pills = w.__pills!;
    const seen: Guarded = {
      removed: [],
      pillSizes: pills.map(() => []),
      pillRuns: pills.map(() => []),
      railRuns: [],
    };
    const removals = (records: MutationRecord[]) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node === rail || node.contains(rail)) seen.removed.push('the rail');
          pills.forEach((pill, i) => {
            if (node === pill || node.contains(pill)) seen.removed.push(`pill ${i}`);
          });
        }
      }
    };
    const mutations = new MutationObserver(removals);
    mutations.observe(document.body, { childList: true, subtree: true });
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const i = pills.indexOf(entry.target as HTMLElement);
        seen.pillSizes[i]!.push(entry.borderBoxSize[0]!.inlineSize);
      }
    });
    for (const pill of pills) sizes.observe(pill, { box: 'border-box' });
    const onRun = (event: TransitionEvent) => {
      const target = event.target as HTMLElement;
      const animation = target
        .getAnimations()
        .find((a) => a instanceof CSSTransition && a.transitionProperty === event.propertyName);
      const timing = animation?.effect?.getTiming();
      const run = {
        property: event.propertyName,
        duration: Number(timing?.duration ?? NaN),
        easing: String(timing?.easing ?? ''),
      };
      const i = pills.indexOf(target);
      if (i >= 0) seen.pillRuns[i]!.push(run);
      else if (target === rail) seen.railRuns.push(run);
    };
    document.addEventListener('transitionrun', onRun, true);
    w.__unguard = () => {
      removals(mutations.takeRecords());
      mutations.disconnect();
      sizes.disconnect();
      document.removeEventListener('transitionrun', onRun, true);
      return seen;
    };
  });
}

/** Stops the observers once the page has settled, and hands back what they saw. */
async function unguard(page: Page): Promise<Guarded> {
  await settle(page);
  return page.evaluate(() => (window as unknown as RailWindow).__unguard!());
}

/** Runs `action` under the page's observers, until everything it started has settled. */
async function guarded(page: Page, action: () => Promise<void>): Promise<Guarded> {
  await guard(page);
  await action();
  return unguard(page);
}

/** `--duration-slow` in ms and `--ease-standard`, as the browser computes them from the tokens. */
async function slow(page: Page): Promise<Timing> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.transition = 'width var(--duration-slow) var(--ease-standard)';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const timing = {
      duration: parseFloat(style.transitionDuration) * 1000,
      easing: style.transitionTimingFunction,
    };
    probe.remove();
    return timing;
  });
}

/** An element's transition on each property, by the property as its style names it. */
async function transitions(page: Page, which: 'rail' | 'pills') {
  return page.evaluate((which) => {
    const w = window as unknown as RailWindow;
    const rail = w.__findRail()!;
    const read = (el: Element) => {
      const s = getComputedStyle(el);
      const props = s.transitionProperty.split(',').map((p) => p.trim());
      const durations = s.transitionDuration.split(',').map((d) => parseFloat(d) * 1000);
      const easings = s.transitionTimingFunction.split(/,(?![^(]*\))/).map((e) => e.trim());
      return Object.fromEntries(
        props.map((p, i) => [
          p,
          {
            duration: durations[i % durations.length]!,
            easing: easings[i % easings.length]!,
          },
        ]),
      );
    };
    return which === 'rail' ? [read(rail)] : w.__findPills(rail).map(read);
  }, which);
}

/**
 * Taps a destination and waits for React to commit it: the URL, then that destination's pill
 * drawn lit, in whichever rail shows (a remount is the observers' to report). A route can commit
 * frames after the URL changes on a slow machine, and what the commit starts must happen while
 * the observers are on.
 */
async function tapDestination(page: Page, label: string, url: string) {
  await destination(page, label).click();
  await expect(page).toHaveURL(url);
  await page.waitForFunction((label) => {
    const w = window as unknown as RailWindow;
    const rail = w.__findRail();
    const pill = rail && w.__findPills(rail).find((p) => p.parentElement?.ariaLabel === label);
    return pill?.style.background.includes('color-mix') === true;
  }, label);
}

const railWidth = (page: Page) =>
  page.evaluate(() => (window as unknown as RailWindow).__rail!.getBoundingClientRect().width);

const expectSameRail = async (page: Page, after: string) =>
  expect(await sameRail(page), `the same rail and pills after ${after}`).toEqual({
    connected: true,
    same: true,
    pills: true,
  });

/** Nothing the observers saw removed the rail or a pill, regrew a pill or eased its width. */
function expectSteady(seen: Guarded, expanded: boolean, after: string) {
  expect(seen.removed, `nothing removed by ${after}`).toEqual([]);
  seen.pillSizes.forEach((sizes, i) => {
    expect(sizes.length, `pill ${i} observed during ${after}`).toBeGreaterThan(0);
    if (expanded) {
      for (const width of sizes) {
        expect(width, `a width pill ${i} was drawn at during ${after}`).toBeGreaterThan(ICON_PILL);
      }
    }
  });
  seen.pillRuns.forEach((runs, i) => {
    expect(
      runs.filter((r) => r.property === 'width'),
      `pill ${i}'s width transitions during ${after}`,
    ).toEqual([]);
  });
}

/**
 * Taps the hamburger with a `transitionrun` listener on the rail, which pauses the rail's width
 * transition the moment it starts. Then steps it through `STEPS` of its duration by hand, reading
 * the width at each, and lets it finish before reading where it settles.
 */
async function tapHamburger(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as RailWindow;
    const rail = w.__rail!;
    w.__railRun = undefined;
    const onRun = (event: TransitionEvent) => {
      if (event.target !== rail || event.propertyName !== 'width') return;
      rail.removeEventListener('transitionrun', onRun);
      const animation = rail
        .getAnimations()
        .find(
          (a): a is CSSTransition => a instanceof CSSTransition && a.transitionProperty === 'width',
        );
      if (animation === undefined) return;
      animation.pause();
      const timing = animation.effect!.getTiming();
      w.__railRun = {
        animation,
        duration: Number(timing.duration),
        easing: String(timing.easing),
      };
    };
    rail.addEventListener('transitionrun', onRun);
  });
  const before = await toggle(page).getAttribute('aria-label');
  const seen = await guarded(page, async () => {
    await toggle(page).click();
    // The new label is React's commit; a transition starts at the next style update and its
    // `transitionrun` is sent at the frame after that. Three frames on, it has been heard.
    await expect(toggle(page)).not.toHaveAttribute('aria-label', before!);
    await page.evaluate(async () => {
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    });
    const heard = await page.evaluate(
      () => (window as unknown as RailWindow).__railRun !== undefined,
    );
    expect(heard, 'the rail starts a width transition').toBe(true);
  });
  const stepped = await page.evaluate(async (steps) => {
    const w = window as unknown as RailWindow;
    const { animation, duration, easing } = w.__railRun!;
    const widths = steps.map((step) => {
      animation.currentTime = step * duration;
      return w.__rail!.getBoundingClientRect().width;
    });
    animation.finish();
    await animation.finished;
    return { duration, easing, widths, settled: w.__rail!.getBoundingClientRect().width };
  }, STEPS);
  return { seen, ...stepped };
}

/** The rail's width runs strictly one way from `from` to `to`, step by step. */
function expectMonotonic(widths: number[], from: number, to: number, after: string) {
  expect(Math.abs(widths[0]! - from), `the width at the start of ${after}`).toBeLessThan(1);
  expect(Math.abs(widths.at(-1)! - to), `the width at the end of ${after}`).toBeLessThan(1);
  const sign = Math.sign(to - from);
  for (let i = 1; i < widths.length; i++) {
    expect(sign * (widths[i]! - widths[i - 1]!), `width step ${i} of ${after}`).toBeGreaterThan(0);
  }
}

for (const size of SIZES) {
  test.describe(`the rail on ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(railScript());
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/music', { waitUntil: 'networkidle' });
      await settle(page);
      await stash(page);
    });

    test(`[M0.canvas/c] switching destinations keeps the same rail and its pills, on ${size.name}`, async ({
      page,
    }) => {
      for (const [label, url] of [
        ['Books', '/books'],
        ['Podcasts', '/podcasts'],
        ['Settings', '/settings'],
        ['Music', '/music'],
      ] as const) {
        const seen = await guarded(page, async () => {
          await tapDestination(page, label, url);
        });
        expect(seen.removed, `nothing removed by ${label}`).toEqual([]);
        await expectSameRail(page, label);
      }
      const seen = await guarded(page, async () => {
        await page.getByText('Between Lines of Light', { exact: true }).first().click();
        await expect(page).toHaveURL('/music/albums/between-lines-of-light');
        await expect(
          page.getByRole('button', { name: 'More options', exact: true }).first(),
        ).toBeVisible();
      });
      expect(seen.removed, 'nothing removed by opening an album').toEqual([]);
      await expectSameRail(page, 'opening an album');
    });

    test(`[M0.canvas/c] the rail and its pills ease over --duration-slow, on ${size.name}`, async ({
      page,
    }) => {
      const timing = await slow(page);
      expect(timing.duration).toBeGreaterThan(0);
      const [rail] = await transitions(page, 'rail');
      expect(rail!.width, 'the rail transitions its width').toEqual(timing);
      const pills = await transitions(page, 'pills');
      expect(pills.length).toBeGreaterThan(0);
      for (const pill of pills) {
        expect(pill.width, 'each pill transitions its width').toEqual(timing);
        expect(pill.background ?? pill['background-color'], 'and its colour').toEqual(timing);
      }
    });

    test(`[M0.canvas/c] switching destinations regrows no pill and fades the lit one, on ${size.name}`, async ({
      page,
    }) => {
      const { duration } = await slow(page);
      for (const [label, url] of [
        ['Books', '/books'],
        ['Podcasts', '/podcasts'],
      ] as const) {
        const lit = await page.evaluate(
          (label) =>
            (window as unknown as RailWindow).__pills!.findIndex((p) =>
              p.parentElement?.textContent?.includes(label),
            ),
          label,
        );
        const seen = await guarded(page, async () => {
          await tapDestination(page, label, url);
        });
        expectSteady(seen, size.expanded, label);
        await expectSameRail(page, label);
        expect(
          seen.pillRuns[lit]?.find((r) => r.property === 'background-color')?.duration,
          `${label}'s pill fades in over --duration-slow`,
        ).toBe(duration);
      }
    });

    test(`[M0.canvas/c] the hamburger eases the same rail between its widths, and it stays so between destinations, on ${size.name}`, async ({
      page,
    }) => {
      const timing = await slow(page);
      const start = await railWidth(page);

      const toOther = await tapHamburger(page);
      expect(toOther.seen.removed, 'nothing removed by the hamburger').toEqual([]);
      await expectSameRail(page, 'the hamburger');
      expect(
        { duration: toOther.duration, easing: toOther.easing },
        'the rail eases its width',
      ).toEqual(timing);
      const other = toOther.settled;
      expect(Math.abs(other - start)).toBeGreaterThan(1);
      expectMonotonic(toOther.widths, start, other, 'the hamburger');

      const across = await guarded(page, async () => {
        await tapDestination(page, 'Books', '/books');
      });
      expect(across.removed, 'nothing removed by Books, toggled').toEqual([]);
      await expectSameRail(page, 'Books, toggled');
      expect(
        across.railRuns.filter((r) => r.property === 'width'),
        'the rail keeps its width on Books',
      ).toEqual([]);
      expect(Math.abs((await railWidth(page)) - other)).toBeLessThan(1);

      const back = await tapHamburger(page);
      expect(back.seen.removed, 'nothing removed by the hamburger again').toEqual([]);
      await expectSameRail(page, 'the hamburger again');
      expect(
        { duration: back.duration, easing: back.easing },
        'the rail eases its width back',
      ).toEqual(timing);
      expectMonotonic(back.widths, other, start, 'the hamburger again');
      expect(Math.abs(back.settled - start)).toBeLessThan(1);
    });
  });
}

type FontWindow = RailWindow & { __widthTransitions?: string[]; __stop?: () => void };

test.describe('the labelled rail as its web font arrives', () => {
  test('[M0.canvas/c] each pill hugs its label once Inter loads late, and snaps to it rather than easing', async ({
    page,
  }) => {
    await page.addInitScript(railScript());
    await page.setViewportSize({ width: 1440, height: 900 });
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/inter-latin(-ext)?-[^/]*\.woff2$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/music', { waitUntil: 'domcontentloaded' });
    await expect(toggle(page)).toBeVisible();
    await settle(page);
    expect(
      await page.evaluate(() => document.fonts.check('600 14px Inter')),
      'Inter held back',
    ).toBe(false);

    // Every width transition any pill starts from here until the font has landed.
    await page.evaluate(() => {
      const w = window as unknown as FontWindow;
      const seen = (w.__widthTransitions = [] as string[]);
      const onRun = (event: TransitionEvent) => {
        const target = event.target as HTMLElement;
        const rail = w.__findRail();
        if (event.propertyName !== 'width' || rail === null) return;
        if (w.__findPills(rail).includes(target))
          seen.push(target.parentElement?.textContent ?? '');
      };
      document.addEventListener('transitionrun', onRun, true);
      w.__stop = () => document.removeEventListener('transitionrun', onRun, true);
    });
    release();
    await page.waitForFunction(() => document.fonts.check('600 14px Inter'));
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const swaps = await page.evaluate(() => {
      const w = window as unknown as FontWindow;
      w.__stop!();
      return w.__widthTransitions!;
    });

    const pills = await page.evaluate(() => {
      const w = window as unknown as RailWindow;
      return w.__findPills(w.__findRail()!).map((pill) => {
        const label = pill.parentElement!.children[3] as HTMLElement;
        return {
          label: label.textContent,
          pill: pill.getBoundingClientRect().width,
          hugs: 56 + Math.ceil(label.scrollWidth) + 20,
        };
      });
    });
    expect(pills.length).toBeGreaterThan(0);
    for (const p of pills) {
      expect(
        Math.abs(p.pill - p.hugs),
        `${p.label}'s pill against its label in Inter`,
      ).toBeLessThan(0.5);
    }
    expect(swaps, 'no pill eases its width as the font lands').toEqual([]);
  });
});

/** The lit pill, its width, its row's open label (the row's fourth child) and that label's fade. */
async function litPill(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as RailWindow & { __label?: Element };
    const pill = w
      .__findPills(w.__findRail()!)
      .find((p) => p.style.background.includes('color-mix'));
    if (pill === undefined) throw new Error('no lit pill');
    const label = pill.parentElement!.children[3] as HTMLElement | undefined;
    const style = label && getComputedStyle(label);
    const fade = style
      ? style.transitionProperty.split(',').some((p) => p.trim() === 'opacity') &&
        style.transitionDuration.split(',').some((d) => parseFloat(d) > 0)
      : false;
    const same = w.__label === undefined || w.__label === label;
    w.__label = label;
    return {
      width: pill.getBoundingClientRect().width,
      hugs: label ? 56 + Math.ceil(label.scrollWidth) + 20 : 0,
      label: label?.textContent ?? null,
      opacity: style ? Number(style.opacity) : null,
      fade,
      same,
    };
  });
}

test.describe('the rail label across the hamburger', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(railScript());
  });

  test('[M0.sonoraclean/e] after collapsing and expanding, the lit pill fits its label as on first load, and the label fades out and back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/music', { waitUntil: 'networkidle' });
    await settle(page);
    const first = await litPill(page);
    expect(first.width).toBeGreaterThan(ICON_PILL);
    expect(Math.abs(first.width - first.hugs)).toBeLessThan(0.5);
    expect(first).toMatchObject({ opacity: 1, fade: true });

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Expand rail');
    await settle(page);
    const collapsed = await litPill(page);
    expect(collapsed, 'the same label, faded out, not removed').toMatchObject({
      label: first.label,
      opacity: 0,
      fade: true,
      same: true,
    });

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Collapse rail');
    await settle(page);
    const expanded = await litPill(page);
    expect(expanded, 'the same label, faded back in').toMatchObject({
      label: first.label,
      opacity: 1,
      fade: true,
      same: true,
    });
    expect(Math.abs(expanded.width - first.width), 'the lit pill as on first load').toBeLessThan(
      0.5,
    );
  });

  test('[M0.sonoraclean/e] expanding a rail that started collapsed fits the lit pill to its label', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/music', { waitUntil: 'networkidle' });
    await settle(page);
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Expand rail');
    const start = await litPill(page);
    expect(start, 'the label is there, faded out').toMatchObject({ opacity: 0, fade: true });

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Collapse rail');
    await settle(page);
    const expanded = await litPill(page);
    expect(expanded).toMatchObject({ label: start.label, opacity: 1, same: true });
    expect(expanded.width).toBeGreaterThan(ICON_PILL);
    expect(Math.abs(expanded.width - expanded.hugs), 'the lit pill hugs its label').toBeLessThan(
      0.5,
    );
  });
});
