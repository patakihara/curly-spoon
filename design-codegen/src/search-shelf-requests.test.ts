import { describe, expect, it } from 'vitest';
import type { PageTree } from './page.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import { framePage, framed } from './shell.js';
import { bindings, dataRoots, elements, readPage, type Element } from './test-pages.js';

type Row = Record<string, unknown>;

/** Each ResultRow in the tree with the list its innermost `<Each>` walks, or null outside one. */
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

const sections = (tree: PageTree) =>
  elements(tree)
    .filter((e) => e.component === 'Section')
    .map((e) => e.props.title)
    .map((t) => (t?.kind === 'literal' ? t.value : undefined));

/** The request status vocabulary (docs/plan/06-get.md) and the tone each word takes. */
const STATUS: [RegExp, string][] = [
  [/^Searching…$/, 'progress'],
  [/^Queued$/, 'progress'],
  [/^Downloading · \d+%$/, 'progress'],
  [/^Importing$/, 'progress'],
  [/^Needs choice$/, 'request'],
  [/^Failed$/, 'error'],
];
const toneOf = (status: string) => STATUS.find(([word]) => word.test(status))?.[1];

describe('Search', () => {
  const { tree, data } = readPage('search');
  const frame = framePage(tree);
  const found = rows(tree);

  it('[M0.canvas] binds only its own query, filters and results', () => {
    expect(dataRoots(tree)).toEqual([
      'activeFilters',
      'kinds',
      'library',
      'outside',
      'placeholder',
      'query',
      'scopes',
      'top',
    ]);
    expect(bindings(tree).filter((p) => p.startsWith('shell.'))).toEqual([]);
  });

  it('[M0.canvas] opens with the field focused on the query, in the back layer', () => {
    const field = elements(frame.controls).find((e) => e.component === 'SearchField');
    expect(field?.props.autoFocus).toEqual({ kind: 'literal', value: true });
    expect(field?.props.value).toEqual({ kind: 'binding', path: ['data', 'query'] });
  });

  it('[M0.canvas] renders its filters in the back layer, the kinds with Lyrics among them and the library scope, and nowhere on the front layer', () => {
    const groups = elements(frame.controls).filter((e) => e.component === 'ButtonGroup');
    expect(groups.map((g) => g.props.items)).toEqual([
      { kind: 'binding', path: ['data', 'kinds'] },
      { kind: 'binding', path: ['data', 'scopes'] },
    ]);
    const label = (list: unknown) => (list as { label: string }[]).map((k) => k.label);
    expect(label(data.kinds)).toContain('Lyrics');
    expect(label(data.kinds)[0]).toBe('All');
    expect(label(data.scopes)).toEqual(['Everywhere', 'In your library', 'Outside']);
    const front = [...elements(frame.subheader), ...frame.content.flatMap((c) => elements(c))];
    expect(front.filter((e) => ['ButtonGroup', 'Chip'].includes(e.component))).toEqual([]);
  });

  it('[M0.canvas] names the active filters in the results header, which conceals the back layer', () => {
    const header = elements(frame.subheader).find((e) => e.component === 'SortFilterBar');
    expect(header?.props.label).toEqual({ kind: 'binding', path: ['data', 'activeFilters'] });
  });

  it('[M0.canvas] shows the single top result first, then your library, then outside it', () => {
    expect(sections(tree)).toEqual(['Top result', 'In your library', 'Not in your library']);
    const top = found.filter(({ row }) => JSON.stringify(row.props.title).includes('"top"'));
    expect(top).toHaveLength(1);
    expect(found[0]).toBe(top[0]);
  });

  it('[M0.canvas] gives no owned result a request action, a status or a tone', () => {
    const owned = found.filter(
      ({ of, row }) => of === 'data.library' || JSON.stringify(row.props.title).includes('"top"'),
    );
    // The top result's row, and the one row drawn for each library result.
    expect(owned).toHaveLength(2);
    for (const { row } of owned) {
      for (const prop of ['trailing', 'status', 'tone'])
        expect(Object.keys(row.props)).not.toContain(prop);
    }
    for (const item of [data.top as Row, ...(data.library as Row[])]) {
      for (const key of ['action', 'requested', 'status', 'tone'])
        expect(Object.keys(item)).not.toContain(key);
    }
  });

  it('[M0.canvas] plays outside music straight away, and gives outside books Request and podcasts Subscribe', () => {
    const outside = data.outside as { music: Row[]; books: Row[]; podcasts: Row[] };
    const action = (of: string) =>
      found.filter((r) => r.of === of).map(({ row }) => slotted(row, 'trailing')?.component);
    // One row is drawn for each list, whatever its length.
    expect(action('data.outside.music')).toEqual([undefined]);
    expect(action('data.outside.books')).toEqual(['Button']);
    expect(action('data.outside.podcasts')).toEqual(['Button']);
    for (const book of outside.books) {
      expect(book.action).toBe(book.requested ? 'Requested' : 'Request');
      if (book.requested) expect(toneOf(book.status as string)).toBe(book.tone);
      else expect([book.status, book.tone]).toEqual([null, null]);
    }
    for (const show of outside.podcasts) expect(show.action).toBe('Subscribe');
  });

  it('[M0.canvas] leads from outside your library to Requests', () => {
    const outside = elements(tree).find(
      (e) =>
        e.component === 'Section' &&
        e.props.title?.kind === 'literal' &&
        e.props.title.value === 'Not in your library',
    );
    expect(outside?.props.actionText).toEqual({ kind: 'literal', value: 'Your requests' });
  });
});

