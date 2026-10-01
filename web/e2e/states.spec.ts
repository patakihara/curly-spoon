import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  NOT_ACTIONS,
  pressKey,
  STATE_ENTRIES,
  type StateEntry,
  type Variant,
} from '../src/states-list';
import { decode, distance } from './pixels';

/**
 * Material's states on Sonora's controls, in the states fixture (`/states.html`): enabled,
 * disabled, hovered, focused and pressed all look different; focus draws a ring outside the
 * shape; a press ripples from the pointer and never changes the shape; and a control with no
 * action, or with `disabled` set, is disabled and ignores presses.
 */

/** Every level of Sonora: each control at each level draws Material's states. */
const LEVELS = ['basic', 'components', 'layouts'];

const sonora = fileURLToPath(new URL('../../design/sonora/components', import.meta.url));

interface Drawing {
  cell: Locator;
  host: Locator;
  control: Locator;
  layer: Locator;
}

/** The fixture with one entry drawn, so every box measured stays where the screenshot looks. */
async function open(page: Page, entry: StateEntry) {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`/states.html?only=${entry.name}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * One drawing of an entry: its state host (the `.sn-int` under test), the control inside it that
 * takes focus and presses, and the state layer the host draws.
 */
async function drawing(page: Page, entry: StateEntry, variant: Variant): Promise<Drawing> {
  const cell = page.locator(`[data-states="${entry.name}"][data-variant="${variant}"]`);
  await cell.evaluate((el, target) => {
    for (const a of ['data-probe-host', 'data-probe-control', 'data-probe-layer'])
      for (const m of document.querySelectorAll(`[${a}]`)) m.removeAttribute(a);
    const host = el.querySelector(target);
    if (host === null) return;
    host.setAttribute('data-probe-host', '');
    const control = host.matches('button, input, [role]')
      ? host
      : host.querySelector('input, button, [role]');
    control?.setAttribute('data-probe-control', '');
    const layer = [...host.querySelectorAll('[data-sn-state-layer]')].find(
      (l) => l.parentElement?.closest('.sn-int') === host,
    );
    layer?.setAttribute('data-probe-layer', '');
  }, entry.target ?? '.sn-int');
  const host = page.locator('[data-probe-host]');
  expect(await host.count(), `${entry.name} (${variant}) draws a state host`).toBe(1);
  const layer = page.locator('[data-probe-layer]');
  expect(await layer.count(), `${entry.name} (${variant}) draws its state layer`).toBe(1);
  return { cell, host, control: page.locator('[data-probe-control]'), layer };
}

/** The state layer's wash: the opacity of its flat overlay. */
const level = (layer: Locator) =>
  layer.evaluate((el) => Number(getComputedStyle(el, '::before').opacity));

const ripples = (layer: Locator) => layer.locator('[data-sn-ripple]').count();

/**
 * Focus from the keyboard: Tab from the off-screen stop just before the drawing, on through the
 * drawing's own stops until one lies in `host`. Whether Tab reached it before leaving the drawing.
 */
async function tabInto(page: Page, cell: Locator, host: Locator) {
  await page.mouse.move(0, 0);
  await cell.locator('xpath=preceding-sibling::button[@data-sentinel][1]').focus();
  for (let stop = 0; stop < 16; stop++) {
    await page.keyboard.press('Tab');
    if (await host.evaluate((el) => el.contains(document.activeElement))) return true;
    if (!(await cell.evaluate((el) => el.contains(document.activeElement)))) return false;
  }
  return false;
}

type Box = { x: number; y: number; width: number; height: number };

const PAD = 8;

/** A screenshot of `box` and the PAD pixels around it, with its clip's origin. */
async function shot(page: Page, box: Box) {
  const x = Math.floor(box.x) - PAD;
  const y = Math.floor(box.y) - PAD;
  const width = Math.ceil(box.x + box.width) + PAD - x;
  const height = Math.ceil(box.y + box.height) + PAD - y;
  const png = await page.screenshot({ clip: { x, y, width, height }, animations: 'disabled' });
  return { png, x, y };
}

const hash = (png: Buffer) => createHash('sha1').update(png).digest('hex');

const presses = (page: Page, key: string) =>
  page.evaluate((k) => window.__presses[k] ?? 0, key) as Promise<number>;

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  expect(b, 'the element is on screen').not.toBeNull();
  return b!;
};

test('[M0.states/a] every interactive Sonora component shows enabled, disabled, hovered, focused and pressed, all different', async ({
  page,
}) => {
  test.setTimeout(STATE_ENTRIES.length * 15_000);
  for (const entry of STATE_ENTRIES) {
    await open(page, entry);
    const { cell, host, layer } = await drawing(page, entry, 'action');
    const at = await box(host);

    await page.mouse.move(0, 0);
    expect(await level(layer), `${entry.name} at rest`).toBe(0);
    const enabled = hash((await shot(page, at)).png);

    await host.hover();
    await expect.poll(() => level(layer), `${entry.name} hovered`).toBeCloseTo(0.08, 3);
    const hovered = hash((await shot(page, at)).png);

    expect(await tabInto(page, cell, host), `${entry.name} takes focus from Tab`).toBe(true);
    await expect.poll(() => level(layer), `${entry.name} focused`).toBeCloseTo(0.1, 3);
    const focused = hash((await shot(page, at)).png);
    await cell.locator('xpath=preceding-sibling::button[@data-sentinel][1]').focus();

    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await expect.poll(() => level(layer), `${entry.name} pressed`).toBeCloseTo(0.1, 3);
    await page.waitForTimeout(400);
    const pressed = hash((await shot(page, at)).png);
    await page.mouse.up();

    // A component that leaves its control out without an action has no disabled look to compare.
    const states: Record<string, string> = { enabled, hovered, focused };
    if (!entry.omits || entry.disabled) {
      const off = await drawing(page, entry, entry.disabled ? 'disabled' : 'none');
      await page.mouse.move(0, 0);
      states.disabled = hash((await shot(page, await box(off.host))).png);
    }
    // Text fields and sliders have no pressed state of their own: a press there is a focus.
    if (entry.ripple) states.pressed = pressed;
    const same = Object.entries(states).filter(([, h], i, all) =>
      all.some(([, other], j) => j !== i && other === h),
    );
    expect(
      same.map(([s]) => s),
      `${entry.name}: every state looks different`,
    ).toEqual([]);
  }
});

test('[M0.states/a] focus draws an outer ring', async ({ page }) => {
  test.setTimeout(STATE_ENTRIES.length * 8_000);
  for (const entry of STATE_ENTRIES) {
    await open(page, entry);
    const { cell, host, layer } = await drawing(page, entry, 'action');
    await page.mouse.move(0, 0);
    const at = await box(layer);
    const rest = await shot(page, at);

    expect(await tabInto(page, cell, host), `${entry.name} takes focus from Tab`).toBe(true);
    const outline = await layer.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset };
    });
    expect(outline, `${entry.name}'s ring`).toEqual({
      style: 'solid',
      width: '3px',
      offset: '2px',
    });

    // The ring reached the screen on all four sides, 2 to 5px outside the shape: nothing clips it.
    const ringed = await shot(page, at);
    const [before, after] = [await decode(page, rest.png), await decode(page, ringed.png)];
    const left = at.x - rest.x;
    const top = at.y - rest.y;
    const right = left + at.width;
    const bottom = top + at.height;
    const midX = Math.round((left + right) / 2);
    const midY = Math.round((top + bottom) / 2);
    const sides = {
      left: [3, 4].map((o) => [midY, Math.floor(left) - o] as const),
      right: [3, 4].map((o) => [midY, Math.ceil(right) + o - 1] as const),
      top: [3, 4].map((o) => [Math.floor(top) - o, midX] as const),
      bottom: [3, 4].map((o) => [Math.ceil(bottom) + o - 1, midX] as const),
    };
    const unringed = Object.entries(sides)
      .filter(
        ([, points]) =>
          Math.max(...points.map(([r, c]) => distance(before[r]![c]!, after[r]![c]!))) < 40,
      )
      .map(([side]) => side);
    expect(unringed, `${entry.name}'s ring shows on every side`).toEqual([]);
  }
});

