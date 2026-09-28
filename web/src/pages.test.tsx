import { readdirSync } from 'node:fs';
import { createElement, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dir = new URL('./generated/pages/', import.meta.url);
const pages = readdirSync(dir).filter((file) => file.endsWith('.tsx'));

describe('every drawn canvas page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('has at least one page to render', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const file of pages) {
    for (const platform of ['mobile', 'desktop'] as const) {
      it(`${file} renders with its placeholder at ${platform} density with no console error or warning`, async () => {
        const said: unknown[][] = [];
        vi.spyOn(console, 'error').mockImplementation((...args) => void said.push(args));
        vi.spyOn(console, 'warn').mockImplementation((...args) => void said.push(args));
        const page = (
          (await import(new URL(file, dir).href)) as {
            default: ComponentType<{ platform?: string }>;
          }
        ).default;
        const html = renderToString(createElement(page, { platform }));
        expect(html.length).toBeGreaterThan(0);
        expect(said).toEqual([]);
      });
    }
  }
});
