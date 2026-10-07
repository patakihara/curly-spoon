import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EpisodeRow, Lyrics, ListRow, ResultRow, SectionHeader } from './generated/ui/index.js';

type Handler = (e?: unknown) => void;
type Press = (
  fn?: Handler,
  off?: boolean,
) => {
  role: string;
  tabIndex: number;
  'aria-disabled'?: boolean;
  onClick?: Handler;
  onKeyDown?: Handler;
};

/** Sonora's one press shell, from the module every component imports it from. */
const shared = './generated/ui/shared.js';
const { press } = (await import(/* @vite-ignore */ shared)) as { press: Press };

/** A key event as React hands it to a handler, pressed on the element itself. */
const key = (k: string) => {
  const target = {};
  return { key: k, target, currentTarget: target, preventDefault: () => {} };
};

describe("Sonora's press shell", () => {
  it('[M0.sonoraclean/d] hands the click event to the handler', () => {
    const got: unknown[] = [];
    const click = { type: 'click' };
    press((e) => got.push(e)).onClick!(click);
    expect(got).toEqual([click]);
  });

  it('[M0.sonoraclean/d] presses on Enter and on Space, handing the key event on', () => {
    const got: unknown[] = [];
    const { onKeyDown } = press((e) => got.push(e));
    const enter = key('Enter');
    const space = key(' ');
    onKeyDown!(enter);
    onKeyDown!(space);
    onKeyDown!(key('a'));
    expect(got).toEqual([enter, space]);
  });

  it('[M0.sonoraclean/d] says it is disabled only when it is off', () => {
    expect(press(() => {})).not.toHaveProperty('aria-disabled');
    expect(press(() => {}, false)).not.toHaveProperty('aria-disabled');
    expect(press(() => {}, true)['aria-disabled']).toBe(true);
    expect(press()['aria-disabled']).toBe(true);
  });
});

/** Every opening tag that makes an element a button, in the markup. */
const buttons = (html: string) => html.match(/<[a-z]+[^>]*role="button"[^>]*>/g) ?? [];

describe('An enabled press, drawn', () => {
  it.each<[string, ReturnType<typeof createElement>]>([
    ['a row', createElement(ListRow, { onClick: () => {} }, 'Low Tide')],
    [
      "a result row's art action",
      createElement(ResultRow, { title: 'Low Tide', image: '/a.jpg', onClick: () => {} }),
    ],
    [
      "an episode row's art action",
      createElement(EpisodeRow, {
        title: 'Episode 12',
        image: '/a.jpg',
        onClick: () => {},
        onPlay: () => {},
      }),
    ],
    ['a lyric line', createElement(Lyrics, { lines: ['First line'], onLineClick: () => {} })],
    [
      "a section header's subject",
      createElement(SectionHeader, {
        title: 'Static & Signal',
        eyebrow: 'More like',
        onSubject: () => {},
      }),
    ],
  ])('[M0.sonoraclean/d] %s says nothing of being disabled', (what, el) => {
    const tags = buttons(renderToString(el));
    expect(tags.length, what).toBeGreaterThan(0);
    for (const tag of tags) expect(tag, what).not.toContain('aria-disabled');
  });

  it('[M0.sonoraclean/d] a row that is off says so', () => {
    expect(
      buttons(renderToString(createElement(ListRow, { disabled: true }, 'Low Tide')))[0],
    ).toContain('aria-disabled="true"');
  });
});
