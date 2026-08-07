/**
 * Unit coverage for `ChapterList.tsx`'s exported `chapterToQueueEntry` — the pure conversion
 * from a `Chapter` marker into a queueable `AudiobookQueueEntry` of `kind: 'chapter'`. See
 * `QueueView.test.tsx`'s header for why this repo's `.test.tsx` files test pure logic rather
 * than render the component: no `jsdom`/`@testing-library/react` is installed here, and this
 * wave may not add either. The click-to-queue behaviour itself is covered by
 * `e2e/app/queue-view.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { chapterToQueueEntry } from './ChapterList.js';
import type { Chapter, LibraryItem } from '../../api/types.js';

const chapter: Chapter = { id: 2, start: 630, end: 1260, title: 'Part Two' };

const book: LibraryItem = {
  id: 'item-dune',
  libraryId: 'lib-1',
  coverPath: null,
  media: { kind: 'book', title: 'Dune' },
  progress: null,
};

describe('chapterToQueueEntry', () => {
  it('builds a chapter queue entry carrying the book’s id and title, and the chapter’s own start/title', () => {
    expect(chapterToQueueEntry(chapter, book)).toEqual({
      kind: 'chapter',
      itemId: 'item-dune',
      chapterId: '2',
      title: 'Part Two',
      bookTitle: 'Dune',
      start: 630,
    });
  });

  it('stringifies the chapter’s numeric id — `AudiobookQueueEntry.chapterId` is a string, `Chapter.id` is a number', () => {
    const entry = chapterToQueueEntry({ ...chapter, id: 7 }, book);
    expect(entry.kind).toBe('chapter');
    if (entry.kind === 'chapter') {
      expect(entry.chapterId).toBe('7');
      expect(typeof entry.chapterId).toBe('string');
    }
  });
});
