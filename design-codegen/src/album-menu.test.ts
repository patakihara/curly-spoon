import { describe, expect, it } from 'vitest';
import { elements, readPage } from './test-pages.js';

describe('[M3.albums] the album page’s menu', () => {
  const { tree, data } = readPage('album');
  const header = elements(tree).find((e) => e.component === 'MediaHeader')!;
  const menu = header.props.menu?.kind === 'slot' ? header.props.menu.tree : undefined;

  it('hands its chosen verb to the album its page shows', () => {
    expect(menu).toMatchObject({ kind: 'element', component: 'OverflowMenu' });
    if (menu?.kind !== 'element') return;
    expect(menu.props.items).toEqual({ kind: 'binding', path: ['data', 'menu'] });
    expect(menu.props.onSelect).toEqual({ kind: 'choose', params: { ref: ['data', 'ref'] } });
  });

  it('offers Add to library, a lossless copy by torrent, under the key the app requests it by', () => {
    expect(data.menu).toContainEqual(
      expect.objectContaining({
        key: 'addToLibrary',
        label: 'Add to library',
        sub: 'A lossless copy, by torrent',
      }),
    );
  });
});
