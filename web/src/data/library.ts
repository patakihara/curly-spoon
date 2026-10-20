import { type Availability, type LibraryList, mediaRefKey } from '@auralis/schema';
import { type BooksData } from '../generated/pages/Books';
import { type BrowseData } from '../generated/pages/Browse';
import { type MusicData } from '../generated/pages/Music';
import { type PodcastsData } from '../generated/pages/Podcasts';
import { artAt, emptied } from './format';

/**
 * The library homes' data from `GET /api/library/{medium}`: each book, show or album as the
 * page's card, opening its page by its ref. The page's own words (its tabs, its sort) stay as the
 * canvas has them. A show's card names its host; Podcasts' lists are given (`lists.ts`).
 */

/** What a card says beside its art of where you stand with it: nothing for what you own. */
export function statusOf(availability: Availability): {
  status: string | null;
  tone: string | null;
} {
  if (availability.kind !== 'requested') return { status: null, tone: null };
  switch (availability.status) {
    case 'downloading':
      return {
        status: `Downloading · ${Math.round((availability.progress ?? 0) * 100)}%`,
        tone: 'progress',
      };
    case 'needsChoice':
      return { status: 'Needs choice', tone: 'request' };
    case 'failed':
      return { status: 'Failed', tone: 'error' };
    default:
      return { status: 'Requested', tone: 'request' };
  }
}

/**
 * The canvas's types are read off its sample cards, so they hold only the mixes the samples show
 * (a downloading book not yet begun, say); an answer may hold any mix.
 */
type BookCard = BooksData['library'][number];
type AlbumCard = MusicData['library'][number];

export function booksData(list: LibraryList, page: BooksData): BooksData {
  return {
    ...page,
    library: list.items.map(
      (book): BookCard =>
        ({
          title: book.title,
          ref: mediaRefKey(book.ref),
          sub: book.sub ?? '',
          image: artAt(book.art, 'medium'),
          progress: book.progress,
          ...statusOf(book.availability),
        }) as BookCard,
    ),
  };
}

/** Your shows, then your lists; lists that failed, null, leave their section out. */
export function podcastsData(
  list: LibraryList,
  lists: PodcastsData['lists'] | null,
  page: PodcastsData,
): PodcastsData {
  return {
    ...page,
    sections: lists === null ? page.sections.filter((s) => s !== 'Lists') : page.sections,
    library: list.items.map((show) => ({
      title: show.title,
      ref: mediaRefKey(show.ref),
      sub: show.sub ?? '',
      image: artAt(show.art, 'medium'),
      unplayed: false,
    })),
    lists: lists ?? [],
  };
}

export function musicData(list: LibraryList, page: MusicData): MusicData {
  return {
    ...page,
    library: list.items.map(
      (album): AlbumCard =>
        ({
          title: album.title,
          ref: mediaRefKey(album.ref),
          sub: album.sub ?? '',
          image: artAt(album.art, 'medium'),
          ...statusOf(album.availability),
        }) as AlbumCard,
    ),
  };
}

/** What each kind of card is called in Browse's shelf, and the page it opens. */
const KINDS = {
  book: { label: 'Book', page: 'book' },
  show: { label: 'Podcast', page: 'show' },
  album: { label: 'Album', page: 'album' },
} as const;

/**
 * Browse, the home page, from the three library lists: its first shelf holds what you are part
 * way through (a book, show or album with progress between 0 and 1), each opening its own page,
 * and is left out, unnamed in the page's section bar, while there is none. Nothing else is served
 * before M2.sorting, so every other shelf, the feature and the shelves' ids stay empty.
 */
export function browseData(lists: LibraryList[], page: BrowseData): BrowseData {
  const begun = lists
    .flatMap((list) => list.items)
    .filter((item) => item.progress !== null && item.progress > 0 && item.progress < 1);
  return {
    ...emptied(page),
    sections: begun.length > 0 ? page.sections : page.sections.slice(1),
    jumpBackIn: begun.map((item) => ({
      title: item.title,
      page: KINDS[item.kind].page,
      ref: mediaRefKey(item.ref),
      sub: [KINDS[item.kind].label, item.sub].filter((part) => part !== null).join(' · '),
      image: artAt(item.art, 'medium'),
    })),
  };
}