test('[M0.states/a] a press ripples from the pointer without changing shape', async ({ page }) => {
  test.setTimeout(STATE_ENTRIES.length * 8_000);
  for (const entry of STATE_ENTRIES.filter((e) => e.ripple)) {
    await open(page, entry);
    const { host, layer } = await drawing(page, entry, 'action');
    const at = await box(host);
    const px = at.x + at.width * 0.25;
    const py = at.y + at.height * 0.7;
    await page.mouse.move(px, py);
    await page.waitForTimeout(300);

    const measure = () =>
      page.evaluate(() => {
        const host = document.querySelector('[data-probe-host]')!;
        const layer = document.querySelector('[data-probe-layer]')!;
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          host: rect(host),
          hostRadius: getComputedStyle(host).borderRadius,
          shape: rect(layer.parentElement!),
          shapeRadius: getComputedStyle(layer.parentElement!).borderRadius,
        };
      });
    const rest = await measure();

    const recording = page.evaluate(
      () =>
        new Promise<
          {
            host: { x: number; y: number; width: number; height: number };
            hostRadius: string;
            shape: { x: number; y: number; width: number; height: number };
            shapeRadius: string;
            ripple: { x: number; y: number; width: number; height: number } | null;
          }[]
        >((resolve) => {
          const host = document.querySelector('[data-probe-host]')!;
          const layer = document.querySelector('[data-probe-layer]')!;
          const rect = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          };
          const frames: Parameters<typeof resolve>[0] = [];
          let start: number | undefined;
          const frame = (now: number) => {
            const ripple = layer.querySelector('[data-sn-ripple]:last-of-type');
            if (start === undefined && ripple !== null) start = now;
            frames.push({
              host: rect(host),
              hostRadius: getComputedStyle(host).borderRadius,
              shape: rect(layer.parentElement!),
              shapeRadius: getComputedStyle(layer.parentElement!).borderRadius,
              ripple: ripple === null ? null : rect(ripple),
            });
            if (start !== undefined && now - start > 300) resolve(frames);
            else if (frames.length > 600) resolve(frames);
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        }),
    );
    await page.mouse.down();
    const frames = await recording;

    for (const f of frames) {
      expect(
        { host: f.host, hostRadius: f.hostRadius, shape: f.shape, shapeRadius: f.shapeRadius },
        `${entry.name} keeps its shape while pressed`,
      ).toEqual(rest);
    }
    const waves = frames.flatMap((f) => (f.ripple === null ? [] : [f.ripple]));
    expect(waves.length, `${entry.name} ripples`).toBeGreaterThan(3);
    for (const w of waves) {
      expect(Math.abs(w.x + w.width / 2 - px), `${entry.name}'s ripple centres on x`).toBeLessThan(
        2,
      );
      expect(Math.abs(w.y + w.height / 2 - py), `${entry.name}'s ripple centres on y`).toBeLessThan(
        2,
      );
    }
    expect(waves.at(-1)!.width, `${entry.name}'s ripple grows`).toBeGreaterThan(waves[0]!.width);

    await page.mouse.up();
    await expect.poll(() => ripples(layer), `${entry.name}'s ripple fades on release`).toBe(0);
  }
});

