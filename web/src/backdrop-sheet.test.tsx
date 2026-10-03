import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackLayer, BackdropShell, SideSheet } from './generated/ui/index.js';

const shell = (props: Partial<Parameters<typeof BackdropShell>[0]>) =>
  renderToString(
    createElement(BackdropShell, {
      back: createElement(BackLayer, { title: 'Browse' }),
      rail: createElement('nav', null, 'rail'),
      player: createElement('footer', null, 'player'),
      children: createElement('p', null, 'Recently played'),
      sheet: createElement(SideSheet, { open: true, title: 'Player' }, 'Up next'),
      sheetOpen: true,
      ...props,
    }),
  );

describe("Sonora's BackdropShell with its side panel over the page", () => {
  it('[M0.canvas/c] draws the panel as a modal side sheet over the whole frame, a scrim behind it', () => {
    const html = shell({ sheetLayer: 'over' });
    expect(html).toMatch(/role="dialog" aria-modal="true"/);
    expect(html).toMatch(
      /aria-hidden="true" data-scrim="true"[^>]*style="position:absolute;inset:0[^"]*background:var\(--scrim\)/,
    );
    expect(html.indexOf('Up next')).toBeGreaterThan(html.indexOf('player'));
  });

  it('[M0.canvas/c] leaves the page its full width under the sheet, its front layer not squared against it', () => {
    const over = shell({ sheetLayer: 'over' });
    const beside = shell({ sheetLayer: 'front' });
    const squared = /border-radius:var\(--radius-lg\) 0 0 0/;
    expect(beside).toMatch(squared);
    expect(over).not.toMatch(squared);
    expect(over).not.toMatch(/role="dialog"[^>]*flex-shrink:0/);
  });

  it('[M0.canvas/c] draws no scrim while the sheet is closed', () => {
    expect(shell({ sheetLayer: 'over', sheetOpen: false })).not.toMatch(/data-scrim/);
  });

  it('[M0.canvas/c] keeps the panel beside the page in its other layers, with no scrim', () => {
    for (const sheetLayer of ['front', 'behind'] as const) {
      const html = shell({ sheetLayer });
      expect(html).not.toMatch(/data-scrim/);
      expect(html).not.toMatch(/aria-modal/);
    }
  });
});
