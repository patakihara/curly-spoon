import { readdirSync, readFileSync } from 'node:fs';
import { createElement, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutId } from './generated/nav/platform';

const dir = new URL('./generated/pages/', import.meta.url);
/** Every layout of the navigation map, named as the generated pages name them. */
const LAYOUTS = (
  JSON.parse(readFileSync(new URL('../../design/app/nav.json', import.meta.url), 'utf8')) as {
    layouts: { minWidth: number }[];
  }
).layouts.map((l) => `w${l.minWidth}` as LayoutId);
const pages = readdirSync(dir).filter((file) => file.endsWith('.tsx'));

describe('every drawn canvas page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('has at least one page to render', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const file of pages) {
    for (const layout of LAYOUTS) {
      it(`${file} renders with its placeholder in the ${layout} layout with no console error or warning`, async () => {
        const said: unknown[][] = [];
        vi.spyOn(console, 'error').mockImplementation((...args) => void said.push(args));
        vi.spyOn(console, 'warn').mockImplementation((...args) => void said.push(args));
        const page = (
          (await import(new URL(file, dir).href)) as {
            default: ComponentType<{ layout?: LayoutId }>;
          }
        ).default;
        // A page opens others through the router, as it does in the app.
        const html = renderToString(
          createElement(MemoryRouter, null, createElement(page, { layout })),
        );
        expect(html.length).toBeGreaterThan(0);
        expect(said).toEqual([]);
      });
    }
  }
});

describe('the shell around each drawn page', () => {
  const nav = JSON.parse(
    readFileSync(new URL('../../design/app/nav.json', import.meta.url), 'utf8'),
  ) as {
    destinations: { id: string }[];
    pages: { id: string; title: string; presentation: 'screen' | 'sheet' }[];
  };
  const destinations = new Set(nav.destinations.map((d) => d.id));
  const sheets = new Set(nav.pages.filter((p) => p.presentation === 'sheet').map((p) => p.id));
  const idOf = (file: string) => file.replace('.tsx', '').replace(/^./, (c) => c.toLowerCase());
  const render = async (file: string, layout: LayoutId) => {
    const page = (
      (await import(new URL(file, dir).href)) as {
        default: ComponentType<{ layout?: LayoutId }>;
      }
    ).default;
    return renderToString(createElement(MemoryRouter, null, createElement(page, { layout })));
  };
  /** The frame's own surface: the back layer's colour, or the page's under a top app bar. */
  const frame = (html: string) => /<div style="[^"]*background:var\((--[\w-]+)\)/.exec(html)?.[1];

  for (const file of pages.filter((f) => !sheets.has(idOf(f)))) {
    const id = idOf(file);
    it(`[M0.canvas] ${id} on the phone ${destinations.has(id) ? 'sits in the backdrop' : 'shows a top app bar, never a back layer'}`, async () => {
      expect(nav.pages.map((p) => p.id)).toContain(id);
      expect(frame(await render(file, 'w0'))).toBe(
        destinations.has(id) ? '--surface-bg-alt' : '--surface-bg',
      );
    });

    it(`[M0.canvas] ${id} on desktop sits in the backdrop, with the rail's hamburger`, async () => {
      expect(frame(await render(file, 'w1024'))).toBe('--surface-bg-alt');
      expect(await render(file, 'w1024')).toContain('aria-label="Collapse rail"');
      expect(await render(file, 'w600')).toContain('aria-label="Expand rail"');
    });
  }

  for (const file of pages.filter((f) => sheets.has(idOf(f)))) {
    const id = idOf(file);
    const tab = { nowPlaying: 'Now playing', queue: 'Queue', lyrics: 'Lyrics' }[id];

    it(`[M0.canvas] ${id} under 1240 px is a full-screen sheet that covers the bottom bar and the rail`, async () => {
      for (const layout of ['w0', 'w600', 'w1024'] as const) {
        const html = await render(file, layout);
        expect(html, layout).toMatch(/^<div aria-hidden="false" style="position:absolute;inset:0/);
        // The bar's two ends, Browse and Search; the queue's own switch says Music and Spoken.
        for (const label of ['Browse', 'Search']) expect(html, layout).not.toContain(`>${label}<`);
        expect(html, layout).not.toContain('Collapse rail');
        expect(html, layout).toContain('aria-label="Collapse player"');
      }
    });

    it(`[M0.canvas] ${id} from 1240 px is the side panel, open on its own tab beside the page it is drawn over`, async () => {
      const html = await render(file, 'w1240');
      expect(frame(html)).toBe('--surface-bg-alt');
      expect(html).toContain('aria-label="Collapse rail"');
      expect(html).toMatch(new RegExp(`aria-selected="true"[^>]*>(?:<[^>]*>)*${tab}<`));
    });
  }

  it('[M0.canvas] never repeats the transport on desktop: the player bar alone carries it, panel open or not', async () => {
    for (const file of pages) {
      for (const layout of ['w600', 'w1024', 'w1240'] as const) {
        const html = await render(file, layout);
        if (sheets.has(idOf(file)) && layout !== 'w1240') continue;
        expect(html.match(/aria-label="(?:Play|Pause)"/g), `${file} ${layout}`).toHaveLength(1);
        expect(html.match(/aria-label="Next"/g), `${file} ${layout}`).toHaveLength(1);
      }
    }
  });

  it('[M0.canvas] heads a shelf on the phone with an app bar in the context form, saying "More like" once', async () => {
    const html = await render('Shelf.tsx', 'w0');
    expect(html.match(/More like/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('/art/deep-inertia.jpg');
  });
});