test('[M0.states/c] a control with no action, or with disabled set, is disabled and ignores presses', async ({
  page,
}) => {
  test.setTimeout(STATE_ENTRIES.length * 15_000);
  for (const entry of STATE_ENTRIES) {
    if (entry.omits) {
      await open(page, entry);
      const none = page.locator(`[data-states="${entry.name}"][data-variant="none"]`);
      await expect(
        none.locator(entry.target ?? '.sn-int'),
        `${entry.name} with no action leaves its control out`,
      ).toHaveCount(0);
    }
    const variants: Variant[] = [
      ...(entry.omits ? [] : (['none'] as const)),
      ...(entry.disabled ? (['disabled'] as const) : []),
    ];
    for (const variant of variants) {
      const what = `${entry.name} (${variant})`;
      await open(page, entry);
      const { cell, host, control, layer } = await drawing(page, entry, variant);
      await expect(control, `${what} is disabled`).toBeDisabled();

      expect(await tabInto(page, cell, host), `${what} is skipped by Tab`).toBe(false);

      await control.click({ force: true });
      await page.keyboard.type('a');
      expect(await presses(page, pressKey(entry.name, variant)), `${what} ignores a press`).toBe(0);

      await host.hover({ force: true });
      await page.waitForTimeout(100);
      expect(await level(layer), `${what} shows no hover`).toBe(0);
      const at = await box(host);
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(100);
      expect(await ripples(layer), `${what} does not ripple`).toBe(0);
      await page.mouse.up();

      const alpha = await host.evaluate((el) => {
        const c = getComputedStyle(el).color;
        const m = /\/\s*([\d.]+)\s*\)$/.exec(c) ?? /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(c);
        return m === null ? 1 : Number(m[1]);
      });
      expect(alpha, `${what}'s content is at 38%`).toBeCloseTo(0.38, 2);
    }

    await open(page, entry);
    const { control } = await drawing(page, entry, 'action');
    await control.click();
    await page.keyboard.type('a');
    expect(
      await presses(page, pressKey(entry.name, 'action')),
      `${entry.name} with its action takes a press`,
    ).toBe(1);
  }
});

