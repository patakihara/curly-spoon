import { type Availability, type LibraryList, mediaRefKey } from '@auralis/schema';
import { type BooksData } from '../generated/pages/Books';
import { type MusicData } from '../generated/pages/Music';
import { type PodcastsData } from '../generated/pages/Podcasts';
import { artAt } from './format';

/**
 * The library homes' data from `GET /api/library/{medium}`: each book, show or album as the
 * page's card, opening its page by its ref. The page's own words (its tabs, its sort) stay as the
 * canvas has them. A show's card names its host, and lists are not served yet, so none shows.
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

export function podcastsData(list: LibraryList, page: PodcastsData): PodcastsData {
  return {
    ...page,
    library: list.items.map((show) => ({
      title: show.title,
      ref: mediaRefKey(show.ref),
      sub: show.sub ?? '',
      image: artAt(show.art, 'medium'),
      unplayed: false,
    })),
    lists: [],
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
