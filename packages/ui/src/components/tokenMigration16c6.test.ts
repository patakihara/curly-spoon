import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Wave 16c-6-W (docs/ROADMAP.md §16): discriminating tests for the seven files this wave
 * migrated off `--m3-*` onto Sonora's tokens (docs/design/SONORA.md §1).
 *
 * This workspace has no jsdom (`vitest.config.ts`'s `environment: 'node'`), so there is no
 * `getComputedStyle` to assert against — the same constraint `apps/web/src/styles/
 * layoutOverflow.test.ts` works under, which is the precedent this file follows: read the
 * stylesheet's own text and assert on it directly. A test that only checks a token's *value*
 * (e.g. "is `--accent` `#8b5cf6`?") would still pass if a component reverted to reading
 * `--m3-primary` — Sonora and pre-Sonora happen to share some literal colours. So every
 * assertion here targets the *property name* actually referenced by a specific selector,
 * which fails if a future edit reverts that selector to its old `--m3-*` read.
 */
function readCss(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

/**
 * Every migrated file's own header comment quotes the `--m3-*` names it replaced, by design
 * — that's the established documentation idiom every prior 16c wave uses (Dialog.css,
 * Menu.css, Card.css all do this). A bare `not.toContain('--m3-…')` check would therefore
 * fail on prose that is explaining the migration, not on a real reversion. Stripping block
 * comments before the negative assertions keeps the check aimed at live code.
 */
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Fab.tsx — no --m3-* reads remain in the surface-style override', () => {
  const src = readCss('./Fab.tsx');

  it('fills with --accent, not --m3-primary-container', () => {
    expect(src).toContain("backgroundColor: 'var(--accent, #8b5cf6)'");
    expect(stripBlockComments(src)).not.toContain('--m3-primary-container');
  });

  it('reads --accent-contrast for the icon/label colour, not --m3-on-primary-container', () => {
    expect(src).toContain("color: 'var(--accent-contrast, #fff)'");
    expect(stripBlockComments(src)).not.toContain('--m3-on-primary-container');
  });

  it('shadows with --shadow-lg, not --m3-elevation-3', () => {
    expect(src).toContain("boxShadow: 'var(--shadow-lg,");
    expect(stripBlockComments(src)).not.toContain('--m3-elevation-3');
  });
});

