import {
  type Availability,
  type Feed,
  type FeedCard,
  type FeedShelfId,
  type LibraryList,
  mediaRefKey,
} from '@auralis/schema';
import { type BooksData } from '../generated/pages/Books';
import { type BrowseData } from '../generated/pages/Browse';
import { type MusicData } from '../generated/pages/Music';
import { type PodcastsData } from '../generated/pages/Podcasts';
import { artAt, emptied } from './format';

/**
 * The library homes' data from `GET /api/library/{medium}`: each book, show or album as the
 * page's card, opening its page by its ref. The page's own words (its tabs, its sorts) stay as the
 * canvas has them; its sort says, in those words, the order the server answered in. A show's card
 * names its host; Podcasts' lists are given (`lists.ts`).
 */

interface SortWords {
  ref: string;
  value: string;
  options: { key: string; label: string }[];
}

/** The page's sort, naming the one the list is in by its option's label. */
function sortOf<S extends SortWords>(sort: S, list: LibraryList): S {
  return { ...sort, value: sort.options.find((o) => o.key === list.sort)?.label ?? sort.value };
}

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
    sort: sortOf(page.sort, list),
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
    sort: sortOf(page.sort, list),
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
    sort: sortOf(page.sort, list),
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

/** What each kind of feed card is called in Browse's shelf, and the page it opens. */
const FEED_KINDS = {
  book: { label: 'Book', page: 'book' },
  episode: { label: 'Episode', page: 'episode' },
} as const;

type FeedCardData = BrowseData['upNext'][number];

/** Browse's sections each feed shelf fills. */
const SHELF_SECTIONS: Record<FeedShelfId, string> = {
  'up-next': 'Up next',
  'second-recent': 'Still listening',
};

const feedCard = (card: FeedCard): FeedCardData =>
  ({
    title: card.title,
    page: FEED_KINDS[card.kind].page,
    ref: mediaRefKey(card.ref),
    sub: [FEED_KINDS[card.kind].label, card.sub].filter((part) => part !== null).join(' · '),
    image: artAt(card.art, 'medium'),
    progress: card.progress,
  }) as FeedCardData;

/**
 * Browse, the home page. Its first shelf, from the three library lists, holds what you are part
 * way through (a book, show or album with progress between 0 and 1). Up next and Still listening
 * come from `GET /api/feed`, each card opening its book or episode. A shelf with nothing on it is
 * left out, unnamed in the page's section bar. The shelves later milestones serve (recently added,
 * people, picks, recently played), the feature and the shelves' ids stay empty.
 */
export function browseData(lists: LibraryList[], feed: Feed, page: BrowseData): BrowseData {
  const begun = lists
    .flatMap((list) => list.items)
    .filter((item) => item.progress !== null && item.progress > 0 && item.progress < 1);
  const shelf = (id: FeedShelfId) =>
    (feed.shelves.find((s) => s.id === id)?.items ?? []).map(feedCard);
  const upNext = shelf('up-next');
  const stillListening = shelf('second-recent');
  const empty = new Set([
    ...(begun.length > 0 ? [] : ['Jump back in']),
    ...(upNext.length > 0 ? [] : [SHELF_SECTIONS['up-next']]),
    ...(stillListening.length > 0 ? [] : [SHELF_SECTIONS['second-recent']]),
  ]);
  return {
    ...emptied(page),
    sections: page.sections.filter((section) => !empty.has(section)),
    jumpBackIn: begun.map((item) => ({
      title: item.title,
      page: KINDS[item.kind].page,
      ref: mediaRefKey(item.ref),
      sub: [KINDS[item.kind].label, item.sub].filter((part) => part !== null).join(' · '),
      image: artAt(item.art, 'medium'),
    })),
    upNext,
    stillListening,
  };
}
