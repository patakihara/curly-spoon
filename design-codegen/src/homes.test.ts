import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import { parsePage, type PageTree, type PropValue } from './page.js';
import { framePage } from './shell.js';

const appDir = join(REPO_ROOT, APP_DIR);

/** Each library home, the person its second sort names, and what its local search names. */
const HOMES = [
  { id: 'music', person: 'Artist', searches: 'Search your music and requests' },
  { id: 'books', person: 'Author', searches: 'Search your books and requests' },
  { id: 'podcasts', person: 'Host', searches: 'Search your shows and their episodes' },
] as const;

type Element = Extract<PageTree, { kind: 'element' }>;

const read = (id: string) => ({
  tree: parsePage(readFileSync(join(appDir, 'pages', `${id}.page.jsx`), 'utf8'), id),
  data: JSON.parse(readFileSync(join(appDir, 'placeholders', `${id}.json`), 'utf8')) as Record<
    string,
    unknown
  >,
});

function elements(tree: PageTree | undefined, into: Element[] = []): Element[] {
  if (tree === undefined) return into;
  if (tree.kind === 'element') {
    into.push(tree);
    for (const v of Object.values(tree.props)) if (v.kind === 'slot') elements(v.tree, into);
  }
  if ('children' in tree) tree.children.forEach((c) => elements(c, into));
  return into;
}

/** Every `data.` / `shell.` path the page binds, in props, children and Each lists. */
function bindings(tree: PageTree, into: string[] = []): string[] {
  const prop = (v: PropValue) => {
    if (v.kind === 'binding') into.push(v.path.join('.'));
    if (v.kind === 'slot') bindings(v.tree, into);
  };
  if (tree.kind === 'binding') into.push(tree.path.join('.'));
  if (tree.kind === 'each') into.push(tree.of.join('.'));
  if (tree.kind === 'element') Object.values(tree.props).forEach(prop);
  if ('children' in tree) tree.children.forEach((c) => bindings(c, into));
  return into;
}

const browse = read('browse').data;

describe('the library homes', () => {
  for (const home of HOMES) {
    const { tree, data } = read(home.id);
    const all = elements(tree);

    it(`[M0.canvas] ${home.id} sorts by exactly Title, ${home.person} and Random, beside the grid or list toggle`, () => {
      const sort = all.find((e) => e.component === 'SortFilterBar');
      expect(sort?.props.label).toEqual({ kind: 'binding', path: ['data', 'sort', 'value'] });
      const trailing = sort?.props.trailing;
      expect(trailing?.kind === 'slot' && trailing.tree.kind === 'element').toBe(true);
      expect((trailing as { tree: Element }).tree.component).toBe('ViewToggle');
      const { value, options } = data.sort as { value: string; options: string[] };
      expect(options).toEqual(['Title', home.person, 'Random']);
      expect(options).toContain(value);
    });

    it(`[M0.canvas] ${home.id} binds only its own library, never Browse's feed, Browse's filter or search results`, () => {
      const paths = bindings(tree);
      const roots = new Set(paths.filter((p) => p.startsWith('data.')).map((p) => p.split('.')[1]));
      // `sections` is any spied page's own section titles, not Browse's content.
      const feed = Object.keys(browse).filter((key) => key !== 'sections');
      for (const key of feed) expect(roots).not.toContain(key);
      expect(paths.filter((p) => p.startsWith('shell.'))).toEqual([]);
      expect(paths.some((p) => /search|results|feed/i.test(p))).toBe(false);
    });

    it(`[M0.canvas] ${home.id} has a local search in its back layer, scoped to it: "${home.searches}"`, () => {
      expect(framePage(tree).search).toEqual({ kind: 'literal', value: home.searches });
    });

    it(`[M0.canvas] ${home.id} draws no in-library marker: where it goes is still open in the plan`, () => {
      for (const card of all.filter((e) => e.component === 'MediaCard')) {
        expect(Object.keys(card.props)).not.toContain('absent');
        expect(Object.keys(card.props)).not.toContain('markers');
      }
    });
  }

  it('[M0.canvas] shows its requests with a status in their tone, and everything else untoned', () => {
    const TONES: Record<string, RegExp> = {
      progress: /^Downloading · \d+%$/,
      request: /^Needs choice$/,
      error: /^Failed$/,
    };
    const seen = new Set<string>();
    for (const id of ['music', 'books']) {
      const items = read(id).data.library as { status: string | null; tone: string | null }[];
      for (const { status, tone } of items) {
        if (status === null) {
          expect(tone).toBeNull();
          continue;
        }
        expect(Object.keys(TONES)).toContain(tone);
        expect(status).toMatch(TONES[tone!]!);
        seen.add(tone!);
      }
    }
    expect([...seen].sort()).toEqual(['error', 'progress', 'request']);
  });

  it('[M0.canvas] gives Books a Requested filter in its back layer, beside All', () => {
    const { tree, data } = read('books');
    const controls = framePage(tree).controls as Element;
    expect(controls.component).toBe('ButtonGroup');
    expect(controls.props.items).toEqual({ kind: 'binding', path: ['data', 'filters'] });
    expect((data.filters as { label: string }[]).map((f) => f.label)).toEqual(['All', 'Requested']);
  });
});
