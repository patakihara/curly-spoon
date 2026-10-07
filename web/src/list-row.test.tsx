import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  EpisodeRow,
  ExpanderRow,
  ListRow,
  QueueRow,
  ResultRow,
  QuickPick,
  SettingRow,
  ValueRow,
} from './generated/ui/index.js';

const row = (props: Record<string, unknown>, children: ReactNode = 'Low Tide') =>
  renderToString(createElement(ListRow, props, children));

/** The opening tag of the row's root. */
const root = (html: string) => html.slice(0, html.indexOf('>') + 1);

describe("Sonora's row shell", () => {
  it('[M0.sonoraclean/d] is a button in the focus order when it presses', () => {
    const tag = root(row({ onClick: () => {} }));
    expect(tag).toContain('role="button"');
    expect(tag).toContain('tabindex="0"');
    expect(tag).not.toContain('aria-disabled');
    expect(tag).toContain('cursor:pointer');
  });

  it('[M0.sonoraclean/d] is drawn off, out of the focus order, when disabled, even with a press', () => {
    for (const props of [{ disabled: true }, { disabled: true, onClick: () => {} }]) {
      const tag = root(row(props));
      expect(tag).toContain('role="button"');
      expect(tag).toContain('tabindex="-1"');
      expect(tag).toContain('aria-disabled="true"');
    }
  });

  it('[M0.sonoraclean/d] with no press and not disabled is no button, only a row holding its own controls', () => {
    const tag = root(row({}));
    expect(tag).not.toContain('role=');
    expect(tag).not.toContain('tabindex');
    expect(tag).not.toContain('sn-int');
    expect(tag).not.toContain('cursor:pointer');
  });

  it('[M0.sonoraclean/d] draws a hairline divider along the bottom only when asked', () => {
    expect(row({ divider: true })).toMatch(
      /height:var\(--hairline\);background:var\(--surface-border\)/,
    );
    expect(row({})).not.toContain('--surface-border');
  });

  it('[M0.sonoraclean/d] draws art of a ramp step, with a named play overlay only when the art has an action', () => {
    const html = row({ artSize: 'md', image: '/a.jpg', onArt: () => {}, artLabel: 'Play episode' });
    expect(html).toContain('width:var(--art-md);height:var(--art-md)');
    expect(html).toContain('aria-label="Play episode"');
    expect(html).toContain('background:var(--scrim-strong)');
    expect(row({ artSize: 'md' })).not.toContain('--scrim-strong');
    expect(row({})).not.toContain('--art-');
  });

  it('[M0.sonoraclean/d] shows the art overlay always on a phone, on hover or focus on desktop', () => {
    expect(row({ artSize: 'md', platform: 'mobile' })).toContain('data-always="true"');
    expect(row({ artSize: 'md' })).toContain('data-always="false"');
  });

  it('[M0.sonoraclean/d] greys the art, and puts a status on a scrim over it', () => {
    expect(row({ artSize: 'md', artGrey: true })).toContain('filter:grayscale(1)');
    expect(row({ artSize: 'md', artStatus: 'working' })).toMatch(
      /background:var\(--scrim\)">working</,
    );
  });

  it('[M0.sonoraclean/d] takes a density step: a track list unless told otherwise', () => {
    expect(root(row({}))).toContain('padding:var(--row-padding) var(--spacing-md)');
    expect(root(row({ density: 'compact' }))).toContain(
      'padding:var(--spacing-sm) var(--spacing-sm)',
    );
    expect(root(row({ density: 'card', platform: 'mobile' }))).toContain(
      'padding:var(--row-padding-card) var(--spacing-lg)',
    );
    expect(root(row({ density: 'flush' }))).toContain('gap:var(--spacing-md);padding:0 0;');
  });

  it('[M0.sonoraclean/d] announces whether what it shows is expanded', () => {
    expect(root(row({ onClick: () => {}, expanded: true }))).toContain('aria-expanded="true"');
  });
});

/** Each row in the family, drawn with a press where it takes one. */
const ROWS: [string, ReactNode][] = [
  [
    'ResultRow',
    createElement(ResultRow, {
      title: 'Low Tide',
      meta: 'Halcyon',
      onClick: () => {},
      divider: true,
    }),
  ],
  [
    'EpisodeRow',
    createElement(EpisodeRow, { title: 'Episode 12', onClick: () => {}, onPlay: () => {} }),
  ],
  ['QueueRow', createElement(QueueRow, { title: 'Low Tide', sub: 'Halcyon', onClick: () => {} })],
  ['ExpanderRow', createElement(ExpanderRow, { label: 'More releases', onToggle: () => {} })],
  ['ValueRow', createElement(ValueRow, { label: 'Speed', value: '1.0x', onClick: () => {} })],
  [
    'SettingRow',
    createElement(SettingRow, { title: 'Gapless', sub: 'No gap', onChange: () => {} }),
  ],
];

describe("Sonora's rows, drawn", () => {
  it.each(ROWS)('[M0.sonoraclean/d] %s draws the row shell at its root', (name, el) => {
    const html = renderToString(el);
    // The shell's root: a full-width flex row whose text column fills between the slots.
    expect(root(html), name).toContain('box-sizing:border-box;min-width:0;display:flex');
    expect(html, name).toContain('flex:1;min-width:0;display:flex;flex-direction:column');
  });

  it.each(ROWS.filter(([name]) => name !== 'SettingRow'))(
    '[M0.sonoraclean/d] %s presses as a button, and with no press is drawn off',
    (name, el) => {
      expect(root(renderToString(el)), name).toContain('role="button"');
    },
  );

  it('[M0.sonoraclean/d] a SettingRow is no button: its switch is the control', () => {
    const html = renderToString(ROWS.find(([n]) => n === 'SettingRow')![1]);
    expect(root(html)).not.toContain('role=');
    expect(html).toContain('role="switch"');
  });
});

