import { readdirSync, readFileSync } from 'node:fs';
import { createElement, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GivenLayout, type LayoutId } from './generated/nav/platform';
import { pages as table, routes } from './generated/nav/routes';

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
            default: ComponentType;
          }
        ).default;
        // A page opens others through the router, as it does in the app.
        const html = renderToString(
          createElement(
            GivenLayout.Provider,
            { value: layout },
            createElement(MemoryRouter, null, createElement(page)),
          ),
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
    pages: { id: string; title: string; presentation: 'screen' | 'sheet' | 'bare' }[];
  };
  const destinations = new Set(nav.destinations.map((d) => d.id));
  const sheets = new Set(nav.pages.filter((p) => p.presentation === 'sheet').map((p) => p.id));
  const bare = new Set(nav.pages.filter((p) => p.presentation === 'bare').map((p) => p.id));
  const idOf = (file: string) => file.replace('.tsx', '').replace(/^./, (c) => c.toLowerCase());
  /** The app at the page's route in `layout`, the one shell around it, as the router draws it. */
  const render = (file: string, layout: LayoutId) => {
    const path = table.find((p) => p.id === idOf(file))!.path;
    const at = path === '*' ? '/no-such-page' : path.replace(/:\w+/g, 'sample');
    const router = createMemoryRouter(routes, { initialEntries: [at] });
    return renderToString(
      createElement(
        GivenLayout.Provider,
        { value: layout },
        createElement(RouterProvider, { router }),
      ),
    );
  };
  /** The frame's own surface: the back layer's colour, or the page's under a top app bar. */
  const frame = (html: string) => /<div style="[^"]*background:var\((--[\w-]+)\)/.exec(html)?.[1];

  for (const file of pages.filter((f) => bare.has(idOf(f)))) {
    const id = idOf(file);
    it(`[M0.canvas] ${id} is bare: a top app bar on the phone, the backdrop on desktop, with no navigation, player or account`, async () => {
      expect(frame(await render(file, 'w0'))).toBe('--surface-bg');
      expect(frame(await render(file, 'w1024'))).toBe('--surface-bg-alt');
      for (const layout of ['w0', 'w600', 'w1024', 'w1240'] as const) {
        const html = await render(file, layout);
        for (const label of ['Browse', 'Search']) expect(html, layout).not.toContain(`>${label}<`);
        expect(html, layout).not.toMatch(
          /aria-label="(?:Collapse rail|Expand rail|Account|Close|Play|Pause)"/,
        );
        expect(html, layout).not.toContain('Heartbeats in Silence');
      }
    });
  }

  for (const file of pages.filter((f) => !sheets.has(idOf(f)) && !bare.has(idOf(f)))) {
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

    it(`[M0.canvas] ${id} on the phone is a full-screen sheet that covers the bottom bar`, async () => {
      const html = await render(file, 'w0');
      expect(html).toMatch(/^<div aria-hidden="false" style="position:absolute;inset:0;/);
      // The bar's two ends, Browse and Search; the queue's own switch says Music and Spoken.
      for (const label of ['Browse', 'Search']) expect(html).not.toContain(`>${label}<`);
      expect(html).toContain('aria-label="Collapse player"');
    });

    it(`[M0.canvas/c] ${id} from 600 px is the side panel, open on its own tab beside the page it is drawn over, never full screen`, async () => {
      for (const layout of ['w600', 'w1024', 'w1240'] as const) {
        const html = await render(file, layout);
        expect(frame(html), layout).toBe('--surface-bg-alt');
        expect(html, layout).toMatch(
          layout === 'w600' ? /aria-label="Expand rail"/ : /aria-label="Collapse rail"/,
        );
        expect(html, layout).not.toContain('aria-label="Collapse player"');
        expect(html, layout).toMatch(new RegExp(`aria-selected="true"[^>]*>(?:<[^>]*>)*${tab}<`));
      }
    });
  }

  it("[M0.canvas] shows one Now Playing in every page's side panel from 1240 px, the about card included", async () => {
    /** The CHROME entry's panel at 1240 px, as the page's source writes it. */
    const panel = (file: string) =>
      / {2}w1240: \(\w*\) => \(\{[\s\S]*?\n {4}sheet: \(\n([\s\S]*?)\n {4}\),/.exec(
        readFileSync(new URL(file, dir), 'utf8'),
      )?.[1];
    const screens = pages.filter((f) => !sheets.has(idOf(f)) && !bare.has(idOf(f)));
    const first = panel(screens[0]!);
    expect(first).toContain('<AboutCard');
    for (const file of screens) {
      expect(panel(file), file).toBe(first);
      expect((await render(file, 'w1240')).match(/About the artist/g), file).toHaveLength(1);
    }
    expect((await render('NowPlaying.tsx', 'w1240')).match(/About the artist/g)).toHaveLength(1);
  });

  it('[M0.canvas] never repeats the transport on desktop: the player bar alone carries it, panel open or not', async () => {
    for (const file of pages.filter((f) => !bare.has(idOf(f)))) {
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
