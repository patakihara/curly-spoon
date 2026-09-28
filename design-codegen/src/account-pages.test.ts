import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNav } from './nav.js';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import type { PageTree } from './page.js';
import { bindings, dataRoots, elements, readPage, shown, type Element } from './test-pages.js';

type Row = Record<string, unknown>;

const nav = readNav(join(REPO_ROOT, APP_DIR));
const structureOf = (id: string) => nav.pages.find((p) => p.id === id)!.structure;

const literal = (e: Element, prop: string) => {
  const v = e.props[prop];
  return v?.kind === 'literal' ? v.value : undefined;
};
const slotted = (e: Element, prop: string): Element | undefined => {
  const v = e.props[prop];
  return v?.kind === 'slot' && v.tree.kind === 'element' ? v.tree : undefined;
};
const titled = (tree: PageTree) =>
  elements(tree)
    .filter((e) => e.component === 'Section' && e.props.title !== undefined)
    .map((e) => literal(e, 'title'));
/** The pages a page's handlers open, literal or bound. */
const opened = (tree: PageTree) =>
  elements(tree).flatMap((e) =>
    Object.values(e.props).flatMap((v) =>
      v.kind === 'open' ? [typeof v.page === 'string' ? v.page : v.page.path.join('.')] : [],
    ),
  );

describe('Downloads', () => {
  const { tree, data } = readPage('downloads');
  const downloaded = data.downloaded as Row[];
  const inProgress = data.inProgress as Row[];

  it('[M0.canvas] draws its structure: Downloaded, then In progress', () => {
    expect(titled(tree)).toEqual(structureOf('downloads').sections.map((s) => s.name));
  });

  it('[M0.canvas] binds only what is on the phone: the total, what is downloaded and what is still coming', () => {
    expect(dataRoots(tree)).toEqual(['downloaded', 'inProgress', 'total']);
    expect(bindings(tree).filter((p) => p.startsWith('shell.'))).toEqual([]);
  });

  it('[M0.canvas] says first how much space the downloads take', () => {
    const first = elements(tree).find((e) => ['ValueRow', 'ResultRow'].includes(e.component));
    expect(first?.component).toBe('ValueRow');
    expect(data.total).toMatch(/^[\d.]+ [MG]B · [\d.]+ [MG]B free$/);
  });

  it('[M0.canvas] gives each download its size and a way to remove it', () => {
    const rows = shown(tree, data).filter(
      (s) => s.element.component === 'ResultRow' && s.within[0] === 'data.downloaded',
    );
    expect(rows).toHaveLength(1);
    const remove = slotted(rows[0]!.element, 'trailing');
    expect(remove && literal(remove, 'label')).toBe('Remove');
    for (const item of downloaded) expect(item.meta).toMatch(/ · [\d.]+ [MG]B$/);
  });

  it('[M0.canvas] shows a book as one item, however many files it is', () => {
    const books = downloaded.filter((i) => String(i.meta).startsWith('Book · '));
    expect(books.some((b) => /\d+ files/.test(String(b.meta)))).toBe(true);
    expect(new Set(books.map((b) => b.title)).size).toBe(books.length);
  });

  it('[M0.canvas] shows what is still downloading with its progress, each one cancellable', () => {
    const row = elements(tree).filter((e) => e.component === 'ResultRow')[1]!;
    const cancel = slotted(row, 'trailing');
    expect(cancel && literal(cancel, 'label')).toBe('Cancel');
    for (const item of inProgress) {
      expect(item.status).toMatch(/^(Downloading · \d+%|Queued)$/);
      expect(item.tone).toBe('progress');
    }
  });

  it('[M0.canvas] is on Android only, reached from Settings', () => {
    expect(nav.pages.find((p) => p.id === 'downloads')?.platforms).toEqual(['android']);
    expect(structureOf('settings').links).toContain('downloads');
  });
});

