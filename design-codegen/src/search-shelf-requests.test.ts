import { describe, expect, it } from 'vitest';
import type { PageTree } from './page.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readNav } from './nav.js';
import { checkPage, parsePage } from './page.js';
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

  it('[M0.canvas] binds only its own query, filters, suggestions and results', () => {
    expect(dataRoots(tree)).toEqual([
      'activeFilters',
      'kinds',
      'library',
      'outside',
      'placeholder',
      'query',
      'suggestions',
      'top',
    ]);
    expect(bindings(tree).filter((p) => p.startsWith('shell.'))).toEqual([]);
  });

  it('[M0.canvas] opens with the field focused on the query, in the back layer', () => {
    const field = elements(frame.controls).find((e) => e.component === 'SearchField');
    expect(field?.props.autoFocus).toEqual({ kind: 'literal', value: true });
    expect(field?.props.value).toEqual({ kind: 'binding', path: ['data', 'query'] });
  });

  it('[M0.canvas] renders its kind filters in the back layer, with no Lyrics chip and no library scope, and nowhere on the front layer', () => {
    const groups = elements(frame.controls).filter((e) => e.component === 'ButtonGroup');
    expect(groups.map((g) => g.props.items)).toEqual([
      { kind: 'binding', path: ['data', 'kinds'] },
    ]);
    const label = (list: unknown) => (list as { label: string }[]).map((k) => k.label);
    expect(label(data.kinds)).not.toContain('Lyrics');
    expect(label(data.kinds)[0]).toBe('All');
    expect(data).not.toHaveProperty('scopes');
    expect(String(data.activeFilters)).not.toMatch(/Everywhere|library|Outside/);
    const front = [...elements(frame.subheader), ...frame.content.flatMap((c) => elements(c))];
    expect(front.filter((e) => ['ButtonGroup', 'Chip'].includes(e.component))).toEqual([]);
  });

  it('[M0.canvas] matches songs on their lyrics too, a song found by a line showing that line in its row', () => {
    const results = [data.top, ...(data.library as Row[])] as { meta: string }[];
    const byLine = results.filter((r) => /“[^”]+”/.test(r.meta));
    expect(byLine.length).toBeGreaterThan(0);
    for (const { meta } of byLine) expect(meta).toMatch(/^Song · /);
    for (const { meta } of results) expect(meta).not.toMatch(/^Lyrics/);
  });

  it('[M0.canvas] names the active filters in the results header, which conceals the back layer', () => {
    const header = elements(frame.subheader).find((e) => e.component === 'SortFilterBar');
    expect(header?.props.label).toEqual({ kind: 'binding', path: ['data', 'activeFilters'] });
  });

  it('[M0.canvas] shows the single top result first, then your library, then outside it', () => {
    expect(sections(tree)).toEqual([
      undefined,
      'Top result',
      'In your library',
      'Not in your library',
    ]);
    const results = found.filter((r) => r.of !== 'data.suggestions');
    const top = results.filter(({ row }) => JSON.stringify(row.props.title).includes('"top"'));
    expect(top).toHaveLength(1);
    expect(results[0]).toBe(top[0]);
  });

  /** PageBody's children: what the page draws in each state. */
  const body = () => {
    const page = frame.content.find((c) => c.kind === 'element' && c.component === 'PageBody');
    return page !== undefined && 'children' in page ? page.children : [];
  };
  const when = (state: string) =>
    body().filter(
      (c): c is Extract<PageTree, { kind: 'when' }> => c.kind === 'when' && c.state === state,
    );

  it('types the query in its field and runs the search when the field is submitted', () => {
    const field = elements(frame.controls).find((e) => e.component === 'SearchField');
    expect(field?.props.onChange).toEqual({ kind: 'query' });
    expect(field?.props.onSubmit).toEqual({ kind: 'query' });
  });

  it('lists suggestions first while typing, each choice running the search with its text', () => {
    expect(body()[0]).toMatchObject({ kind: 'when', state: 'suggest' });
    const [suggest] = when('suggest');
    const held = elements(suggest);
    expect(held.map((e) => e.component)).toEqual(['Section', 'ResultRow']);
    expect(held[0]!.props.title).toBeUndefined();
    const listed = found.filter((r) => r.of === 'data.suggestions');
    expect(listed).toHaveLength(1);
    const row = listed[0]!.row;
    expect(row).toBe(held[1]);
    expect(row.props.title).toEqual({ kind: 'binding', path: ['s', 'title'] });
    expect(row.props.meta).toEqual({ kind: 'binding', path: ['s', 'meta'] });
    expect(row.props.onClick).toEqual({
      kind: 'open',
      page: 'search',
      params: { q: ['s', 'query'] },
    });
    expect(row.props.onAction).toBeUndefined();
    const suggestions = data.suggestions as Row[];
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions)
      for (const key of ['title', 'meta', 'query']) expect(typeof s[key], key).toBe('string');
  });

  it('draws the results, all three sections of them, only once the search has run', () => {
    expect(body().map((c) => (c.kind === 'when' ? c.state : c.kind))).toEqual([
      'suggest',
      'empty',
      'failed',
      'full',
    ]);
    const [full] = when('full');
    expect(
      full!.children.map((c) =>
        c.kind === 'element' && c.props.title?.kind === 'literal' ? c.props.title.value : c.kind,
      ),
    ).toEqual(['Top result', 'In your library', 'Not in your library']);
  });

  it.each([
    ['empty', 'search_off', 'Nothing found', 'Nothing in your library matches this search.'],
    ['failed', 'cloud_off', 'Search failed', 'The server did not answer this search.'],
  ])(
    "says, in its %s state, what happened in the page's own words, with Sonora's EmptyState alone",
    (state, icon, title, body) => {
      const [drawn, ...more] = when(state);
      expect(more).toEqual([]);
      const elements = drawn!.children.filter((c) => c.kind === 'element');
      expect(elements.map((c) => c.component)).toEqual(['EmptyState']);
      expect(elements[0]!.props).toEqual({
        icon: { kind: 'literal', value: icon },
        title: { kind: 'literal', value: title },
        body: { kind: 'literal', value: body },
      });
    },
  );

  it('opens each result in your library on a tap, a song its album, and plays it from its art on its own queue', () => {
    const owned = found.filter(
      ({ of, row }) => of === 'data.library' || JSON.stringify(row.props.title).includes('"top"'),
    );
    expect(owned).toHaveLength(2);
    for (const { row } of owned) {
      const item = (row.props.title as { path: string[] }).path.slice(0, -1);
      expect(row.props.onClick).toEqual({
        kind: 'open',
        page: { path: [...item, 'page'] },
        params: { ref: [...item, 'ref'] },
      });
      expect(row.props.onAction).toEqual({
        kind: 'play',
        queue: { path: [...item, 'queue'] },
        next: false,
        source: false,
        params: { ref: [...item, 'playRef'] },
      });
    }
    const links = new Set(
      readNav(join(REPO_ROOT, APP_DIR)).pages.find((p) => p.id === 'search')!.structure.links,
    );
    const KIND: Record<string, [string, string]> = {
      Song: ['album', 'music'],
      Album: ['album', 'music'],
      Book: ['book', 'spoken'],
      Episode: ['episode', 'spoken'],
    };
    for (const item of [data.top as Row, ...(data.library as Row[])]) {
      const kind = String(item.meta).split(' · ')[0]!;
      expect(KIND[kind], kind).toBeDefined();
      expect([item.page, item.queue], String(item.title)).toEqual(KIND[kind]);
      expect(links.has(String(item.page))).toBe(true);
      for (const key of ['ref', 'playRef']) expect(String(item[key]), key).not.toBe('');
    }
    // A song opens its album, and plays itself.
    const song = (data.library as Row[]).find((r) => String(r.meta).startsWith('Song'))!;
    expect(song.ref).not.toBe(song.playRef);
  });

  it('[M3.requests/d] plays a household item outside your library, and opens its page', () => {
    const [row] = found.filter((r) => r.of === 'data.outside.household');
    expect(row!.row.props.onAction?.kind).toBe('play');
    expect(row!.row.props.onClick?.kind).toBe('open');
  });

  it('leaves the catalogue’s rows outside your library, the kind filters and the results header unbound', () => {
    const catalogue = found.filter(
      (r) => String(r.of).startsWith('data.outside') && r.of !== 'data.outside.household',
    );
    for (const { of, row } of catalogue) {
      expect(row.props.onClick, String(of)).toBeUndefined();
      expect(row.props.onAction, String(of)).toBeUndefined();
    }
    const kinds = elements(frame.controls).find((e) => e.component === 'ButtonGroup');
    expect(kinds?.props.onChange).toBeUndefined();
    const header = elements(frame.subheader).find((e) => e.component === 'SortFilterBar');
    expect(header?.props.onClick).toBeUndefined();
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

  it('opens the Requests page from "Your requests"', () => {
    const outside = elements(tree).find((e) => e.props.actionText !== undefined);
    expect(outside?.props.onAction).toEqual({ kind: 'open', page: 'requests', params: {} });
  });
});

