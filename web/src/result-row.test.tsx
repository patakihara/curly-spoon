import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResultRow } from './generated/ui/index.js';

const row = (props: Partial<Parameters<typeof ResultRow>[0]>) =>
  renderToString(
    createElement(ResultRow, {
      title: 'Salt and Static',
      meta: 'Album · Soul Vertex · ListenBrainz',
      ...props,
    }),
  );

describe("Sonora's ResultRow with a detail line", () => {
  const reason = 'Listeners of Deep Inertia play Soul Vertex most weeks.';

  it('[M0.canvas] says why the row is there on a line under the meta, wrapping to two lines', () => {
    const html = row({ detail: reason });
    expect(html.indexOf(reason)).toBeGreaterThan(html.indexOf('Album · Soul Vertex'));
    expect(html).toMatch(/-webkit-line-clamp:2[^"]*">Listeners of Deep Inertia/);
  });

  it('[M0.canvas] draws no detail line when the row has no reason', () => {
    expect(row({})).not.toContain('line-clamp');
  });
});

describe("Sonora's ResultRow art action", () => {
  const opens = () => undefined;
  const plays = () => undefined;

  it('draws no action on the art of a row that only opens, so opening never wears a Play label', () => {
    for (const platform of ['desktop', 'mobile'] as const) {
      const html = row({ platform, onClick: opens });
      expect(html, platform).not.toContain('aria-label="Play"');
      expect(html, platform).not.toContain('rr-act');
      expect(html, platform).toContain('aria-disabled="false"');
    }
  });

  it("draws the art's Play only when the row is given an action of its own, beside or without its click", () => {
    for (const platform of ['desktop', 'mobile'] as const) {
      expect(row({ platform, onClick: opens, onAction: plays }), platform).toContain(
        'aria-label="Play"',
      );
      expect(row({ platform, onAction: plays }), platform).toContain('aria-label="Play"');
    }
  });
});

/**
 * The roles a row's markup holds, each with the roles of the elements around it: a tiny walk over
 * the server-rendered HTML, enough for Sonora's markup (no comments, no raw `<` in text).
 */
function roles(html: string) {
  const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'col', 'wbr']);
  const open: { tag: string; role: string | null }[] = [];
  const found: { role: string; attrs: string; inside: string[]; text: string; at: number }[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, close, tag, attrs, selfClose] = m;
    if (close) {
      open.pop();
      continue;
    }
    const role =
      /\brole="([^"]+)"/.exec(attrs!)?.[1] ?? (tag!.toLowerCase() === 'button' ? 'button' : null);
    if (role !== null) {
      found.push({
        role,
        attrs: attrs!,
        inside: open.map((o) => o.role).filter((r): r is string => r !== null),
        text: '',
        at: m.index! + m[0].length,
      });
    }
    if (!selfClose && !VOID.has(tag!.toLowerCase())) open.push({ tag: tag!, role });
  }
  return found;
}

