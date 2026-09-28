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
