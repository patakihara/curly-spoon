import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  EpisodeRow,
  MediaCard,
  MediaHeader,
  ProgressBar,
  QuickPick,
} from './generated/ui/index.js';

const bar = (props: Record<string, unknown>) =>
  renderToString(createElement(ProgressBar, { value: 0.4, ...props }));

describe("Sonora's progress bar", () => {
  it('[M0.sonoraclean/d] is announced as a progressbar, its value a percentage of 0 to 100', () => {
    const html = bar({ label: 'Played' });
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain('aria-label="Played"');
  });

  it('[M0.sonoraclean/d] fills its share in the play colour, held to 0..1', () => {
    expect(bar({})).toContain('background:var(--play);width:40%');
    expect(bar({ value: 1.4 })).toContain('aria-valuenow="100"');
    expect(bar({ value: -1 })).toContain('width:0%');
  });

  it.each([
    ['0.5', 50],
    ['0', 0],
    ['abc', 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 100],
    [Number.NEGATIVE_INFINITY, 0],
  ])('[M0.sonoraclean/d] reads %s as %s percent', (value, percent) => {
    const html = bar({ value });
    expect(html).toContain(`aria-valuenow="${percent}"`);
    expect(html).toContain(`width:${percent}%`);
  });

  it.each([
    ['sm', '--progress-sm'],
    ['md', '--progress-md'],
  ])('[M0.sonoraclean/d] size %s is %s tall', (size, token) => {
    expect(bar({ size })).toContain(`height:var(${token})`);
  });

  it.each([
    ['surface', '--surface-border'],
    ['scrim', '--scrim'],
  ])('[M0.sonoraclean/d] on %s its track is %s', (tone, token) => {
    expect(bar({ tone })).toMatch(new RegExp(`background:var\\(${token}\\)[";]`));
  });

  it.each([
    ['QuickPick', QuickPick, { title: 't', image: 'a.jpg', progress: 0.25 }],
    ['MediaCard', MediaCard, { title: 't', progress: 0.25 }],
    ['EpisodeRow', EpisodeRow, { title: 't', progress: 0.25 }],
    ['MediaHeader', MediaHeader, { title: 't', progress: 0.25 }],
  ])('[M0.sonoraclean/d] %s draws its progress as the one progress bar', (_, component, props) => {
    const html = renderToString(createElement(component as never, props));
    expect(html.match(/role="progressbar"/g)).toHaveLength(1);
    expect(html).toContain('aria-valuenow="25"');
  });
});