describe('Shelf', () => {
  const { tree, data } = readPage('shelf');

  it('[M0.canvas] binds only the shelf: its eyebrow, subject, subject art and items', () => {
    expect(dataRoots(tree)).toEqual(['eyebrow', 'items', 'round', 'subject', 'subjectArt']);
    expect(bindings(tree).filter((p) => p.startsWith('shell.'))).toEqual([]);
  });

  it('[M0.canvas] is headed in the context form, its art and eyebrow over the subject, with no header below saying it again', () => {
    const slot = framed(framePage(tree), 'Shelf', {}) as Element;
    const back = slot.props.back?.kind === 'slot' ? (slot.props.back.tree as Element) : undefined;
    expect(back?.props.title).toEqual({ kind: 'binding', path: ['data', 'subject'] });
    expect(back?.props.eyebrow).toEqual({ kind: 'binding', path: ['data', 'eyebrow'] });
    expect(back?.props.image).toEqual({ kind: 'binding', path: ['data', 'subjectArt'] });
    expect(back?.props.round).toEqual({ kind: 'binding', path: ['data', 'round'] });
    expect(data.eyebrow).toBe('More like');
    for (const header of elements(tree).filter((e) => e.component === 'Section')) {
      expect(Object.keys(header.props)).not.toContain('title');
      expect(Object.keys(header.props)).not.toContain('eyebrow');
    }
  });

  it('[M0.canvas] never holds its own subject\'s work in a "More like" shelf', () => {
    for (const item of data.items as Row[]) {
      expect(item.sub).not.toMatch(new RegExp(` · ${data.subject as string}$`));
    }
  });

  it('[M0.canvas] ends its heading with the grid or list toggle', () => {
    expect(framePage(tree).trailing).toMatchObject({ kind: 'element', component: 'ViewToggle' });
  });

  it('[M0.canvas] has a local search in its back layer, scoped to the shelf', () => {
    expect(framePage(tree).search).toBe('Search this shelf');
  });
});

