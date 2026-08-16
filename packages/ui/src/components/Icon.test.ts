import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FILLABLE_ICON_NAMES,
  Icon,
  ICON_NAMES,
  isFillableIconName,
  type IconName,
} from './Icon.js';

/**
 * `PATHS`/`OUTLINE_PATHS` are deliberately internal to `Icon.tsx` — the public surface is
 * the component and the name lists. `renderToStaticMarkup` needs no DOM (this workspace has
 * no `jsdom`/`@testing-library/react`, and `vitest.config.ts`'s `environment: 'node'`
 * reflects that), so it is the cheapest way to read back the `<path d>` a given name and
 * `filled` state actually resolve to, exercising the same code path the app renders.
 */
function pathDataFor(name: IconName, filled?: boolean): string {
  const element = isFillableIconName(name)
    ? createElement(Icon, { name, filled })
    : createElement(Icon, { name });
  const html = renderToStaticMarkup(element);
  const match = /<path d="([^"]*)"/.exec(html);
  if (!match || match[1] === undefined) {
    throw new Error(`Icon "${name}" rendered no <path d> — this is a test bug, not a product one`);
  }
  return match[1];
}

describe('ICON_NAMES', () => {
  // Data-driven over the full name list so a future glyph added to `ICON_NAMES` without
  // matching path data in `PATHS` fails immediately here, rather than rendering blank.
  it.each(ICON_NAMES)('"%s" resolves to a non-empty SVG path', (name) => {
    const d = pathDataFor(name);
    expect(d.length).toBeGreaterThan(0);
    // Every Material Symbols path starts with an absolute or relative moveto command.
    expect(d[0]).toMatch(/[Mm]/);
  });
});

describe('FILLABLE_ICON_NAMES', () => {
  it.each(FILLABLE_ICON_NAMES)(
    '"%s" resolves to a non-empty outline (filled=false) path',
    (name) => {
      const d = pathDataFor(name, false);
      expect(d.length).toBeGreaterThan(0);
      expect(d[0]).toMatch(/[Mm]/);
    },
  );

  // The bug this guards: both the filled and outline entries for a glyph wired to the same
  // source path data, which would pass every "non-empty" assertion above while the `filled`
  // prop silently did nothing. `explore`, `album` and `book_2` have a real FILL-axis visual
  // difference in Material Symbols Rounded (verified by diffing the vendored `d` attributes
  // directly against the package), so their filled and outline paths must differ.
  it.each(['explore', 'album', 'book_2'] as const)(
    '"%s" renders different path data filled vs. outline',
    (name) => {
      expect(pathDataFor(name, false)).not.toBe(pathDataFor(name, true));
    },
  );

  // `podcasts` and `search` are the two exceptions: Material Symbols gives them
  // byte-identical filled and outline path data, because neither glyph has an enclosed
  // region for the FILL axis to change. Pinned explicitly so a future re-vendor that
  // "fixes" this by diverging the paths is caught as a source-data change, not silently
  // accepted.
  it.each(['podcasts', 'search'] as const)(
    '"%s" has identical filled and outline path data (no fillable region in this glyph)',
    (name) => {
      expect(pathDataFor(name, false)).toBe(pathDataFor(name, true));
    },
  );
});

describe('the play/play_arrow, heart/favorite, book/auto_stories and queue/queue_music aliases', () => {
  // These four pairs are intentionally the *same* path data (see Icon.tsx's doc comment for
  // why) — pinned here so a future edit to one half without the other is caught as a diff
  // between two names that are supposed to stay identical.
  it.each([
    ['play', 'play_arrow'],
    ['heart', 'favorite'],
    ['book', 'auto_stories'],
    ['queue', 'queue_music'],
  ] as const)('"%s" and "%s" share identical path data', (a, b) => {
    expect(pathDataFor(a)).toBe(pathDataFor(b));
  });
});
