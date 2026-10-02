import { expect, test, type Page } from '@playwright/test';
import { pathOf, webPages } from './nav-pages';

/**
 * Focus rings on the app's real pages, reached from the keyboard: every control Tab stops on can
 * be seen, and its ring (3px wide, 2px out) is not cut off by a scroller or a clipping box around
 * it. The states fixture checks each control alone; this checks them where the pages put them.
 */

/** Every page the web draws, from nav.json. */
const PAGES = webPages.map((p) => ({ name: p.id, path: pathOf(p.route) }));

const WIDTHS = [390, 1440];

/** How far a ring reaches outside its shape: 2px offset plus 3px width. */
const REACH = 5;

/** Tab stops walked per page: enough to pass the shell and well into the content. */
const STOPS = 50;

interface Stop {
  desc: string;
  /** Why it cannot be seen, if it cannot. */
  hidden?: string;
  /** Each ancestor that cuts the ring off, and on which sides. */
  clipped: string[];
}

/** Waits until nothing on the page is still scrolling: smooth scrolls run over several frames. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const positions = () =>
          [...document.querySelectorAll('*')]
            .filter((el) => el.scrollLeft !== 0 || el.scrollTop !== 0)
            .map((el) => `${el.scrollLeft},${el.scrollTop}`)
            .join('|') + `|${scrollX},${scrollY}`;
        let last = positions();
        let still = 0;
        const tick = () => {
          const now = positions();
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 6) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** The focused control: whether it can be seen, and what clips its ring. */
const inspect = (page: Page, reach: number) =>
  page.evaluate((reach): Stop | null => {
    const el = document.activeElement as HTMLElement | null;
    if (el === null || el === document.body) return null;
    const label =
      el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    const desc = `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} "${label.slice(0, 40)}"`;
    const host = el.closest('.sn-int');
    const layer =
      host === null
        ? null
        : ([...host.querySelectorAll('[data-sn-state-layer]')].find(
            (l) => l.parentElement?.closest('.sn-int') === host,
          ) ?? null);
    const ringed = (layer ?? el) as HTMLElement;
    const r = ringed.getBoundingClientRect();
    let opacity = 1;
    for (let a: Element | null = el; a !== null; a = a.parentElement)
      opacity *= Number(getComputedStyle(a).opacity);
    const own = el.getBoundingClientRect();
    const hidden =
      own.width < 1 || own.height < 1
        ? `it is ${own.width.toFixed(1)}x${own.height.toFixed(1)}px`
        : opacity < 0.05
          ? `it is drawn at opacity ${opacity.toFixed(2)}`
          : getComputedStyle(el).visibility === 'hidden'
            ? 'it is visibility:hidden'
            : undefined;
    // A focusable box that is no Sonora control, such as a scroller Chrome lets Tab reach when
    // nothing inside it takes focus, draws the browser's own outline, not a Sonora ring.
    if (host === null && !el.matches('button, input, select, textarea, a[href], [role]'))
      return { desc, ...(hidden === undefined ? {} : { hidden }), clipped: [] };
    const need = { l: r.left - reach, t: r.top - reach, r: r.right + reach, b: r.bottom + reach };
    const clipped: string[] = [];
    for (let a = ringed.parentElement; a !== null; a = a.parentElement) {
      if (a === document.documentElement || a === document.body) continue;
      const s = getComputedStyle(a);
      const cx = s.overflowX !== 'visible';
      const cy = s.overflowY !== 'visible';
      if (!cx && !cy) continue;
      const c = a.getBoundingClientRect();
      const left = c.left + parseFloat(s.borderLeftWidth);
      const top = c.top + parseFloat(s.borderTopWidth);
      const box = { l: left, t: top, r: left + a.clientWidth, b: top + a.clientHeight };
      const cut = [
        cx && need.l < box.l - 0.5 ? `left ${(box.l - need.l).toFixed(1)}px` : '',
        cx && need.r > box.r + 0.5 ? `right ${(need.r - box.r).toFixed(1)}px` : '',
        cy && need.t < box.t - 0.5 ? `top ${(box.t - need.t).toFixed(1)}px` : '',
        cy && need.b > box.b + 0.5 ? `bottom ${(need.b - box.b).toFixed(1)}px` : '',
      ].filter(Boolean);
      if (cut.length > 0) {
        const name = (a.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
        clipped.push(
          `${a.tagName.toLowerCase()} "${name}" (overflow ${s.overflowX}/${s.overflowY}) cuts ${cut.join(', ')}`,
        );
      }
    }
    return { desc, ...(hidden === undefined ? {} : { hidden }), clipped };
  }, reach);

for (const width of WIDTHS) {
  for (const { name, path } of PAGES) {
    test(`[M0.states/a] on ${name} at ${width}px, every control Tab reaches shows its whole focus ring`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      // Where the layout holds the player beside the page, a player sheet's route gives way to the
      // page under it, the sheet showing in the panel: the walk stays on that page.
      const at = new URL(page.url()).pathname;

      const faults: string[] = [];
      const seen = new Set<string>();
      let visited = 0;
      for (let i = 0; i < STOPS; i++) {
        await page.keyboard.press('Tab');
        await settle(page);
        // A Tab that opened another page ends the walk: this one is done.
        if (new URL(page.url()).pathname !== at) break;
        const stop = await inspect(page, REACH);
        if (stop === null) continue;
        const key = `${stop.desc}@${await page.evaluate(() => {
          const r = document.activeElement!.getBoundingClientRect();
          return `${Math.round(r.x + scrollX)},${Math.round(r.y + scrollY)}`;
        })}`;
        if (seen.has(key)) break;
        seen.add(key);
        visited++;
        if (stop.hidden !== undefined) faults.push(`${stop.desc} takes focus but ${stop.hidden}`);
        for (const c of stop.clipped) faults.push(`${stop.desc}'s ring: ${c}`);
      }
      expect(visited, `Tab reaches controls on ${name}`).toBeGreaterThan(0);
      expect(faults).toEqual([]);
    });
  }
}