describe('Setup', () => {
  const { tree, data } = readPage('setup');

  it('[M0.canvas] takes its steps in order: the one-time code, services, providers, request approval', () => {
    expect(titled(tree)).toEqual(['One-time code', 'Services', 'Providers', 'Requests']);
    const steps = elements(tree)
      .filter((e) => e.component === 'Section' && e.props.eyebrow !== undefined)
      .map((e) => literal(e, 'eyebrow'));
    expect(steps).toEqual(['Step 1 of 4', 'Step 2 of 4', 'Step 3 of 4', 'Step 4 of 4']);
  });

  it('[M0.canvas] asks first for the code the server wrote to its data folder', () => {
    const field = elements(tree).find((e) => e.component === 'FieldRow')!;
    expect(field.props.placeholder).toEqual({ kind: 'binding', path: ['data', 'codeHint'] });
    expect(data.codeHint).toMatch(/data folder/);
  });

  it('[M0.canvas] connects Audiobookshelf, Jellyfin and the household sign-on', () => {
    const services = (data.services as Row[]).map((s) => s.label);
    expect(services).toEqual(['Audiobookshelf', 'Jellyfin', 'Household sign-on']);
    for (const s of data.services as Row[]) expect(s.address).toMatch(/\.example\.org$/);
  });

  it('[M0.canvas] says plainly that nobody signs up in Auralis', () => {
    expect(data.intro).toMatch(/^Nobody signs up in Auralis/);
    expect(elements(tree).find((e) => e.component === 'StatusBanner')).toBeDefined();
  });

  it('[M0.canvas] goes to Browse when done, and nowhere else', () => {
    expect(opened(tree)).toEqual(['browse']);
    expect(structureOf('setup').links).toEqual(['browse']);
  });
});

describe('Sign in', () => {
  const { tree, data } = readPage('signIn');

  it('[M0.canvas] has one button, to the household sign-in, and no password field', () => {
    const all = elements(tree);
    expect(all.filter((e) => e.component === 'Button')).toHaveLength(1);
    for (const field of ['FieldRow', 'Input', 'SearchField']) {
      expect(all.map((e) => e.component)).not.toContain(field);
    }
  });

  it('[M0.canvas] says why signing in failed for someone outside the household, with a way to try again', () => {
    const banner = elements(tree).find((e) => e.component === 'StatusBanner')!;
    expect(literal(banner, 'tone')).toBe('error');
    expect(literal(banner, 'actionLabel')).toBe('Try again');
    expect(data.error).toMatch(/isn't one of the household's/);
  });

  it('[M0.canvas] binds only its error', () => {
    expect(dataRoots(tree)).toEqual(['error']);
  });
});

describe('Shelf review', () => {
  const { tree, data } = readPage('shelfReview');
  const shelves = data.shelves as (Row & { items: Row[] })[];

  it('[M0.canvas] heads each Browse shelf as Browse does, eyebrow and subject art over the subject, opening the shelf', () => {
    const section = elements(tree).find((e) => e.component === 'Section')!;
    for (const [prop, key] of [
      ['eyebrow', 'eyebrow'],
      ['title', 'subject'],
      ['image', 'image'],
      ['round', 'round'],
    ] as const) {
      expect(section.props[prop]).toEqual({ kind: 'binding', path: ['shelf', key] });
    }
    expect(opened(tree)).toEqual(['shelf']);
    expect(shelves.length).toBeGreaterThanOrEqual(2);
  });

  it('[M0.canvas] gives every item its reason line and names its source', () => {
    const row = elements(tree).find((e) => e.component === 'ResultRow')!;
    expect(row.props.detail).toEqual({ kind: 'binding', path: ['item', 'reason'] });
    for (const item of shelves.flatMap((s) => s.items)) {
      expect(String(item.reason).length).toBeGreaterThan(0);
      expect(item.meta).toMatch(/^(Album|Book|Podcast|Episode) · .+ · [^·]+$|^Podcast · [^·]+$/);
    }
  });
});