describe('Shelf', () => {
  const { tree, data } = readPage('shelf');

  it('[M0.canvas] binds only the shelf: its eyebrow, subject, subject art and items', () => {
    expect(dataRoots(tree)).toEqual(['eyebrow', 'items', 'round', 'subject', 'subjectArt']);
    expect(bindings(tree).filter((p) => p.startsWith('shell.'))).toEqual([]);
  });

  it('[M0.canvas] names the shelf once, in its header over the items, not again in the heading', () => {
    const slot = framed(framePage(tree), 'Shelf', {}) as Element;
    const back = slot.props.back?.kind === 'slot' ? (slot.props.back.tree as Element) : undefined;
    expect(back?.props.title).toEqual({ kind: 'literal', value: 'Shelf' });
    expect(Object.keys(data)).not.toContain('title');
  });

  it('[M0.canvas] never holds its own subject\'s work in a "More like" shelf', () => {
    for (const item of data.items as Row[]) {
      expect(item.sub).not.toMatch(new RegExp(` · ${data.subject as string}$`));
    }
  });

  it('[M0.canvas] heads its items with the shelf, as on Browse, and the grid or list toggle', () => {
    const header = elements(tree).find((e) => e.component === 'Section');
    expect(header?.props.eyebrow).toEqual({ kind: 'binding', path: ['data', 'eyebrow'] });
    expect(header?.props.title).toEqual({ kind: 'binding', path: ['data', 'subject'] });
    expect(header?.props.image).toEqual({ kind: 'binding', path: ['data', 'subjectArt'] });
    expect(slotted(header!, 'trailing')?.component).toBe('ViewToggle');
  });

  it('[M0.canvas] has a local search in its back layer, scoped to the shelf', () => {
    expect(framePage(tree).search).toBe('Search this shelf');
  });
});

describe('Requests', () => {
  const { tree, data } = readPage('requests');
  const inFlight = data.inFlight as Row[];
  const needsChoice = data.needsChoice as (Row & { candidates: Row[] })[];

  it('[M0.canvas] binds only the requests in flight and those that need a choice', () => {
    expect(dataRoots(tree)).toEqual(['inFlight', 'needsChoice']);
    expect(bindings(tree).filter((p) => p.startsWith('shell.'))).toEqual([]);
  });

  it('[M0.canvas] holds albums and books only, never a podcast', () => {
    for (const request of [...inFlight, ...needsChoice]) {
      expect(request.meta).toMatch(/^(Album|Book) · /);
    }
  });

  it('[M0.canvas] shows each request with its source and size, and its status in its tone', () => {
    for (const request of [...inFlight, ...needsChoice]) {
      expect(toneOf(request.status as string)).toBe(request.tone);
    }
    for (const request of inFlight.filter((r) =>
      /^Downloading|^Importing|^Failed/.test(r.status as string),
    )) {
      expect(request.meta).toMatch(/ · (Prowlarr|AudiobookBay) · [\d.]+ [MG]B$/);
    }
  });

  it('[M0.canvas] shows each download in flight at its own percentage', () => {
    const shown = inFlight.map((r) => /(\d+)%$/.exec(r.status as string)?.[1]).filter(Boolean);
    expect(shown.length).toBeGreaterThanOrEqual(2);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('[M0.canvas] retries a failed request and cancels any other', () => {
    for (const request of inFlight) {
      const failed = request.status === 'Failed';
      expect([request.action, request.actionIcon]).toEqual(
        failed ? ['Retry', 'refresh'] : ['Cancel', 'close'],
      );
    }
  });

  it('[M0.canvas] lists a Needs choice request with its candidates, each chosen in one tap', () => {
    const candidates = rows(tree).filter(({ of }) => of === 'request.candidates');
    expect(candidates).toHaveLength(1);
    const choose = slotted(candidates[0]!.row, 'trailing');
    expect(choose?.component).toBe('Button');
    expect(choose?.children).toEqual([{ kind: 'text', value: 'Choose' }]);
    for (const request of needsChoice) {
      expect(request.status).toBe('Needs choice');
      expect(request.candidates.length).toBeGreaterThanOrEqual(2);
      for (const c of request.candidates) expect(c.meta).toMatch(/ · [\d.]+ [MG]B · \d+ seeders$/);
    }
  });
});

describe('Not found', () => {
  const { tree, data } = readPage('notFound');

  it('[M0.canvas] is a plain Sonora empty state whose one way on is Browse', () => {
    const empty = elements(tree).find((e) => e.component === 'EmptyState');
    expect(empty).toBeDefined();
    const action = slotted(empty!, 'action');
    expect(action?.component).toBe('Button');
    expect(action?.children).toEqual([{ kind: 'text', value: 'Go to Browse' }]);
    expect(bindings(tree)).toEqual([]);
    expect(data).toEqual({});
  });
});

describe('every placeholder', () => {
  const dir = join(REPO_ROOT, APP_DIR, 'placeholders');
  const ids = readdirSync(dir).map((f) => f.replace(/\.json$/, ''));

  /** Every object in `value` with a `status`, with the placeholder it is in. */
  const statused = (value: unknown, into: Row[] = []): Row[] => {
    if (Array.isArray(value)) value.forEach((v) => statused(v, into));
    else if (value !== null && typeof value === 'object') {
      if ('status' in value) into.push(value as Row);
      Object.values(value).forEach((v) => statused(v, into));
    }
    return into;
  };

  it('[M0.canvas] gives no book request Needs choice: that is for album torrents, and books pick automatically', () => {
    const books = ids.flatMap((id) =>
      statused(readPage(id).data).filter(
        (item) => id === 'books' || /^Book · /.test(String(item.meta ?? item.sub ?? '')),
      ),
    );
    expect(books.length).toBeGreaterThan(0);
    expect(books.filter((b) => b.status === 'Needs choice')).toEqual([]);
  });
});
