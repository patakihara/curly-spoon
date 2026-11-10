import { describe, expect, it } from 'vitest';
import type { PageTree } from './page.js';
import { elements, readPage, type Element } from './test-pages.js';

type Row = Record<string, unknown>;
type Lists = Record<'asking' | 'standing' | 'arrived', Row[]>;

/** Each ResultRow in the tree with the list its innermost `<Each>` walks, in document order. */
function rows(
  tree: PageTree,
  list: string | null = null,
  into: { of: string | null; row: Element }[] = [],
) {
  if (tree.kind === 'element') {
    if (tree.component === 'ResultRow') into.push({ of: list, row: tree });
    for (const v of Object.values(tree.props)) if (v.kind === 'slot') rows(v.tree, list, into);
  }
  const inner = tree.kind === 'each' ? tree.of.join('.') : list;
  if ('children' in tree) tree.children.forEach((c) => rows(c, inner, into));
  return into;
}

const slotted = (e: Element, prop: string): Element | undefined => {
  const v = e.props[prop];
  return v?.kind === 'slot' && v.tree.kind === 'element' ? v.tree : undefined;
};

/** The request status words that may stand on a row, and the tone each takes (06-get). */
const STATUS: [RegExp, string][] = [
  [/^Searching…$/, 'progress'],
  [/^Queued$/, 'progress'],
  [/^Downloading · \d+%$/, 'progress'],
  [/^Importing$/, 'progress'],
  [/^Needs choice$/, 'request'],
  [/^Failed$/, 'error'],
];
const toneOf = (status: string) => STATUS.find(([word]) => word.test(status))?.[1];

describe('[M3.albums] an outside album’s row on Search', () => {
  const { tree, data } = readPage('search');
  const found = rows(tree);
  const rowOf = (of: string) => found.find((r) => r.of === of)!.row;
  const albums = (data.outside as { albums: Lists[] }).albums;
  const shown = (list: keyof Lists) => albums.flatMap((album) => album[list]);

  it('sits after the songs and their releases, before the books', () => {
    const outside = elements(tree);
    const at = (test: (e: Element) => boolean) => outside.findIndex(test);
    const firstOf = (of: string) => outside.indexOf(rowOf(of));
    const expander = at((e) => e.component === 'ExpanderRow');
    expect(firstOf('song.follows')).toBeLessThan(expander);
    expect(expander).toBeLessThan(firstOf('album.asking'));
    expect(firstOf('album.arrived')).toBeLessThan(firstOf('book.asking'));
    expect(found.filter((r) => r.of?.startsWith('album.')).map((r) => r.of)).toEqual([
      'album.asking',
      'album.standing',
      'album.arrived',
    ]);
  });

  it('with no status draws its Add to library button, which requests the album by its own ref', () => {
    const row = rowOf('album.asking');
    const button = slotted(row, 'trailing');
    expect(button?.component).toBe('Button');
    expect(button?.props.onClick).toEqual({ kind: 'request', params: { ref: ['asking', 'ref'] } });
    expect(button?.children).toMatchObject([{ kind: 'binding', path: ['asking', 'action'] }]);
    expect(row.props.onClick).toBeUndefined();
    expect(row.props.onAction).toBeUndefined();
    expect(shown('asking')).toHaveLength(1);
    for (const album of shown('asking')) {
      expect(album).toMatchObject({ status: null, tone: null, action: 'Add to library' });
      expect(album.meta).toBe('Album · Deep Inertia · 2022');
      expect(album.ref).not.toBe('');
    }
  });

  it('with a request on its way draws only its status, and leads to Requests', () => {
    const row = rowOf('album.standing');
    expect(row.props.trailing).toBeUndefined();
    expect(row.props.status).toEqual({ kind: 'binding', path: ['standing', 'status'] });
    expect(row.props.tone).toEqual({ kind: 'binding', path: ['standing', 'tone'] });
    expect(row.props.onClick).toEqual({ kind: 'open', page: 'requests', params: {} });
    expect(shown('standing')).toHaveLength(1);
    expect(shown('standing')[0]).toMatchObject({ status: 'Downloading · 40%', tone: 'progress' });
    for (const { status, tone } of shown('standing')) expect(toneOf(status as string)).toBe(tone);
  });

  it('In library draws only its status, opens the album and plays it from its art on the music queue', () => {
    const row = rowOf('album.arrived');
    expect(row.props.trailing).toBeUndefined();
    expect(row.props.status).toEqual({ kind: 'binding', path: ['arrived', 'status'] });
    expect(row.props.onClick).toEqual({
      kind: 'open',
      page: 'album',
      params: { ref: ['arrived', 'ref'] },
    });
    expect(row.props.onAction).toMatchObject({
      kind: 'play',
      queue: 'music',
      params: { ref: ['arrived', 'ref'] },
    });
    expect(shown('arrived')).toHaveLength(1);
    expect(shown('arrived')[0]).toMatchObject({ status: 'In library', tone: 'library' });
  });

  it('names each album row by the three lists a book row uses, one of them holding it', () => {
    for (const album of albums) {
      expect(Object.keys(album).sort()).toEqual(['arrived', 'asking', 'standing']);
      expect(album.asking.length + album.standing.length + album.arrived.length).toBe(1);
    }
    for (const row of [...shown('asking'), ...shown('standing'), ...shown('arrived')])
      expect(row.meta).toMatch(/^Album · /);
  });
});
