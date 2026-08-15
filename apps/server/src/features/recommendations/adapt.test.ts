import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '@auralis/abs-client';
import { toCandidate } from './adapt.js';

function bookItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-1',
    libraryId: 'lib-books',
    addedAt: null,
    updatedAt: null,
    coverPath: null,
    size: 0,
    progress: null,
    media: {
      kind: 'book',
      title: 'A Book',
      subtitle: null,
      authors: [{ name: 'Ada Voss' }],
      narrator: 'Elena Cross',
      series: [{ name: 'The Ember Wars', sequence: '1' }],
      genres: ['Fantasy'],
      publishedYear: null,
      description: null,
      isbn: null,
      duration: 100,
      tracks: undefined,
      chapters: undefined,
    },
    ...overrides,
  };
}

function podcastItem(author: string | null, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-2',
    libraryId: 'lib-podcasts',
    addedAt: null,
    updatedAt: null,
    coverPath: null,
    size: 0,
    progress: null,
    media: {
      kind: 'podcast',
      title: 'A Podcast',
      author,
      description: null,
      genres: ['News'],
      numEpisodes: 3,
      episodes: undefined,
    },
    ...overrides,
  };
}

describe('toCandidate', () => {
  it('passes a book through unchanged, field for field', () => {
    const item = bookItem();
    expect(toCandidate(item)).toEqual({
      id: 'item-1',
      media: {
        kind: 'book',
        title: 'A Book',
        genres: ['Fantasy'],
        authors: [{ name: 'Ada Voss' }],
        series: [{ name: 'The Ember Wars', sequence: '1' }],
        narrator: 'Elena Cross',
      },
    });
  });

  it('folds a podcast author into a one-element authors array', () => {
    const item = podcastItem('Tech Media Collective');
    const candidate = toCandidate(item);
    expect(candidate.media.kind).toBe('podcast');
    expect(candidate.media.authors).toEqual([{ name: 'Tech Media Collective' }]);
    expect(candidate.media.series).toEqual([]);
    expect(candidate.media.narrator).toBeNull();
  });

  it('yields an empty authors array for a null podcast author, never a null-named entry', () => {
    const candidate = toCandidate(podcastItem(null));
    expect(candidate.media.authors).toEqual([]);
  });

  it('yields an empty authors array for a blank podcast author', () => {
    const candidate = toCandidate(podcastItem('   '));
    expect(candidate.media.authors).toEqual([]);
  });
});
