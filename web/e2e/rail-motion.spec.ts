import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The rail moves as Sonora Prime's does, 11-front.md's "The shell stays mounted between pages":
 * one rail for the whole app, never remounted, so switching destinations or toggling the
 * hamburger changes the same rail in place. Its width and its pills ease over `--duration-slow`,
 * the lit pill fades from one row to the next, and no pill regrows from icon width.
 */
const SIZES = [
  { name: 'the labelled rail', width: 1440, height: 900, expanded: true },
  { name: 'the icon rail', width: 800, height: 900, expanded: false },
];

/** An expanded pill is its icon's 56px, its label and 20px: 76px is a pill with no label yet. */
const ICON_PILL = 76;

/** How long the sampler watches after a tap: `--duration-slow` and a margin. */
const WATCH_MS = 600;

/** A destination on the rail: the row drawing its icon and its label. */
const destination = (page: Page, label: string): Locator =>
  page
    .locator(
      `xpath=//div[span[text()="${label}"] and span/span[contains(@style, "Material Symbols")]]`,
    )
    .first();

const toggle = (page: Page) => page.getByRole('button', { name: /^(Collapse|Expand) rail$/ });

interface Timing {
  duration: number;
  easing: string;
}

interface Sample {
  rail: number;
  pills: number[];
}

interface Watched {
  samples: Sample[];
  /** Each pill's CSS transitions seen while watching, by pill index: property and duration. */
  transitions: { property: string; duration: number }[][];
  settled: Sample;
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
  __watch?: Promise<Watched>;
};

/** Waits until nothing on the page is animating, the first load's pills included. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
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
 * Starts watching the rail, the one showing at each frame, for `WATCH_MS`: its width and every
 * pill's, and each pill's CSS transitions as they start.
 */
async function watch(page: Page) {
  await page.evaluate((ms) => {
    const w = window as unknown as RailWindow;
    w.__watch = new Promise<Watched>((resolve) => {
      const samples: Sample[] = [];
      const transitions: { property: string; duration: number }[][] = [];
      const measure = (): Sample => {
        const rail = w.__findRail();
        if (rail === null) return { rail: 0, pills: [] };
        const pills = w.__findPills(rail);
        pills.forEach((pill, i) => {
          const seen = (transitions[i] ??= []);
          for (const a of pill.getAnimations()) {
            if (!(a instanceof CSSTransition)) continue;
            const duration = Number(a.effect?.getTiming().duration ?? 0);
            if (!seen.some((t) => t.property === a.transitionProperty)) {
              seen.push({ property: a.transitionProperty, duration });
            }
          }
        });
        return {
          rail: rail.getBoundingClientRect().width,
          pills: pills.map((p) => p.getBoundingClientRect().width),
        };
      };
      const start = performance.now();
      const frame = () => {
        samples.push(measure());
        if (performance.now() - start < ms) requestAnimationFrame(frame);
        else resolve({ samples, transitions, settled: measure() });
      };
      requestAnimationFrame(frame);
    });
  }, WATCH_MS);
}

async function watched(page: Page): Promise<Watched> {
  return page.evaluate(() => (window as unknown as RailWindow).__watch!);
}

/** The rail's own CSS transition on `width`, if one is running now. */
async function railWidthTransition(page: Page) {
  return page.evaluate(() => {
    const rail = (window as unknown as RailWindow).__findRail();
    const t = rail
      ?.getAnimations()
      .find((a) => a instanceof CSSTransition && a.transitionProperty === 'width');
    return t === undefined ? undefined : Number(t.effect?.getTiming().duration ?? 0);
  });
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

/** Taps `target`, watching the rail from just before the tap. */
async function tap(page: Page, target: Locator) {
  await watch(page);
  await target.click();
  return watched(page);
}

const expectSameRail = async (page: Page, after: string) =>
  expect(await sameRail(page), `the same rail and pills after ${after}`).toEqual({
    connected: true,
    same: true,
    pills: true,
  });

/** No sample strays more than 1px from where the rail and its pills settle. */
function expectSteady(seen: Watched, expanded: boolean, after: string) {
  for (const sample of seen.samples) {
    expect(Math.abs(sample.rail - seen.settled.rail), `rail width after ${after}`).toBeLessThan(1);
    expect(sample.pills.length, `pills after ${after}`).toBe(seen.settled.pills.length);
    sample.pills.forEach((width, i) => {
      expect(Math.abs(width - seen.settled.pills[i]!), `pill ${i} after ${after}`).toBeLessThan(1);
      if (expanded) expect(width, `pill ${i} after ${after}`).toBeGreaterThan(ICON_PILL);
    });
  }
  seen.transitions.forEach((ts, i) => {
    expect(
      ts.filter((t) => t.property === 'width'),
      `pill ${i}'s width transitions after ${after}`,
    ).toEqual([]);
  });
}

/** The rail's width runs one way only, from `from` to `to`, never overshooting either. */
function expectMonotonic(seen: Watched, from: number, to: number, after: string) {
  const widths = seen.samples.map((s) => s.rail);
  expect(Math.abs(widths[0]! - from), `the first width after ${after}`).toBeLessThan(1);
  expect(Math.abs(seen.settled.rail - to), `the settled width after ${after}`).toBeLessThan(1);
  const sign = Math.sign(to - from);
  for (let i = 1; i < widths.length; i++) {
    expect(sign * (widths[i]! - widths[i - 1]!), `width step ${i} after ${after}`).toBeGreaterThan(
      -0.5,
    );
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
        await destination(page, label).click();
        await expect(page).toHaveURL(url);
        await expectSameRail(page, label);
      }
      await page.getByText('Between Lines of Light', { exact: true }).first().click();
      await expect(page).toHaveURL('/music/albums/between-lines-of-light');
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
            (window as unknown as RailWindow)
              .__findPills((window as unknown as RailWindow).__findRail()!)
              .findIndex((p) => p.parentElement?.textContent?.includes(label)),
          label,
        );
        const seen = await tap(page, destination(page, label));
        await expect(page).toHaveURL(url);
        expectSteady(seen, size.expanded, label);
        expect(
          seen.transitions[lit]?.find((t) => t.property === 'background-color')?.duration,
          `${label}'s pill fades in over --duration-slow`,
        ).toBe(duration);
      }
    });

    test(`[M0.canvas/c] the hamburger eases the same rail between its widths, and it stays so between destinations, on ${size.name}`, async ({
      page,
    }) => {
      const { duration } = await slow(page);
      const start = await page.evaluate(
        () => (window as unknown as RailWindow).__findRail()!.getBoundingClientRect().width,
      );

      await watch(page);
      await toggle(page).click();
      expect(await railWidthTransition(page), 'the rail eases its width').toBe(duration);
      const toOther = await watched(page);
      await expectSameRail(page, 'the hamburger');
      const other = toOther.settled.rail;
      expect(Math.abs(other - start)).toBeGreaterThan(1);
      expectMonotonic(toOther, start, other, 'the hamburger');

      const across = await tap(page, destination(page, 'Books'));
      await expect(page).toHaveURL('/books');
      await expectSameRail(page, 'Books, toggled');
      for (const s of across.samples) expect(Math.abs(s.rail - other)).toBeLessThan(1);

      await watch(page);
      await toggle(page).click();
      expect(await railWidthTransition(page), 'the rail eases its width back').toBe(duration);
      const back = await watched(page);
      await expectSameRail(page, 'the hamburger again');
      expectMonotonic(back, other, start, 'the hamburger again');
    });
  });
}