test('[M0.states/c] every component with an action, and every disabled prop, is in the states fixture', () => {
  const declared = readdirSync(sonora, { withFileTypes: true })
    .filter((e) => e.isDirectory() && LEVELS.includes(e.name))
    .flatMap((e) =>
      readdirSync(join(sonora, e.name))
        .filter((f) => f.endsWith('.d.ts'))
        .map((f) => ({
          name: f.slice(0, -'.d.ts'.length),
          source: readFileSync(join(sonora, e.name, f), 'utf8'),
        })),
    );
  const actions = declared
    .filter(({ name, source }) =>
      [...source.matchAll(/^\s*(on[A-Z]\w*)\??:/gm)].some(
        ([, prop]) => !NOT_ACTIONS.some((n) => n.component === name && n.prop === prop),
      ),
    )
    .map(({ name }) => name)
    .sort();
  expect(STATE_ENTRIES.map((e) => e.name).sort()).toEqual(actions);
  const disabled = declared
    // StateLayer takes `disabled` from its control and has no action of its own.
    .filter(({ name, source }) => actions.includes(name) && /^\s*disabled\??:/m.test(source))
    .map(({ name }) => name)
    .sort();
  expect(
    STATE_ENTRIES.filter((e) => e.disabled)
      .map((e) => e.name)
      .sort(),
  ).toEqual(disabled);
});

test('[M0.states/a] a disabled button group still shows which segment is selected', async ({
  page,
}) => {
  const entry = STATE_ENTRIES.find((e) => e.name === 'ButtonGroup')!;
  await open(page, entry);
  const group = page.locator('[data-states="ButtonGroup"][data-variant="none"]');
  const selected = group.locator('[aria-pressed="true"]');
  const other = group.locator('[aria-pressed="false"]').first();
  await expect(selected).toHaveAttribute('aria-disabled', 'true');
  await page.mouse.move(0, 0);

  // Material: a disabled selected segment keeps an on-surface container at 12%; the others have none.
  const alpha = (l: Locator) =>
    l.evaluate((el) => {
      const c = getComputedStyle(el).backgroundColor;
      const m = /\/\s*([\d.]+)\s*\)$/.exec(c) ?? /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(c);
      return m === null ? (c === 'transparent' ? 0 : 1) : Number(m[1]);
    });
  expect(await alpha(selected), 'the selected segment keeps a 12% container').toBeCloseTo(0.12, 2);
  expect(await alpha(other), 'an unselected segment has no container').toBe(0);

  // And it reaches the screen: the two segments' fills, beside their labels, differ.
  const fill = async (l: Locator) => {
    const b = await box(l);
    const rows = await decode(
      page,
      await page.screenshot({
        clip: { x: b.x + 4, y: b.y + b.height / 2 - 1, width: 2, height: 2 },
        animations: 'disabled',
      }),
    );
    return rows[0]![0]!;
  };
  expect(
    distance(await fill(selected), await fill(other)),
    'the selected segment stands out from the rest',
  ).toBeGreaterThan(20);
});