describe('[M3.requests] a request’s verbs on Requests', () => {
  const { tree, data } = readPage('requests');
  const act = (e: Element | undefined, prop = 'onClick') => e?.props[prop];
  const named = (title: string) =>
    rows(tree).filter(({ row }) => JSON.stringify(row.props.title).includes(title));

  const cancels = { kind: 'act', verb: 'cancel', params: { ref: ['request', 'id'] } };
  const retries = { kind: 'act', verb: 'retry', params: { ref: ['request', 'id'] } };

  it('[M3.requests] cancels each row in flight from its trailing control', () => {
    const shown = rows(tree).filter(({ of }) => of === 'data.inFlight');
    expect(shown).toHaveLength(1);
    expect(act(slotted(shown[0]!.row, 'trailing'))).toEqual(cancels);
    expect(shown[0]!.row.props.onAction).toBeUndefined();
    for (const r of data.inFlight as Row[]) expect(r.status).not.toBe('Failed');
  });

  it('[M3.requests] offers a failed row a retry on its art and a cancel at its end', () => {
    for (const list of ['data.failed', 'data.pickable']) {
      const row = rows(tree).find(
        ({ of, row: r }) => of === list && !JSON.stringify(r.props.title).includes('Pick another'),
      )!.row;
      expect(act(row, 'onAction'), list).toEqual(retries);
      expect(act(slotted(row, 'trailing')), list).toEqual(cancels);
    }
    for (const r of [...(data.failed as Row[]), ...(data.pickable as Row[])]) {
      expect(r.status).toBe('Failed');
    }
  });

  it('[M3.requests] chooses a candidate with one tap on its row or its button', () => {
    const candidates = rows(tree).filter(({ of }) => of === 'request.candidates');
    const choose = {
      kind: 'act',
      verb: 'choose',
      params: { ref: ['request', 'id'], candidate: ['candidate', 'id'] },
    };
    expect(act(candidates[0]!.row)).toEqual(choose);
    expect(act(slotted(candidates[0]!.row, 'trailing'))).toEqual(choose);
  });

  it('[M3.requests] cancels a request waiting for a choice', () => {
    const waiting = rows(tree).filter(({ of }) => of === 'data.needsChoice');
    expect(act(slotted(waiting[0]!.row, 'trailing'))).toEqual({
      kind: 'act',
      verb: 'cancel',
      params: { ref: ['request', 'id'] },
    });
  });

  it('[M3.requests] offers another release only on a failed row with others left', () => {
    const [pick] = named('Pick another release');
    expect(pick!.of).toBe('data.pickable');
    expect(act(pick!.row)).toEqual({
      kind: 'act',
      verb: 'pickAnother',
      params: { ref: ['request', 'id'], candidate: ['request', 'next'] },
    });
    for (const request of data.pickable as Row[]) expect(request.status).toBe('Failed');
  });

  it('[M3.requests] says nothing is requested when nothing is, and opens Search', () => {
    const empty = elements(tree).filter((e) => e.component === 'EmptyState');
    expect(empty).toHaveLength(1);
    expect(slotted(empty[0]!, 'action')?.props.onClick).toEqual({
      kind: 'open',
      page: 'search',
      params: {},
    });
  });
});

