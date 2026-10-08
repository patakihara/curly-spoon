import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NowPlaying, PanelHeader, PlayerSubPage, SideSheet } from './generated/ui/index.js';

const header = (props: Record<string, unknown>) =>
  renderToString(createElement(PanelHeader, props));

/** Every button's opening tag in the markup. */
const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe("Sonora's panel header", () => {
  it('[M0.sonoraclean/d] names the panel and draws a close named for it', () => {
    const html = header({ title: 'Queue', closeLabel: 'Close queue', onClose: () => {} });
    expect(html).toContain('>Queue</div>');
    expect(buttons(html)).toHaveLength(1);
    expect(buttons(html)[0]).toContain('aria-label="Close queue"');
  });

  it('[M0.sonoraclean/d] leaves the close out without onClose', () => {
    expect(buttons(header({ title: 'Queue' }))).toEqual([]);
  });

  it('[M0.sonoraclean/d] names the close for the title when given no label', () => {
    expect(header({ title: 'Details', onClose: () => {} })).toContain('aria-label="Close Details"');
  });

  it('[M0.sonoraclean/d] draws its leading and trailing controls either side of the title', () => {
    const html = header({
      variant: 'player',
      title: 'Playing from Driftwave',
      leading: createElement('i', { id: 'lead' }),
      trailing: createElement('i', { id: 'trail' }),
    });
    const at = (s: string) => html.indexOf(s);
    expect(at('id="lead"')).toBeGreaterThan(-1);
    expect(at('id="lead"')).toBeLessThan(at('Playing from Driftwave'));
    expect(at('Playing from Driftwave')).toBeLessThan(at('id="trail"'));
  });

  it('[M0.sonoraclean/d] announces what its close folds away', () => {
    const html = header({
      variant: 'sheet',
      title: 'Details',
      closeControls: 'c1',
      onClose: () => {},
    });
    expect(buttons(html)[0]).toContain('aria-controls="c1"');
  });

  it.each([
    ['page', 'height:var(--appbar-height-mobile)'],
    ['player', 'height:var(--appbar-height-mobile)'],
    ['sheet', 'height:var(--appbar-height)'],
  ])('[M0.sonoraclean/d] a %s header stands as tall as its app bar', (variant, height) => {
    expect(header({ variant, title: 'Queue' })).toContain(height);
  });
});

describe('The panels on the panel header', () => {
  it('[M0.sonoraclean/d] the phone player sheet keeps its collapse, what it plays from and its menu', () => {
    const html = renderToString(
      createElement(NowPlaying, {
        open: true,
        track: { title: 'Driftwave', context: 'Playing from Driftwave' },
        onClose: () => {},
        onMore: () => {},
        children: createElement('div'),
      }),
    );
    const labels = buttons(html).map((b) => /aria-label="([^"]*)"/.exec(b)?.[1]);
    expect(labels.slice(0, 2)).toEqual(['Collapse player', 'More options']);
    expect(html).toContain('Playing from Driftwave');
  });

  it("[M0.sonoraclean/d] a player sub-page's close is named for the page", () => {
    const html = renderToString(
      createElement(PlayerSubPage, { heading: 'Queue', onClose: () => {}, children: 'x' }),
    );
    expect(buttons(html)[0]).toContain('aria-label="Close queue"');
  });

  it("[M0.sonoraclean/d] the side sheet's close controls the sheet's content", () => {
    const html = renderToString(
      createElement(SideSheet, { open: true, title: 'Queue', onClose: () => {}, children: 'x' }),
    );
    const controls = /aria-controls="([^"]+)"/.exec(buttons(html)[0] ?? '')?.[1];
    expect(controls).toBeDefined();
    expect(html).toContain(`id="${controls}"`);
  });
});
