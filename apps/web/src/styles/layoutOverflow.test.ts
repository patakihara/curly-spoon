/**
 * Pins the CSS rules that fix three of the web design audit's four defects
 * (docs/research/WEB_DESIGN_AUDIT.md, 2026-08-06) — no rendering, no jsdom:
 * `vitest.config.ts` runs this suite under `environment: 'node'` and the repo
 * has no DOM test environment installed at all (see `hooks/breakpoint.test.ts`'s
 * doc comment). These tests can't measure a real layout the way the audit's
 * browser-based measurements did; they assert on the stylesheet text that
 * *causes* the layout instead, so a regression that deletes or weakens one of
 * these rules fails loudly rather than only showing up in a future audit.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'app.css');
const css = readFileSync(CSS_PATH, 'utf-8');

/**
 * Pull out the body of the CSS rule whose selector is exactly `selector`
 * (optionally followed by more selector text before the `{`, so a prefix
 * class name doesn't accidentally match a longer one — e.g. `.auralis-shell
 * .auralis-mini-player` must not match `.auralis-shell--expanded
 * .auralis-mini-player`). Anchored to an actual rule opener (`selector` then
 * only whitespace/selector characters before `{`) rather than a bare
 * `indexOf`, so a doc comment that merely *mentions* the selector — several
 * of the ones below do, deliberately, to explain the rule — can't be
 * mistaken for the rule itself.
 */
function ruleBodyContaining(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Only whitespace allowed between the selector and its `{` — a doc comment
  // that *mentions* the selector is always followed by more comment prose,
  // never by bare whitespace-then-brace, so this can't match a comment.
  const match = new RegExp(`${escaped}\\s*\\{`).exec(css);
  if (!match) throw new Error(`no rule found for selector ${selector}`);
  const braceOpen = match.index + match[0].length - 1;
  const braceClose = css.indexOf('}', braceOpen);
  return css.slice(braceOpen + 1, braceClose);
}

describe('mini player docking (defect 1 — was position: relative, pushed below the fold)', () => {
  it('is fixed to the viewport at non-compact breakpoints instead of sitting in page flow', () => {
    const rule = ruleBodyContaining(
      '.auralis-shell:not(.auralis-shell--compact) .auralis-mini-player',
    );
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/bottom:\s*0/);
  });

  it('is fixed above the bottom nav bar at compact widths (mobile layout unchanged)', () => {
    const rule = ruleBodyContaining('.auralis-shell--compact .auralis-mini-player');
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/bottom:\s*80px/);
  });

  it("scopes its width to the rail's own width at expanded, via the same custom property Shell.tsx sets from railWidth()", () => {
    const rule = ruleBodyContaining('.auralis-shell--expanded .auralis-mini-player');
    expect(rule).toMatch(/width:\s*var\(--auralis-rail-width\)/);
  });

  it('reserves room in the content column so the now-fixed mini player does not permanently cover it', () => {
    const rule = ruleBodyContaining(
      '.auralis-shell:not(.auralis-shell--compact) .auralis-shell__content',
    );
    expect(rule).toMatch(/padding-bottom:/);
  });
});

describe('mini player docking at medium widths (defect: overlapped the 80px collapsed rail)', () => {
  it("does not repeat the expanded fix's rail-width scoping — 80px can't hold the player's contents", () => {
    const rule = ruleBodyContaining('.auralis-shell--medium .auralis-mini-player');
    expect(rule).not.toMatch(/width:\s*var\(--auralis-rail-width\)/);
  });

  it("docks to the rail's right edge instead, so the two share a boundary rather than overlapping", () => {
    const rule = ruleBodyContaining('.auralis-shell--medium .auralis-mini-player');
    expect(rule).toMatch(/left:\s*var\(--auralis-rail-width\)/);
    expect(rule).toMatch(/right:\s*0/);
  });
});

describe('compact bottom padding reserves room for the mini player (defect: content scrolled behind it)', () => {
  it('adds extra bottom padding only while the mini player is actually rendered', () => {
    const rule = ruleBodyContaining(".auralis-shell--compact[data-mini-player-active='true']");
    expect(rule).toMatch(/padding-bottom:/);
  });
});

describe('390px overflow (defect 3)', () => {
  it("wraps the item detail header instead of forcing the page wider (was flex-wrap's nowrap default)", () => {
    const rule = ruleBodyContaining('.auralis-item-header');
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
  });

  it('lets the item header title/byline column shrink and wrap rather than hold its content min-width', () => {
    const rule = ruleBodyContaining('.auralis-item-header__meta');
    expect(rule).toMatch(/min-width:\s*0/);
  });

  it("wraps the Music page's top link row instead of clipping Requests", () => {
    const rule = ruleBodyContaining('.auralis-music-header');
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
  });

  it("wraps the Music page's search row instead of clipping the Search button", () => {
    const rule = ruleBodyContaining('.auralis-music-search-row');
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
  });

  it('lets the search field itself shrink inside that row rather than holding its container open', () => {
    const rule = ruleBodyContaining('.auralis-music-search-row .m3-search-field');
    expect(rule).toMatch(/min-width:\s*0/);
  });
});
