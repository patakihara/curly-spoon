import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EpisodeRow } from './generated/ui/index.js';

const row = (props: Partial<Parameters<typeof EpisodeRow>[0]>) =>
  renderToString(
    createElement(EpisodeRow, { title: 'The Night Ferry', image: '/art/x.jpg', ...props }),
  );

describe("Sonora's EpisodeRow for a show you don't follow", () => {
  it('[M0.canvas] greys its art to no colour and mutes its title', () => {
    const html = row({ absent: true });
    expect(html).toContain('filter:grayscale(1)');
    expect(html).toMatch(/color:var\(--surface-fg-muted\)">The Night Ferry</);
  });

  it('[M0.canvas] keeps an episode of a show you follow in full colour', () => {
    const html = row({});
    expect(html).not.toContain('grayscale');
    expect(html).toMatch(/color:var\(--surface-fg\)">The Night Ferry</);
  });
});
