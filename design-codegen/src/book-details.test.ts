import { describe, expect, it } from 'vitest';
import type { PageTree } from './page.js';
import { framePage } from './shell.js';
import { dataRoots, elements, readPage, shown, type Element } from './test-pages.js';

type Row = Record<string, unknown>;
type Card = Row & {
  title: string;
  ref: string;
  absent: boolean;
  status: string | null;
  tone: string | null;
  progress: number | null;
};

const one = (tree: PageTree, component: string): Element => {
  const found = elements(tree).filter((e) => e.component === component);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const slotted = (e: Element, prop: string): Element | undefined => {
  const v = e.props[prop];
  return v?.kind === 'slot' && v.tree.kind === 'element' ? v.tree : undefined;
};
const lit = (value: string | number | boolean | null) => ({ kind: 'literal', value });
const bound = (...path: string[]) => ({ kind: 'binding', path });
const opens = (page: string, ...path: string[]) => ({
  kind: 'open',
  page,
  params: { ref: path },
});
const sectionTitles = (tree: PageTree) =>
  elements(tree)
    .filter((e) => e.component === 'Section' && e.props.title !== undefined)
    .map((e) => e.props.title);
const cards = (tree: PageTree) => elements(tree).filter((e) => e.component === 'MediaCard');
/** The Each item a card is drawn for, read from its bound title. */
const itemOf = (card: Element) =>
  card.props.title?.kind === 'binding' ? card.props.title.path[0]! : '';

/**
 * A book you own plays and is never requestable; one you don't is greyed with no request yet, or
 * carries its request's live status in the progress tone (docs/plan/06-get.md).
 */
function holdsToOwnership(book: Card) {
  const owned = !book.absent && book.status === null;
  if (owned) expect([book.status, book.tone], book.title).toEqual([null, null]);
  else if (book.status === null)
    expect([book.absent, book.progress], book.title).toEqual([true, null]);
  else {
    expect([book.absent, book.tone, book.progress], book.title).toEqual([false, 'progress', null]);
    expect(book.status).toMatch(/^Downloading · \d+%$/);
  }
}

/** Every requestable card a page draws greys what you don't own and carries a request's status. */
function greysTheUnowned(tree: PageTree) {
  for (const card of cards(tree)) {
    const item = itemOf(card);
    expect(card.props.absent, `${item} at line ${card.line}`).toEqual(bound(item, 'absent'));
    expect(card.props.status).toEqual(bound(item, 'status'));
    expect(card.props.tone).toEqual(bound(item, 'tone'));
  }
}

describe('Book', () => {
  const { tree, data } = readPage('book');
  const header = one(tree, 'MediaHeader');
  const chapters = data.chapters as (Row & { number: number; meta: string })[];
  const narrations = data.narrations as (Row & { narrator: string; absent: boolean })[];
  const more = data.more as Record<string, { title: string; items: Card[] }>;

  it('[M0.canvas] binds only the book: name, kind, author, series, meta, progress, art, download, menu, chapters, about, narrations and more', () => {
    expect(dataRoots(tree)).toEqual([
      'about',
      'author',
      'authorRef',
      'chapters',
      'download',
      'image',
      'kind',
      'menu',
      'meta',
      'more',
      'narrations',
      'progress',
      'series',
      'title',
    ]);
  });

  it("[M0.canvas] names the book once, in the page's heading, with a local search over its chapters", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(framePage(tree).search).toBe("Search this book's chapters");
    expect(Object.keys(header.props)).not.toContain('title');
  });

  it("[M0.canvas] opens the author's page from its author line and the series' page from its series and number", () => {
    expect(header.props.onSubtitle).toEqual(opens('author', 'data', 'authorRef'));
    expect(header.props.partOf).toEqual(bound('data', 'series', 'label'));
    expect(header.props.onPartOf).toEqual(opens('series', 'data', 'series', 'ref'));
    expect((data.series as Row).label).toMatch(/ · Book \d+$/);
  });

  it('[M0.canvas] resumes where you left off or plays next, keeps it on a phone, and shows how far in you are', () => {
    expect([header.props.playLabel, header.props.nextLabel, header.props.lastLabel]).toEqual([
      lit('Resume'),
      lit('Play next'),
      lit(null),
    ]);
    expect(header.props.download).toEqual(bound('data', 'download'));
    expect(header.props.progress).toEqual(bound('data', 'progress'));
    expect(data.meta).toMatch(/ left · /);
    expect(slotted(header, 'menu')?.component).toBe('OverflowMenu');
  });

  it('[M0.canvas] is owned, so nothing on it offers to request it, given or bound', () => {
    expect(typeof data.progress).toBe('number');
    for (const { element, values, text } of shown(tree, data)) {
      if (element.component === 'MediaCard') continue;
      const said = [...Object.keys(element.props).flatMap(values), ...text];
      const asked = said.filter((v) => typeof v === 'string' && /request/i.test(v));
      expect(asked, `${element.component} at line ${element.line}`).toEqual([]);
    }
  });

  it('[M0.canvas] lists its chapters in order on one timeline, the one you are in marked with what is left of it', () => {
    const row = one(tree, 'ResultRow');
    expect(row.props.number).toEqual(bound('chapter', 'number'));
    expect(row.props.status).toEqual(bound('chapter', 'status'));
    expect(chapters.map((c) => c.number)).toEqual(chapters.map((_, i) => i + 1));
    const starts = chapters.map((c) => {
      const [h, m] = c.meta.split(' · ')[0]!.split(':').map(Number);
      return h! * 60 + m!;
    });
    expect(starts[0]).toBe(0);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    const current = chapters.filter((c) => c.status !== null);
    expect(current).toHaveLength(1);
    expect(current[0]!.status).toMatch(/^\d+ min left$/);
  });

  it('[M0.canvas] names the narrator only when you own more than one narration of it', () => {
    const ownedOthers = narrations.filter((n) => !n.absent && n.status === null).length;
    expect(ownedOthers).toBeGreaterThan(0);
    expect(data.meta).toMatch(/^Read by /);
  });

  it('[M0.canvas] lists the other narrations of the same book, never this one, each opening its own page', () => {
    const card = cards(tree).find((c) => itemOf(c) === 'narration')!;
    expect(card.props.title).toEqual(bound('narration', 'narrator'));
    expect(card.props.onClick).toEqual(opens('book', 'narration', 'ref'));
    expect(narrations.length).toBeGreaterThan(0);
    expect(data.meta).not.toMatch(new RegExp(narrations.map((n) => n.narrator).join('|')));
    expect(narrations.some((n) => n.absent)).toBe(true);
  });

  it('[M0.canvas] shows the chapters, then about, then other narrations, then the rest of the series and more by the author', () => {
    expect(sectionTitles(tree)).toEqual([
      lit('Chapters'),
      lit('About'),
      lit('Other narrations'),
      bound('data', 'more', 'series', 'title'),
      bound('data', 'more', 'author', 'title'),
    ]);
    expect(more.series!.items.map((b) => b.title)).not.toContain(data.title);
    expect(more.author!.items.map((b) => b.title)).not.toContain(data.title);
  });

  it('[M0.canvas] greys the books you do not own, and never makes one you own requestable', () => {
    greysTheUnowned(tree);
    for (const b of [...more.series!.items, ...more.author!.items]) holdsToOwnership(b);
    for (const card of cards(tree).filter((c) => itemOf(c) !== 'narration'))
      expect(card.props.onClick).toEqual(opens('book', itemOf(card), 'ref'));
  });
});

