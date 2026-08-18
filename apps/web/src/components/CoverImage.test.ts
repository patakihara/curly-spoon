/**
 * `CoverImage`'s fallback markup, rendered via `react-dom/server` rather than
 * a DOM testing library — this repo has no jsdom/happy-dom installed
 * (`vitest.config.ts` runs under `environment: 'node'`; see
 * `hooks/breakpoint.test.ts`'s doc comment) and installing one is out of
 * scope for this fix. `renderToStaticMarkup` needs no DOM, but it also never
 * fires `onError`, so what's pinned here is "what the fallback looks like
 * once shown", not "the image failing triggers it" — that transition is a
 * real, un-covered gap; `e2e/app` is where a DOM-driven regression test for
 * it belongs, and it's out of scope for this agent (see the spec's
 * "do not touch" list).
 *
 * Written as `.ts`, not `.tsx` — the repo's shared `vitest.config.ts` only
 * globs `.test.ts`, and it's being edited by another session right now, so
 * `React.createElement` is used instead of JSX to avoid needing that glob
 * changed.
 */
import { ThemeProvider } from '@auralis/ui';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoverImage, CoverImageFallback, type CoverImageProps } from './CoverImage.js';

/** `MantineImage` (used by `CoverImage`'s non-failed branch) reads Mantine's
 * theme context via `MantineProvider` and throws without one in the tree.
 * `apps/web` has no direct `@mantine/core` dependency (`packages/ui/src/
 * mantine.ts`'s doc comment — pnpm's strict layout, deliberate), so this
 * wraps with `@auralis/ui`'s own `ThemeProvider` (the one `RootLayout.tsx`
 * mounts for real) rather than reaching past it. */
function withMantine(element: ComponentType<CoverImageProps>, props: CoverImageProps) {
  return createElement(ThemeProvider, null, createElement(element, props));
}

describe('CoverImageFallback', () => {
  it('renders a tonal placeholder with the requested icon glyph, not an <img>', () => {
    const markup = renderToStaticMarkup(
      createElement(CoverImageFallback, { size: 120, icon: 'music_note' }),
    );

    expect(markup).not.toContain('<img');
    // Icons render as inline SVG (`packages/ui/src/components/Icon.tsx`) with
    // no `data-icon`/name attribute in the DOM, so the glyph itself can't be
    // asserted on directly here — the placeholder box and its hidden-from-AT
    // marking are what this test pins.
    expect(markup).toContain('<svg');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('is decorative, not read out by a screen reader', () => {
    const markup = renderToStaticMarkup(
      createElement(CoverImageFallback, { size: 96, icon: 'book' }),
    );
    expect(markup).toContain('aria-hidden="true"');
  });

  /**
   * The 16e-podcast-W fix: a caller-supplied `style` (radius/background) must reach the
   * fallback tile, not just the happy-path `<img>`. Before the fix `CoverImageFallback`
   * took no `style` prop at all, so this exact assertion would have failed — the markup
   * would contain the hardcoded `border-radius:8px` instead of the caller's override.
   */
  it('merges a caller-supplied style on top of the defaults, overriding the hardcoded radius', () => {
    const markup = renderToStaticMarkup(
      createElement(CoverImageFallback, {
        size: 120,
        icon: 'podcasts',
        style: { borderRadius: 'var(--radius-lg)', background: 'var(--surface-card)' },
      }),
    );

    expect(markup).toContain('border-radius:var(--radius-lg)');
    expect(markup).toContain('background:var(--surface-card)');
    expect(markup).not.toContain('border-radius:8px');
  });

  it('keeps the pre-Sonora 8px default when no caller style is supplied', () => {
    const markup = renderToStaticMarkup(
      createElement(CoverImageFallback, { size: 120, icon: 'music_note' }),
    );

    expect(markup).toContain('border-radius:8px');
  });
});

describe('CoverImage', () => {
  it('renders the real <img> (via MantineImage) before any load failure is known', () => {
    // No DOM environment to fire `onError` in, so this only pins the
    // pre-failure branch's markup — the default `failed` state a fresh
    // mount always starts in.
    const markup = renderToStaticMarkup(
      withMantine(CoverImage, {
        src: 'https://example.test/cover.jpg',
        size: 120,
        fallbackIcon: 'music_note',
      }),
    );

    expect(markup).toContain('<img');
    expect(markup).toContain('example.test/cover.jpg');
  });
});
