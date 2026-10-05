import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MediaCard } from './generated/ui/index.js';

const card = (props: Partial<Parameters<typeof MediaCard>[0]>) =>
  renderToString(
    createElement(MediaCard, { title: 'A Grain of Salt', image: '/art/x.jpg', ...props }),
  );
const noop = () => {};

describe("Sonora's MediaCard for an item you don't own", () => {
  it('[M0.canvas] greys its art to no colour and mutes its title, whether absent or a request', () => {
    for (const html of [card({ absent: true }), card({ status: 'Downloading · 30%' })]) {
      expect(html).toContain('filter:grayscale(1)');
      expect(html).toMatch(/color:var\(--surface-fg-muted\)">A Grain of Salt</);
    }
    expect(card({})).not.toContain('grayscale');
  });

  it('[M0.canvas] offers its page as Open in a corner menu once a tap requests it instead', () => {
    expect(card({ absent: true, onRequest: noop, onClick: noop })).toContain(
      'aria-label="More options"',
    );
    expect(card({ absent: false, onRequest: noop, onClick: noop })).not.toContain('More options');
    expect(
      card({ absent: true, status: 'Requested', onRequest: noop, onClick: noop }),
    ).not.toContain('More options');
  });
});

describe("Sonora's round MediaCard, for a person", () => {
  it('[M0.sonoraclean/c] draws its art as a circle and centres its title and sub', () => {
    const html = card({ shape: 'round', sub: 'Artist', onClick: noop });
    expect(html).toMatch(/aspect-ratio:1;[^"]*border-radius:var\(--radius-round\)/);
    expect(html).toMatch(/text-align:center/);
    expect(html).toContain('role="button" aria-label="A Grain of Salt"');
  });

  it('[M0.sonoraclean/c] square is the default: rounded-corner art, text set from the start', () => {
    const html = card({ sub: 'Album', onClick: noop });
    expect(html).not.toContain('--radius-round');
    expect(html).not.toContain('text-align:center');
  });
});
