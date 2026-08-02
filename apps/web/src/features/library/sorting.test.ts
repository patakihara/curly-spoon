/**
 * Pure logic for the library browse control bar. No DOM, no network — these
 * functions are exercised directly so the sort/filter behaviour is pinned
 * independently of whatever chrome `LibraryPage` wraps around it.
 */
import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../api/types.js';
import { filterItems, sortItems } from './sorting.js';

function item(overrides: Partial<LibraryItem> & { id: string }): LibraryItem {
  return {
    libraryId: 'lib-books',
    coverPath: null,
    progress: null,
    ...overrides,
    media: {
      kind: 'book',
      title: 'Untitled',
      ...overrides.media,
    },
  };
}

describe('sortItems', () => {
  it('sorts by title case-insensitively', () => {
    const items = [
      item({ id: 'a', media: { kind: 'book', title: 'zoo' } }),
      item({ id: 'b', media: { kind: 'book', title: 'Apple' } }),
      item({ id: 'c', media: { kind: 'book', title: 'banana' } }),
    ];

    expect(sortItems(items, 'title').map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by author, falling back to media.author when authors is absent, with neither sorting last', () => {
    const items = [
      item({
        id: 'has-authors',
        media: { kind: 'book', title: 't', authors: [{ id: 'x', name: 'Zed' }] },
      }),
      item({ id: 'has-author-string', media: { kind: 'book', title: 't', author: 'Ann' } }),
      item({ id: 'has-neither', media: { kind: 'book', title: 't' } }),
    ];

    expect(sortItems(items, 'author').map((i) => i.id)).toEqual([
      'has-author-string',
      'has-authors',
      'has-neither',
    ]);
  });

  it('sorts by duration, putting items with no duration last', () => {
    const items = [
      item({ id: 'long', media: { kind: 'book', title: 't', duration: 1000 } }),
      item({ id: 'no-duration', media: { kind: 'book', title: 't' } }),
      item({ id: 'short', media: { kind: 'book', title: 't', duration: 10 } }),
    ];

    expect(sortItems(items, 'duration').map((i) => i.id)).toEqual(['short', 'long', 'no-duration']);
  });

  it('falls back to id descending for "added", as a placeholder until the BFF exposes addedAt', () => {
    const items = [item({ id: 'a' }), item({ id: 'c' }), item({ id: 'b' })];

    expect(sortItems(items, 'added').map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate the input array', () => {
    const items = [
      item({ id: 'b', media: { kind: 'book', title: 'b' } }),
      item({ id: 'a', media: { kind: 'book', title: 'a' } }),
    ];
    const original = [...items];

    sortItems(items, 'title');

    expect(items).toEqual(original);
  });
});

describe('filterItems', () => {
  const items = [
    item({ id: 'dune', media: { kind: 'book', title: 'Dune', author: 'Frank Herbert' } }),
    item({ id: 'hobbit', media: { kind: 'book', title: 'The Hobbit', author: 'J.R.R. Tolkien' } }),
    item({
      id: 'finished',
      media: { kind: 'book', title: 'Finished Book', author: 'Someone' },
      progress: {
        id: 'p1',
        libraryItemId: 'finished',
        episodeId: null,
        duration: 100,
        currentTime: 100,
        progress: 1,
        isFinished: true,
      },
    }),
  ];

  it('matches on title, case-insensitively', () => {
    expect(filterItems(items, { query: 'dUnE', hideFinished: false }).map((i) => i.id)).toEqual([
      'dune',
    ]);
  });

  it('matches on author, case-insensitively', () => {
    expect(filterItems(items, { query: 'tolkien', hideFinished: false }).map((i) => i.id)).toEqual([
      'hobbit',
    ]);
  });

  it('hideFinished removes only items marked isFinished', () => {
    const result = filterItems(items, { query: '', hideFinished: true });

    expect(result.map((i) => i.id)).toEqual(['dune', 'hobbit']);
  });

  it('does not mutate the input array', () => {
    const original = [...items];

    filterItems(items, { query: 'dune', hideFinished: true });

    expect(items).toEqual(original);
  });
});