describe('Author', () => {
  const { tree, data } = readPage('author');
  const header = one(tree, 'MediaHeader');
  const series = data.series as { title: string; ref: string; books: Card[] }[];
  const books = data.books as Card[];

  it('[M0.canvas] binds only the author: name, kind, meta, photo, series and books', () => {
    expect(dataRoots(tree)).toEqual(['books', 'image', 'kind', 'meta', 'series', 'title']);
  });

  it("[M0.canvas] is headed by the author's name, with a round photo and no queue buttons", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(header.props.round).toEqual(lit(true));
    expect(Object.keys(header.props)).not.toContain('title');
    for (const label of ['playLabel', 'nextLabel', 'lastLabel'])
      expect(header.props[label]).toEqual(lit(null));
  });

  it('[M0.canvas] shows each series in order, headed by a link to its page, then every book', () => {
    expect(sectionTitles(tree)).toEqual([bound('series', 'title'), lit('Books')]);
    const heading = elements(tree).find((e) => e.component === 'Section' && e.props.onSubject)!;
    expect(heading.props.onSubject).toEqual(opens('series', 'series', 'ref'));
    for (const s of series) {
      expect(
        s.books.map((b) => b.sub),
        s.title,
      ).toEqual(s.books.map((_, i) => `Book ${i + 1}`));
    }
    const inSeries = series.flatMap((s) => s.books.map((b) => b.title));
    for (const title of inSeries) expect(books.map((b) => b.title)).toContain(title);
  });

  it('[M0.canvas] greys every book you do not own and never makes one you own requestable, each opening its page', () => {
    greysTheUnowned(tree);
    for (const card of cards(tree))
      expect(card.props.onClick).toEqual(opens('book', itemOf(card), 'ref'));
    for (const b of [...books, ...series.flatMap((s) => s.books)]) holdsToOwnership(b);
    expect(books.some((b) => b.absent)).toBe(true);
    const owned = books.filter((b) => !b.absent && b.status === null).length;
    expect(data.meta).toBe(`${books.length} books · ${owned} in your library`);
  });
});

describe('Series', () => {
  const { tree, data } = readPage('series');
  const header = one(tree, 'MediaHeader');
  const books = data.books as (Card & { number: number; eyebrow: string })[];

  it('[M0.canvas] binds only the series: name, kind, author, meta, art and books', () => {
    expect(dataRoots(tree)).toEqual([
      'author',
      'authorRef',
      'books',
      'image',
      'kind',
      'meta',
      'title',
    ]);
  });

  it("[M0.canvas] is headed by the series' name over its book count and length, its author a link", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(Object.keys(header.props)).not.toContain('title');
    expect(header.props.onSubtitle).toEqual(opens('author', 'data', 'authorRef'));
    expect(data.meta).toMatch(new RegExp(`^${books.length} books · \\d+ h \\d+ m`));
  });

  it('[M0.canvas] lists its books in series order, each with its number', () => {
    expect(one(tree, 'MediaCard').props.eyebrow).toEqual(bound('book', 'eyebrow'));
    expect(books.map((b) => b.number)).toEqual(books.map((_, i) => i + 1));
    for (const b of books) expect(b.eyebrow).toBe(`Book ${b.number}`);
  });

  it('[M0.canvas] shows progress on the books you own, greys the rest, and never makes one you own requestable', () => {
    greysTheUnowned(tree);
    expect(one(tree, 'MediaCard').props.progress).toEqual(bound('book', 'progress'));
    expect(one(tree, 'MediaCard').props.onClick).toEqual(opens('book', 'book', 'ref'));
    for (const b of books) holdsToOwnership(b);
    expect(books.some((b) => typeof b.progress === 'number')).toBe(true);
    expect(books.some((b) => b.absent)).toBe(true);
  });
});