/** The size step of the glyph over a row's art: the Icon after the art action's accessible name. */
const artGlyph = (html: string, label: string): string | undefined => {
  const at = html.indexOf(`aria-label="${label}"`);
  return at < 0 ? undefined : /font-size:var\(--icon-([\w-]+)\)/.exec(html.slice(at))?.[1];
};

describe("The glyph over a row's art, sized as each row drew it before the shell", () => {
  it.each<[string, 'desktop' | 'mobile', string]>([
    ['ResultRow', 'desktop', 'sm'],
    ['ResultRow', 'mobile', 'sm'],
    ['EpisodeRow', 'desktop', 'md'],
    ['EpisodeRow', 'mobile', 'md'],
  ])('[M0.sonoraclean/d] %s on %s draws its play glyph at --icon-%s', (name, platform, size) => {
    const html =
      name === 'ResultRow'
        ? renderToString(
            createElement(ResultRow, {
              title: 'Low Tide',
              meta: 'Halcyon',
              platform,
              onClick: () => {},
            }),
          )
        : renderToString(
            createElement(EpisodeRow, { title: 'Episode 12', platform, onPlay: () => {} }),
          );
    expect(artGlyph(html, name === 'ResultRow' ? 'Play' : 'Play episode')).toBe(size);
  });

  it('[M0.sonoraclean/d] a row with art takes the glyph size it is given, sm unless told', () => {
    const art = { artSize: 'lg', onArt: () => {}, artLabel: 'Play' };
    expect(artGlyph(row(art), 'Play')).toBe('sm');
    expect(artGlyph(row({ ...art, artIconSize: 'md' }), 'Play')).toBe('md');
  });
});

describe('QuickPick, a tile drawn on the row shell', () => {
  it('[M0.sonoraclean/d] is the flush row on the card fill, a button that is off without a press', () => {
    const on = root(renderToString(createElement(QuickPick, { title: 'Dune', onClick: () => {} })));
    expect(on).toContain('role="button"');
    expect(on).toContain('tabindex="0"');
    expect(on).toContain(
      'padding:0 0;border-radius:var(--radius-xs);background:var(--surface-card)',
    );
    const off = root(renderToString(createElement(QuickPick, { title: 'Dune' })));
    expect(off).toContain('tabindex="-1"');
    expect(off).toContain('aria-disabled="true"');
  });
});

/** Sonora's radius ramp, read from its tokens: `--radius-xs` is 8px, `--radius-2xs` 6px. */
const RADII = Object.fromEntries(
  [
    ...readFileSync(
      fileURLToPath(new URL('../../design/sonora/tokens/radius.css', import.meta.url)),
      'utf8',
    ).matchAll(/--(radius-[\w-]+):\s*([^;]+);/g),
  ].map(([, name, value]) => [name!, value!.trim()]),
);

/** Every corner the row's art draws (the cover, a status scrim, the play overlay), in pixels. */
const artCorners = (html: string): string[] => {
  const art = html.slice(html.indexOf('width:var(--art-'));
  return [
    ...art.matchAll(
      /inset:0;[^"]*?border-radius:var\(--(radius-[\w-]+)\)|overflow:hidden;width:100%;height:100%;border-radius:var\(--(radius-[\w-]+)\)/g,
    ),
  ].map(([, a, b]) => RADII[(a ?? b)!]!);
};

describe("The corners of a row's art, as each row drew them before the shell", () => {
  it.each<[string, 'desktop' | 'mobile', string]>([
    ['ResultRow', 'desktop', '6px'],
    ['ResultRow', 'mobile', '8px'],
    ['EpisodeRow', 'desktop', '8px'],
    ['EpisodeRow', 'mobile', '8px'],
    ['QueueRow', 'desktop', '6px'],
    ['QueueRow', 'mobile', '8px'],
    ['ExpanderRow', 'desktop', '8px'],
  ])('[M0.sonoraclean/d] %s on %s rounds its art %s', (name, platform, px) => {
    const props = { title: 'Low Tide', label: 'More releases', image: '/a.jpg', platform };
    const el =
      name === 'ResultRow'
        ? createElement(ResultRow, { ...props, onClick: () => {}, onAction: () => {} })
        : name === 'EpisodeRow'
          ? createElement(EpisodeRow, { ...props, onPlay: () => {} })
          : name === 'QueueRow'
            ? createElement(QueueRow, props)
            : createElement(ExpanderRow, { ...props, onToggle: () => {} });
    const corners = artCorners(renderToString(el));
    expect(corners.length, name).toBeGreaterThan(0);
    expect(new Set(corners), name).toEqual(new Set([px]));
  });

  it('[M0.sonoraclean/d] a row keeps the corner it is given, else the small corner on desktop', () => {
    expect(artCorners(row({ artSize: 'md' }))).toContain('6px');
    expect(new Set(artCorners(row({ artSize: 'md', artRadius: 'xs', onArt: () => {} })))).toEqual(
      new Set(['8px']),
    );
    expect(new Set(artCorners(row({ artSize: 'md', platform: 'mobile' })))).toEqual(
      new Set(['8px']),
    );
  });
});