describe('[M3.requests] the check on Act', () => {
  const nav = readNav(join(REPO_ROOT, APP_DIR));
  const props = new Map([['ResultRow', new Set(['onClick', 'onAction', 'onRequest'])]]);
  const handlers = new Map([['ResultRow', new Set(['onClick', 'onAction', 'onRequest'])]]);
  const pages = new Map(nav.pages.map((p) => [p.id, []] as [string, string[]]));
  const errorsOf = (source: string, data: object = { id: 'r', verb: 'retry' }) =>
    checkPage(parsePage(source, 'p'), data as never, props, undefined, undefined, undefined, {
      pages,
      handlers,
    } as never);
  const page = (handler: string) =>
    `export default function P({ data }) { return <ResultRow ${handler} />; }`;

  it('[M3.requests] takes each of the four verbs, written or bound', () => {
    for (const verb of ['retry', 'cancel', 'choose', 'pickAnother']) {
      expect(errorsOf(page(`onClick={<Act ref={data.id} verb="${verb}" />}`))).toEqual([]);
    }
    expect(errorsOf(page('onAction={<Act ref={data.id} verb={data.verb} />}'))).toEqual([]);
  });

  it('[M3.requests] refuses another verb, written or bound', () => {
    expect(() => errorsOf(page('onClick={<Act ref={data.id} verb="delete" />}'))).toThrow(/verb/);
    expect(
      errorsOf(page('onClick={<Act ref={data.id} verb={data.verb} />}'), {
        id: 'r',
        verb: 'delete',
      }),
    ).toEqual([expect.stringContaining('verb')]);
  });

  it('[M3.requests] refuses it on any prop but a row’s art or a tap', () => {
    expect(errorsOf(page('onRequest={<Act ref={data.id} verb="retry" />}'))).toEqual([
      expect.stringContaining('Act goes on'),
    ]);
  });
});

describe('Requests', () => {
  const { tree, data } = readPage('requests');
  const inFlight = data.inFlight as Row[];
  const needsChoice = data.needsChoice as (Row & { candidates: Row[] })[];

  it('[M0.canvas] binds only the requests in flight, those that failed and those that need a choice', () => {
    expect(dataRoots(tree)).toEqual(['failed', 'inFlight', 'needsChoice', 'pickable']);
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

  it('goes to Browse from "Go to Browse"', () => {
    const empty = elements(tree).find((e) => e.component === 'EmptyState')!;
    expect(slotted(empty, 'action')?.props.onClick).toEqual({
      kind: 'open',
      page: 'browse',
      params: {},
    });
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