describe("Sonora's ResultRow as a control", () => {
  const opens = () => undefined;
  const plays = () => undefined;
  const buttons = (html: string) => roles(html).filter((r) => r.role === 'button');

  it('is no control at all when its only action is the art: no row button, nothing disabled', () => {
    for (const platform of ['desktop', 'mobile'] as const) {
      const html = row({ platform, onAction: plays });
      expect(
        buttons(html).map((b) => /aria-label="([^"]*)"/.exec(b.attrs)?.[1]),
        platform,
      ).toEqual(['Play']);
      expect(html, platform).not.toContain('aria-disabled');
      expect(html, platform).not.toContain('tabindex="-1"');
      expect(html.slice(0, html.indexOf('>')), platform).not.toContain('cursor:pointer');
    }
  });

  it('stays a disabled row when its art action has no art to sit on, beside a number or a glyph', () => {
    for (const lead of [{ number: 3 }, { icon: 'history' }]) {
      const html = row({ ...lead, onAction: plays });
      expect(
        buttons(html).map((b) => b.attrs.match(/tabindex="-1" aria-disabled="true"/) !== null),
      ).toEqual([true]);
    }
  });

  it('never holds one button inside another when it opens and also plays, or holds a control', () => {
    const trailing = <button type="button">Request</button>;
    for (const platform of ['desktop', 'mobile'] as const) {
      for (const props of [
        { onClick: opens, onAction: plays },
        { onClick: opens, trailing },
        { onClick: opens, onAction: plays, trailing },
      ]) {
        const html = row({ platform, ...props });
        for (const b of buttons(html)) expect(b.inside, `${platform} ${b.attrs}`).toEqual([]);
      }
    }
  });

  it('takes the row’s tap on its title, for the keyboard and a screen reader, when it holds another control', () => {
    for (const platform of ['desktop', 'mobile'] as const) {
      const html = row({ platform, onClick: opens, onAction: plays });
      const title = buttons(html).find((b) => !b.attrs.includes('aria-label'))!;
      expect(html.slice(title.at).startsWith('Salt and Static<'), platform).toBe(true);
      expect(title.attrs, platform).toContain('tabindex="0"');
      expect(title.attrs, platform).not.toContain('aria-disabled');
    }
  });

  it('is the button itself when it only opens, and a disabled one when it has no action', () => {
    for (const platform of ['desktop', 'mobile'] as const) {
      const [opening] = buttons(row({ platform, onClick: opens }));
      expect(opening!.attrs, platform).toMatch(/tabindex="0" aria-disabled="false"/);
      expect(opening!.attrs, platform).toContain('class="sn-int"');
      const [none, ...rest] = buttons(row({ platform }));
      expect(none!.attrs, platform).toMatch(/tabindex="-1" aria-disabled="true"/);
      expect(rest, platform).toEqual([]);
    }
  });
});

describe("Sonora's ResultRow with a glyph", () => {
  it('[M2.search] leads with the glyph in place of the art, for a row with no cover of its own', () => {
    for (const platform of ['desktop', 'mobile'] as const) {
      const html = row({ platform, icon: 'history', onClick: () => undefined });
      expect(html, platform).toMatch(
        /<span aria-hidden="true" style="[^"]*Material Symbols Rounded[^"]*">history<\/span>/,
      );
      expect(html, platform).not.toContain('rr-art');
      expect(html.indexOf('>history<'), platform).toBeLessThan(html.indexOf('Salt and Static'));
    }
  });

  it('draws the art as before without one', () => {
    expect(row({})).toContain('rr-art');
  });
});

describe("Sonora's ResultRow trailing control", () => {
  /** The elements from `tree` down to `target`, outermost first; empty when it is not there. */
  function pathTo(tree: unknown, target: unknown): { props: Record<string, unknown> }[] {
    if (tree === target) return [tree as { props: Record<string, unknown> }];
    if (Array.isArray(tree)) {
      for (const t of tree) {
        const found = pathTo(t, target);
        if (found.length > 0) return found;
      }
      return [];
    }
    if (tree === null || typeof tree !== 'object' || !('props' in tree)) return [];
    const el = tree as { props: Record<string, unknown> };
    const below = pathTo(el.props.children, target);
    return below.length > 0 ? [el, ...below] : [];
  }

  /** A click on `target` bubbling up through its intrinsic ancestors, as the browser sends it. */
  function click(tree: unknown, target: unknown) {
    let stopped = false;
    const event = { stopPropagation: () => void (stopped = true), target: {}, currentTarget: {} };
    for (const el of pathTo(tree, target).slice(0, -1).reverse()) {
      if (stopped) break;
      const onClick = el.props.onClick as ((e: unknown) => void) | undefined;
      onClick?.(event);
    }
  }

  it('[M2.search] keeps a press on its trailing control from opening the row', () => {
    for (const platform of ['desktop', 'mobile'] as const) {
      const opened: string[] = [];
      const trailing = <button type="button">Request</button>;
      const tree = (ResultRow as unknown as (p: object) => unknown)({
        title: 'Salt',
        platform,
        trailing,
        onClick: () => opened.push('row'),
      });
      expect(pathTo(tree, trailing).length, platform).toBeGreaterThan(1);
      click(tree, trailing);
      expect(opened, platform).toEqual([]);
    }
  });
});
