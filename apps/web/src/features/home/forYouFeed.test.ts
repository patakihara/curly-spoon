import { describe, expect, it } from 'vitest';
import {
  albumsToCarousel,
  buildForYouCarousels,
  buildQuickPicks,
  displaySubtitle,
  filterCarousels,
  mixedShelvesToCarousels,
  shelfToCarousel,
} from './forYouFeed.js';
import type {
  JellyfinAlbum,
  LibraryItem,
  MixedRecommendedItem,
  MixedRecommendedShelf,
  Shelf,
} from '../../api/types.js';

function bookItem(
  id: string,
  title: string,
  progress: number | null = null,
  availability?: 'owned' | 'external',
): LibraryItem {
  return {
    id,
    libraryId: 'lib-books',
    coverPath: null,
    media: { kind: 'book', title, authors: [{ name: 'Ann Author' }] },
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
    availability,
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

  // Wave 15d-1-books-W: this is the exact assertion that would have failed against the
  // pre-fix code — `shelfToCarousel`'s item literal never read `item.availability` at all,
  // so an external book carried it silently into the void and rendered pixel-identical to
  // an owned one. Confirmed to fail (`undefined` instead of `'external'`) against the code
  // before this wave's edit, so this is a proof, not a pin.
  it('forwards LibraryItem.availability onto the FeedItem, for both values and when absent', () => {
    const shelf: Shelf = {
      id: 'shelf-3',
      label: 'Discover',
      type: 'book',
      items: [
        bookItem('owned-1', 'Owned Book', null, 'owned'),
        bookItem('ext-1', 'External Book', null, 'external'),
        bookItem('plain-1', 'Ordinary Book'),
      ],
    };
    const carousel = shelfToCarousel(shelf, 'books', coverUrl);

    expect(carousel.items.map((i) => i.availability)).toEqual(['owned', 'external', undefined]);
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

function mixedItem(
  kind: MixedRecommendedItem['kind'],
  id: string,
  title: string,
  subtitle: string | null = 'Some Subtitle',
  availability: MixedRecommendedItem['availability'] = 'owned',
): MixedRecommendedItem {
  return {
    kind,
    id,
    title,
    subtitle,
    coverPath: kind === 'album' ? null : `/covers/${id}.jpg`,
    imageTag: kind === 'album' ? `tag-${id}` : null,
    availability,
  };
}

function mixedShelf(
  id: string,
  label: string,
  reason: string,
  items: MixedRecommendedItem[],
  itemLabels?: MixedRecommendedShelf['itemLabels'],
): MixedRecommendedShelf {
  return { id, label, type: 'recommended', reason, itemLabels, items };
}

describe('mixedShelvesToCarousels', () => {
  it('maps a single-kind (book) shelf: contentType is "books", no items carry a typeLabel', () => {
    const carousels = mixedShelvesToCarousels(
      [
        mixedShelf('rec-1', 'Because you finished Dune', 'Because you finished Dune', [
          mixedItem('book', 'rec-1-1', 'Rec One'),
          mixedItem('book', 'rec-1-2', 'Rec Two'),
        ]),
      ],
      coverUrl,
      artworkUrl,
    );

    expect(carousels).toHaveLength(1);
    expect(carousels[0]?.reason).toBe('Because you finished Dune');
    expect(carousels[0]?.contentType).toBe('books');
    expect(carousels[0]?.items.map((i) => i.id)).toEqual(['rec-1-1', 'rec-1-2']);
    expect(carousels[0]?.items.every((i) => i.typeLabel === undefined)).toBe(true);
  });

  it('drops a shelf with no items, defensively, rather than rendering an empty carousel', () => {
    const empty = mixedShelf('rec-empty', 'Empty', 'no items should never happen', []);
    expect(mixedShelvesToCarousels([empty], coverUrl, artworkUrl)).toEqual([]);
  });

  it('carries a mix of owned and external recommended items through to FeedItem.availability', () => {
    const shelf = mixedShelf('rec-mix', 'New to you', 'Because you enjoy this genre', [
      mixedItem('book', 'rec-mix-owned', 'Owned Rec', 'Some Author', 'owned'),
      mixedItem('book', 'rec-mix-ext', 'External Rec', 'Some Author', 'external'),
    ]);
    const [carousel] = mixedShelvesToCarousels([shelf], coverUrl, artworkUrl);

    expect(carousel?.items.map((i) => ({ id: i.id, availability: i.availability }))).toEqual([
      { id: 'rec-mix-owned', availability: 'owned' },
      { id: 'rec-mix-ext', availability: 'external' },
    ]);
  });

  // The contract this route exists for: a shelf spanning more than one kind. `itemLabels`
  // is what the server sends ONLY in this case (`shelves.ts:80`'s `typeLabelsFor`).
  it('a mixed-kind shelf gets contentType "mixed" and each item its FeedItem.typeLabel', () => {
    const shelf = mixedShelf(
      'rec-mixed-kinds',
      'Because you finished Dune',
      'Because you finished Dune',
      [
        mixedItem('book', 'book-1', 'Children of Time', 'Adrian Tchaikovsky'),
        mixedItem('podcast', 'pod-1', 'Deep Space News', 'Some Network'),
        mixedItem('album', 'album-1', 'Nightglass', 'Some Artist'),
      ],
      { 'book-1': 'Audiobook', 'pod-1': 'Podcast', 'album-1': 'Album' },
    );
    const [carousel] = mixedShelvesToCarousels([shelf], coverUrl, artworkUrl);

    expect(carousel?.contentType).toBe('mixed');
    expect(
      carousel?.items.map((i) => ({
        id: i.id,
        contentType: i.contentType,
        typeLabel: i.typeLabel,
      })),
    ).toEqual([
      { id: 'book-1', contentType: 'books', typeLabel: 'Audiobook' },
      { id: 'pod-1', contentType: 'podcasts', typeLabel: 'Podcast' },
      { id: 'album-1', contentType: 'music', typeLabel: 'Album' },
    ]);
  });

  it('resolves an album cover through artworkUrl and a book/podcast cover through coverUrl', () => {
    const shelf = mixedShelf(
      'rec-covers',
      'Mixed',
      'r',
      [mixedItem('book', 'book-1', 'A Book'), mixedItem('album', 'album-1', 'An Album')],
      { 'book-1': 'Audiobook', 'album-1': 'Album' },
    );
    const [carousel] = mixedShelvesToCarousels([shelf], coverUrl, artworkUrl);

    expect(carousel?.items.map((i) => i.coverSrc)).toEqual([
      'https://covers.example/book-1',
      'https://artwork.example/album-1',
    ]);
  });

  // docs/agent-specs/15c-2-CLIENTS.md's "blocker recon": a recommended item is by
  // construction one the user has no progress on (server's score.ts:38), so this route's
  // items never carry a progress bar — pin `progress: null` so nobody re-adds one.
  it('never carries a progress value — a recommended item cannot have one by construction', () => {
    const shelf = mixedShelf('rec-progress', 'Mixed', 'r', [mixedItem('book', 'book-1', 'A Book')]);
    const [carousel] = mixedShelvesToCarousels([shelf], coverUrl, artworkUrl);
    expect(carousel?.items[0]?.progress).toBeNull();
  });
});

describe('displaySubtitle', () => {
  it('returns the plain subtitle when there is no typeLabel', () => {
    expect(displaySubtitle({ subtitle: 'Frank Herbert', typeLabel: undefined })).toBe(
      'Frank Herbert',
    );
  });

  it('leads with the type label when both are present', () => {
    expect(displaySubtitle({ subtitle: 'Frank Herbert', typeLabel: 'Audiobook' })).toBe(
      'Audiobook • Frank Herbert',
    );
  });

  it('is just the type label when subtitle is null', () => {
    expect(displaySubtitle({ subtitle: null, typeLabel: 'Album' })).toBe('Album');
  });

  it('is null when both are absent', () => {
    expect(displaySubtitle({ subtitle: null, typeLabel: undefined })).toBeNull();
  });
});

describe('buildForYouCarousels', () => {
  const existingBook = shelfToCarousel(
    {
      id: 'shelf-continue',
      label: 'Continue Listening',
      type: 'book',
      items: [bookItem('b1', 'B1')],
    },
    'books',
    coverUrl,
  );
  const existingPodcast = shelfToCarousel(
    {
      id: 'shelf-episodes',
      label: 'Newest Episodes',
      type: 'episode',
      items: [podcastItem('p1', 'P1')],
    },
    'podcasts',
    coverUrl,
  );
  const existingMusic = albumsToCarousel(
    'music-favorites',
    'Your albums',
    [album('al1', 'Album One')],
    artworkUrl,
  );

  it('appends recommended carousels after the existing book/podcast/music carousels, preserving their order', () => {
    const result = buildForYouCarousels({
      book: [existingBook],
      podcast: [existingPodcast],
      music: [existingMusic],
      recommendedShelves: [
        mixedShelf('rec-1', 'Because you finished Dune', 'Because you finished Dune', [
          mixedItem('book', 'rec-1-1', 'Rec One'),
        ]),
      ],
      coverUrl,
      artworkUrl,
    });

    expect(result.map((c) => c.id)).toEqual([
      'shelf-continue',
      'shelf-episodes',
      'music-favorites',
      'rec-1',
    ]);
    expect(result.at(-1)?.reason).toBe('Because you finished Dune');
  });

  it('a cold-start user (empty recommended shelves) adds nothing — the existing feed is unchanged', () => {
    const result = buildForYouCarousels({
      book: [existingBook],
      podcast: [existingPodcast],
      music: [existingMusic],
      recommendedShelves: [],
      coverUrl,
      artworkUrl,
    });

    expect(result).toEqual([existingBook, existingPodcast, existingMusic]);
  });

  it('a failed/unknown recommendation request (null) degrades to just the existing carousels', () => {
    const result = buildForYouCarousels({
      book: [existingBook],
      podcast: [existingPodcast],
      music: [existingMusic],
      recommendedShelves: null,
      coverUrl,
      artworkUrl,
    });

    expect(result).toEqual([existingBook, existingPodcast, existingMusic]);
  });

  it('with nothing existing at all, still surfaces the recommended carousels', () => {
    const result = buildForYouCarousels({
      book: [],
      podcast: [],
      music: [],
      recommendedShelves: [
        mixedShelf('rec-1', 'x', 'Because you finished Dune', [
          mixedItem('book', 'rec-1-1', 'Rec One'),
        ]),
      ],
      coverUrl,
      artworkUrl,
    });

    expect(result.map((c) => c.id)).toEqual(['rec-1']);
  });
});
