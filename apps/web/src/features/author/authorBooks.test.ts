import { describe, expect, it } from 'vitest';
import { findAuthorBooks, type LibraryItemWithAuthors } from './authorBooks.js';

function item(
  id: string,
  title: string,
  authors: Array<{ id: string; name: string }>,
): LibraryItemWithAuthors {
  return { id, media: { title, authors } };
}

describe('findAuthorBooks', () => {
  it('returns every book naming this author id, sorted by title', () => {
    const items = [
      item('b-zebra', 'Zebra Tales', [{ id: 'author-1', name: 'Ann Author' }]),
      item('b-apple', 'Apple Tales', [{ id: 'author-1', name: 'Ann Author' }]),
      item('b-other', 'Someone Else', [{ id: 'author-2', name: 'Other Writer' }]),
    ];
    const result = findAuthorBooks('author-1', items);
    expect(result?.authorName).toBe('Ann Author');
    expect(result?.books.map((b) => b.id)).toEqual(['b-apple', 'b-zebra']);
  });

  it('matches a book with multiple authors on any of them', () => {
    const items = [
      item('b-co', 'Co-Written', [
        { id: 'author-1', name: 'Ann Author' },
        { id: 'author-2', name: 'Other Writer' },
      ]),
    ];
    expect(findAuthorBooks('author-2', items)?.books.map((b) => b.id)).toEqual(['b-co']);
  });

  it('returns null for an author id no book names, rather than an empty result', () => {
    const items = [item('b1', 'Book One', [{ id: 'author-1', name: 'Ann Author' }])];
    expect(findAuthorBooks('author-does-not-exist', items)).toBeNull();
  });

  it('degrades a book with no authors field at all rather than throwing', () => {
    const items: LibraryItemWithAuthors[] = [{ id: 'b1', media: { title: 'No Authors' } }];
    expect(findAuthorBooks('author-1', items)).toBeNull();
  });
});
