import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OverflowMenu, SortFilterBar } from './generated/ui/index.js';

const SORTS = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'random', label: 'Random' },
];

const bar = (props: Partial<Parameters<typeof SortFilterBar>[0]>) =>
  renderToString(createElement(SortFilterBar, { label: 'Title', ...props }));

/** The opening tag of the bar's own label button, the one holding its label text. */
const labelButton = (html: string) => {
  const at = html.lastIndexOf('<button', html.indexOf('>Title</span>'));
  return html.slice(at, html.indexOf('>', at) + 1);
};

describe("[M2.sorting] Sonora's OverflowMenu opened from a control of its own", () => {
  const anchor = createElement('button', { type: 'button' }, 'Sort by');

  it('draws the anchor in place of the three-dot button', () => {
    const html = renderToString(
      createElement(OverflowMenu, { items: SORTS, onSelect: () => {}, anchor }),
    );
    expect(html).toContain('>Sort by</button>');
    expect(html).not.toContain('more_vert');
    expect(html).not.toContain('role="menu"');
  });

  it('drops its menu from the anchor when open, lined up with the edge asked for', () => {
    const html = renderToString(
      createElement(OverflowMenu, {
        items: SORTS,
        onSelect: () => {},
        anchor,
        open: true,
        align: 'start',
      }),
    );
    expect(html.indexOf('role="menu"')).toBeGreaterThan(html.indexOf('Sort by'));
    expect(html).toMatch(/role="menu"[^>]*style="position:absolute;[^"]*left:0/);
    expect([...html.matchAll(/role="menuitem"/g)]).toHaveLength(3);
  });

  it('lets a wide anchor shrink, where the three-dot button never does', () => {
    const shell = (html: string) => html.slice(0, html.indexOf('>') + 1);
    expect(shell(renderToString(createElement(OverflowMenu, { items: SORTS, anchor })))).toContain(
      'min-width:0',
    );
    expect(shell(renderToString(createElement(OverflowMenu, { items: SORTS })))).toContain(
      'flex-shrink:0',
    );
  });
});

describe("[M2.sorting] Sonora's SortFilterBar with a menu of sorts", () => {
  it('makes its label the button that opens the menu, shut to start with', () => {
    const html = bar({ items: SORTS, onSelect: () => {} });
    const button = labelButton(html);
    expect(button).toContain('aria-haspopup="menu"');
    expect(button).toContain('aria-expanded="false"');
    expect(button).not.toContain('disabled');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('more_vert');
  });

  it('draws its label disabled when it has items but no onSelect, even with an onClick', () => {
    expect(labelButton(bar({ items: SORTS }))).toContain('disabled');
    expect(labelButton(bar({ items: SORTS, onClick: () => {} }))).toContain('disabled');
  });

  it('keeps its trailing control beside the menu, hard right', () => {
    const html = bar({
      items: SORTS,
      onSelect: () => {},
      trailing: createElement('span', null, 'Grid'),
    });
    expect(html.indexOf('Grid')).toBeGreaterThan(html.indexOf('>Title</span>'));
    expect(html).toMatch(/justify-content:space-between/);
  });

  it('without items stays the plain control it was: no menu, its onClick the press', () => {
    const plain = labelButton(bar({ onClick: () => {} }));
    expect(plain).not.toContain('aria-haspopup');
    expect(plain).not.toContain('aria-expanded');
    expect(plain).not.toContain('disabled');
    expect(labelButton(bar({}))).toContain('disabled');
  });
});

describe('[M2.sorting] an OverflowMenu item that can be selected', () => {
  const menu = (items: Parameters<typeof OverflowMenu>[0]['items']) =>
    renderToString(createElement(OverflowMenu, { items, onSelect: () => {}, open: true }));

  it('is a radio item, checked and marked with a check when selected', () => {
    const html = menu([
      { key: 'title', label: 'Title', selected: true },
      { key: 'random', label: 'Random', selected: false },
    ]);
    expect(html).toMatch(/role="menuitemradio" aria-checked="true"[^>]*>.*?Title.*?>check</);
    expect(html).toMatch(/role="menuitemradio" aria-checked="false"/);
    expect([...html.matchAll(/>check</g)]).toHaveLength(1);
  });

  it('stays a plain verb when it says nothing of selection', () => {
    const html = menu([{ key: 'share', label: 'Share' }]);
    expect(html).toContain('role="menuitem"');
    expect(html).not.toContain('aria-checked');
    expect(html).not.toContain('>check<');
  });

  it('is reached by the arrow keys, not by Tab', () => {
    expect(menu([{ key: 'share', label: 'Share' }])).toMatch(/role="menuitem" tabindex="-1"/);
  });
});

describe('[M2.sorting] a SortFilterBar given no items', () => {
  it('is the plain control, its onClick the press, when items is empty', () => {
    const plain = labelButton(bar({ items: [], onSelect: () => {}, onClick: () => {} }));
    expect(plain).not.toContain('aria-haspopup');
    expect(plain).not.toContain('disabled');
    expect(labelButton(bar({ items: [], onSelect: () => {} }))).toContain('disabled');
  });
});
