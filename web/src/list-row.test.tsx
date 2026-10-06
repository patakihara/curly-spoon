import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  EpisodeRow,
  ExpanderRow,
  ListRow,
  QueueRow,
  ResultRow,
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
    expect(tag).toContain('aria-disabled="false"');
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
    expect(root(row({}))).toContain('padding:10px var(--spacing-md)');
    expect(root(row({ density: 'compact' }))).toContain(
      'padding:var(--spacing-sm) var(--spacing-sm)',
    );
    expect(root(row({ density: 'card', platform: 'mobile' }))).toContain(
      'padding:14px var(--spacing-lg)',
    );
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
    expect(root(html), name).toContain('box-sizing:border-box;width:100%;display:flex');
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
