import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusBanner } from './generated/ui/index.js';

describe("Sonora's StatusBanner in a page column", () => {
  it('[M0.canvas] stays inside the column it is given, its padding counted in its width', () => {
    const html = renderToString(
      createElement(StatusBanner, { tone: 'error', actionLabel: 'Try again' }, 'Not signed in.'),
    );
    expect(html).toMatch(/width:100%;box-sizing:border-box/);
  });
});
