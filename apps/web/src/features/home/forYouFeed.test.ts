import { describe, expect, it } from 'vitest';
import {
  albumsToCarousel,
  buildQuickPicks,
  filterCarousels,
  shelfToCarousel,
} from './forYouFeed.js';
import type { JellyfinAlbum, LibraryItem, Shelf } from '../../api/types.js';

function bookItem(id: string, title: string, progress: number | null = null): LibraryItem {
  return {
    id,
    libraryId: 'lib-books',
    coverPath: null,
    media: { kind: 'book', title, authors: [{ id: 'a1', name: 'Ann Author' }] },
    progress:
      progress === null
        ? null
        : {
            id: 'p',
            libraryItemId: id,
            episodeId: null,
            duration: 100,
            currentTime: 50,
            progress,
            isFinished: false,
          },
  };
}

function podcastItem(id: string, title: string): LibraryItem {
  return {
    id,
    libraryId: 'lib-podcasts',
    coverPath: null,
    media: { kind: 'podcast', title, author: 'Some Network' },
    progress: null,
  };
}

function album(id: string, name: string): JellyfinAlbum {
  return {
    id,
    name,
    sortName: null,
    artistId: 'artist-1',
    artistName: 'Some Artist',
    productionYear: null,
    overview: null,
    genres: [],
    imageTag: null,
    trackCount: 10,
    favorite: true,
  };
}

const coverUrl = (id: string) => `https://covers.example/${id}`;
const artworkUrl = (id: string) => `https://artwork.example/${id}`;

describe('shelfToCarousel', () => {
  it('maps a book shelf item, preferring the structured authors[] over the free-text author', () => {
    const shelf: Shelf = {
      id: 'shelf-1',
      label: 'Continue Listening',
      type: 'book',
      items: [bookItem('b1', 'Dune', 0.4)],
    };
    const carousel = shelfToCarousel(shelf, 'books', coverUrl);

    expect(carousel).toEqual({
      id: 'shelf-1',
      label: 'Continue Listening',
      contentType: 'books',
      items: [
        {
          id: 'b1',
          contentType: 'books',
          title: 'Dune',
          subtitle: 'Ann Author',
          coverSrc: 'https://covers.example/b1',
          fallbackIcon: 'book',
          progress: 0.4,
        },
      ],
    });
  });

  it('maps a podcast shelf item from the free-text author field, with no progress concept forced', () => {
    const shelf: Shelf = {
      id: 'shelf-2',
      label: 'Newest Episodes',
      type: 'episode',
      items: [podcastItem('p1', 'Episode One')],
    };
    const carousel = shelfToCarousel(shelf, 'podcasts', coverUrl);

    expect(carousel.items[0]).toEqual({
      id: 'p1',
      contentType: 'podcasts',
      title: 'Episode One',
      subtitle: 'Some Network',
      coverSrc: 'https://covers.example/p1',
      fallbackIcon: 'podcasts',
      progress: null,
    });
  });
});

describe('albumsToCarousel', () => {
  it('wraps favourite albums into the same FeedCarousel shape a shelf produces', () => {
    const carousel = albumsToCarousel(
      'music-favorites',
      'Your albums',
      [album('al1', 'Nightglass')],
      artworkUrl,
    );

    expect(carousel).toEqual({
      id: 'music-favorites',
      label: 'Your albums',
      contentType: 'music',
      items: [
        {
          id: 'al1',
          contentType: 'music',
          title: 'Nightglass',
          subtitle: 'Some Artist',
          coverSrc: 'https://artwork.example/al1',
          fallbackIcon: 'music_note',
          progress: null,
        },
      ],
    });
  });
});

describe('filterCarousels', () => {
  const carousels = [
    shelfToCarousel(
      { id: 's1', label: 'Books', type: 'book', items: [bookItem('b1', 'Dune')] },
      'books',
      coverUrl,
    ),
    shelfToCarousel(
      { id: 's2', label: 'Shows', type: 'episode', items: [podcastItem('p1', 'Ep')] },
      'podcasts',
      coverUrl,
    ),
    albumsToCarousel('m1', 'Albums', [album('al1', 'A')], artworkUrl),
  ];

  it('"all" shows every carousel', () => {
    expect(filterCarousels(carousels, 'all')).toHaveLength(3);
  });

  it('narrows to exactly the matching content type', () => {
    expect(filterCarousels(carousels, 'music')).toEqual([carousels[2]]);
    expect(filterCarousels(carousels, 'books')).toEqual([carousels[0]]);
    expect(filterCarousels(carousels, 'podcasts')).toEqual([carousels[1]]);
  });

  it('degrades to showing everything for an unrecognised filter, rather than showing nothing', () => {
    expect(filterCarousels(carousels, 'nonsense')).toHaveLength(3);
  });
});

describe('buildQuickPicks', () => {
  it('interleaves round-robin across carousels rather than draining one before the next', () => {
    const carousels = [
      shelfToCarousel(
        {
          id: 's1',
          label: 'Books',
          type: 'book',
          items: [bookItem('b1', 'B1'), bookItem('b2', 'B2'), bookItem('b3', 'B3')],
        },
        'books',
        coverUrl,
      ),
      albumsToCarousel('m1', 'Albums', [album('al1', 'A1'), album('al2', 'A2')], artworkUrl),
    ];

    const picks = buildQuickPicks(carousels, 8);

    // Round-robin: book, album, book, album, book — draining the shorter list
    // and then finishing out the longer one, never all-books-then-all-albums.
    expect(picks.map((p) => p.id)).toEqual(['b1', 'al1', 'b2', 'al2', 'b3']);
  });

  it('caps at max', () => {
    const carousels = [
      shelfToCarousel(
        {
          id: 's1',
          label: 'Books',
          type: 'book',
          items: [bookItem('b1', 'B1'), bookItem('b2', 'B2'), bookItem('b3', 'B3')],
        },
        'books',
        coverUrl,
      ),
    ];

    expect(buildQuickPicks(carousels, 2).map((p) => p.id)).toEqual(['b1', 'b2']);
  });

  it('returns nothing for no carousels, rather than throwing', () => {
    expect(buildQuickPicks([], 8)).toEqual([]);
  });
});