describe('NavigationBar.css — active indicator and item colour off --m3-*', () => {
  const css = readCss('./NavigationBar.css');

  it('bar background/border use --surface-card / --surface-border', () => {
    expect(css).toMatch(/\.m3-nav-bar\s*{[^}]*background: var\(--surface-card/);
    expect(css).toMatch(/\.m3-nav-bar\s*{[^}]*border-top: 1px solid var\(--surface-border/s);
  });

  it('indicator radius is --radius-pill, not --m3-shape-full', () => {
    expect(css).toMatch(/\.m3-nav-bar__indicator\s*{[^}]*border-radius: var\(--radius-pill/s);
    expect(css.split('.m3-nav-bar__indicator {')[1]?.split('}')[0]).not.toContain(
      '--m3-shape-full',
    );
  });

  it('indicator/item transitions are the flattened literal duration, not --m3-spring-*', () => {
    // The two rules that used to read --m3-spring-default-*/--m3-spring-fast-* now both read
    // a literal 200ms ease-in-out — this is the specific regression a revert would reintroduce.
    expect(css).toContain('transform 200ms ease-in-out');
    expect(css).toContain('width 200ms ease-in-out');
    expect(css).toContain('transition: color 200ms ease-in-out;');
    expect(stripBlockComments(css)).not.toContain('--m3-spring-default-duration');
    expect(stripBlockComments(css)).not.toContain('--m3-spring-fast-duration');
  });

  it('inactive item colour is --surface-fg-muted, not --m3-on-surface-variant', () => {
    expect(css).toMatch(/\.m3-nav-bar__item\s*{[^}]*color: var\(--surface-fg-muted/s);
  });

  it('--m3-touch-target-min and the label typography scale survive deliberately', () => {
    expect(css).toContain('var(--m3-touch-target-min)');
    expect(css).toContain('var(--m3-type-label-medium-size)');
  });
});

describe('ListItem.css — off --m3-* except the two deliberate survivors', () => {
  const css = readCss('./ListItem.css');

  it('base row colour/radius/transition are Sonora tokens', () => {
    expect(css).toMatch(/\.m3-list-item\s*{[^}]*color: var\(--surface-fg,/s);
    expect(css).toMatch(/\.m3-list-item\s*{[^}]*border-radius: var\(--radius-sm,/s);
    expect(css).toContain('transition: background-color 200ms ease-in-out;');
  });

  it('selected state is a tonal --surface-card step, not an --accent fill and not --m3-secondary-container', () => {
    // Pins BOTH directions deliberately. The `--m3-*` half guards the migration; the
    // `--accent` half guards the review finding that a solid accent fill both contradicts
    // the queue view's own override of this class and fails WCAG AA on its text pairing.
    // Reverting to either shape fails this test.
    expect(css).toMatch(/\.m3-list-item--selected\s*{\s*background: var\(--surface-card,/);
    expect(css).toMatch(/\.m3-list-item--selected\s*{[^}]*color: var\(--surface-fg,/);
    const bare = stripBlockComments(css);
    expect(bare).not.toContain('--m3-secondary-container');
    expect(bare).not.toContain('--m3-on-secondary-container');
    expect(bare).not.toContain('--accent-contrast');
  });

  it('overline/supporting text use --surface-fg-muted, not --m3-on-surface-variant', () => {
    const overlineBlock = css.split('.m3-list-item__overline {')[1]?.split('}')[0] ?? '';
    const supportingBlock = css.split('.m3-list-item__supporting {')[1]?.split('}')[0] ?? '';
    expect(overlineBlock).toContain('var(--surface-fg-muted');
    expect(supportingBlock).toContain('var(--surface-fg-muted');
    expect(stripBlockComments(css)).not.toContain('--m3-on-surface-variant');
  });

  it('--m3-touch-target-min survives deliberately; --m3-state-layer-color is gone (no-op removed)', () => {
    expect(css).toContain('var(--m3-touch-target-min)');
    expect(stripBlockComments(css)).not.toContain('--m3-state-layer-color');
  });
});

describe('TopAppBar.css — surface/text/transition off --m3-*', () => {
  const css = readCss('./TopAppBar.css');

  it('background/colour are --surface-bg / --surface-fg', () => {
    expect(css).toMatch(/\.m3-top-app-bar\s*{[^}]*background: var\(--surface-bg,/s);
    expect(css).toMatch(/\.m3-top-app-bar\s*{[^}]*color: var\(--surface-fg,/s);
  });

  it('the padding-bottom transition is the flattened literal, not --m3-spring-default-*', () => {
    expect(css).toContain('transition: padding-bottom 200ms ease-in-out;');
    expect(stripBlockComments(css)).not.toContain('--m3-spring-default-duration');
  });

  it('--m3-touch-target-min and the title typography scale survive deliberately', () => {
    expect(css).toContain('var(--m3-touch-target-min)');
    expect(css).toContain('var(--m3-type-title-large-size)');
  });
});

describe('SearchField.css — focus ring, clear button and suggestion colours off --m3-*', () => {
  const css = readCss('./SearchField.css');

  it('the focus ring is --accent, not --m3-secondary (matching Slider.css idiom)', () => {
    expect(css).toContain('outline: 3px solid var(--accent, #8b5cf6);');
    expect(stripBlockComments(css)).not.toContain('--m3-secondary, currentColor');
  });

  it('clear button radius/colour are Sonora tokens', () => {
    const clearBlock = css.split('.m3-search-field__clear {')[1]?.split('}')[0] ?? '';
    expect(clearBlock).toContain('var(--radius-pill,');
    expect(clearBlock).toContain('var(--surface-fg-muted,');
  });

  it('suggestion text colour is --surface-fg, not --m3-on-surface', () => {
    const suggestionBlock = css.split('.m3-search-field__suggestion {')[1]?.split('}')[0] ?? '';
    expect(suggestionBlock).toContain('var(--surface-fg,');
  });

  it('the suggestion hover/active background deliberately keeps --m3-surface-container-highest', () => {
    // Matching Menu.css's documented precedent: no clean --surface-* single-token
    // substitute exists for this "one step brighter" hover tier on a floating dropdown.
    expect(css).toContain('background: var(--m3-surface-container-highest);');
  });
});

describe('Snackbar.css — entrance motion and action colour off --m3-*', () => {
  const css = readCss('./Snackbar.css');

  it('the entrance animation duration is the flattened literal, not --m3-spring-default-*', () => {
    expect(css).toContain('animation: m3-snackbar-enter 200ms ease-in-out;');
    expect(stripBlockComments(css)).not.toContain('--m3-spring-default-duration');
  });

  it('the action button reads --accent, not --m3-inverse-primary', () => {
    expect(css).toContain('color: var(--accent, inherit);');
    expect(stripBlockComments(css)).not.toContain('--m3-inverse-primary');
  });

  it('the action label typography scale survives deliberately', () => {
    expect(css).toContain('var(--m3-type-label-large-size)');
  });
});

describe('Marquee — private animation vars renamed out of the --m3-* namespace', () => {
  const css = readCss('./Marquee.css');
  const tsx = readCss('./Marquee.tsx');

  it('Marquee.css reads --marquee-distance/--marquee-duration, not the --m3-prefixed names', () => {
    expect(css).toContain('var(--marquee-duration)');
    expect(css).toContain('var(--marquee-distance)');
    expect(stripBlockComments(css)).not.toContain('--m3-marquee-duration');
    expect(stripBlockComments(css)).not.toContain('--m3-marquee-distance');
  });

  it('Marquee.tsx sets the same renamed custom properties inline', () => {
    expect(tsx).toContain("'--marquee-distance':");
    expect(tsx).toContain("'--marquee-duration':");
    expect(stripBlockComments(tsx)).not.toContain('--m3-marquee-distance');
    expect(stripBlockComments(tsx)).not.toContain('--m3-marquee-duration');
  });
});
