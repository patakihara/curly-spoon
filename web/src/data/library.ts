import {
  type Availability,
  type Feed,
  type FeedCard,
  type FeedShelfId,
  type LibraryList,
  type LibrarySort,
  mediaRefKey,
  type RequestedEntry,
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
 * names its host; Podcasts' lists are given (`lists.ts`). Your own requests sit among the cards in
 * that order, each saying where it stands: with no page to open yet, a card has no ref, and Sonora
 * draws it greyed. A home with no card of either kind draws its empty state (`homeState`).
 */

interface SortWords {
  ref: string;
  value: string;
  options: { key: string; label: string }[];
}

/** The page's sort, naming `key`'s by its option's label. */
function sortNamed<S extends SortWords>(sort: S, key: string): S {
  return { ...sort, value: sort.options.find((o) => o.key === key)?.label ?? sort.value };
}

/** The page's sort, naming the one the list is in. */
const sortOf = <S extends SortWords>(sort: S, list: LibraryList): S => sortNamed(sort, list.sort);

/**
 * A library home while its list loads, or when it failed: no cards, its sort naming `sort`, the
 * one its address asks (`libraryAsk`), title when it asks none.
 */
export function libraryAwaited<P extends { sort: SortWords; library: unknown[] }>(
  page: P,
  sort: LibrarySort | undefined,
): P {
  return { ...page, sort: sortNamed(page.sort, sort ?? 'title'), library: [] };
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
    case 'requested':
    case undefined:
      return { status: 'Requested', tone: 'request' };
    case 'searching':
      return { status: 'Searching…', tone: 'progress' };
    case 'needsChoice':
      return { status: 'Needs choice', tone: 'request' };
    case 'queued':
      return { status: 'Queued', tone: 'progress' };
    case 'importing':
      return { status: 'Importing', tone: 'progress' };
    case 'inLibrary':
      return { status: 'In library', tone: 'library' };
    case 'failed':
      return { status: 'Failed', tone: 'error' };
  }
}

/**
 * The canvas's types are read off its sample cards, so they hold only the mixes the samples show
 * (a downloading book not yet begun, say); an answer may hold any mix.
 */
type BookCard = BooksData['library'][number];
type AlbumCard = MusicData['library'][number];
type ShowCard = PodcastsData['library'][number];

/** What a card is ordered by in `list`'s sort; null when it has no order to keep, a shuffle. */
function orderKey(list: LibraryList, card: { title: string; sub: string }): string | null {
  if (list.sort === 'random') return null;
  return list.sort === 'artist' ? card.sub : card.title;
}

/**
 * The cards of `list`: each item as `item` draws it, and each request as `asked` does, placed by the
 * list's order, or after the items in a shuffle.
 */
function cardsOf<C extends { title: string; sub: string }>(
  list: LibraryList,
  item: (entry: LibraryList['items'][number]) => C,
  asked: (entry: RequestedEntry) => C,
): C[] {
  const cards = list.items.map(item);
  for (const entry of list.requested) {
    const card = asked(entry);
    const key = orderKey(list, card);
    const at =
      key === null
        ? -1
        : cards.findIndex((other) => (orderKey(list, other) ?? '').localeCompare(key) > 0);
    cards.splice(at === -1 ? cards.length : at, 0, card);
  }
  return cards;
}

/** A home's state: empty with nothing of yours in it, and nothing asked for. */
export const homeState = (cards: readonly unknown[]): 'empty' | 'full' =>
  cards.length === 0 ? 'empty' : 'full';

export function booksData(list: LibraryList, page: BooksData): BooksData {
  return {
    ...page,
    sort: sortOf(page.sort, list),
    library: cardsOf(
      list,
      (book): BookCard =>
        ({
          title: book.title,
          ref: mediaRefKey(book.ref),
          sub: book.sub ?? '',
          image: artAt(book.art, 'medium'),
          progress: book.progress,
          ...statusOf(book.availability),
        }) as BookCard,
      (asked): BookCard =>
        ({
          title: asked.title,
          ref: '',
          sub: asked.sub ?? '',
          image: artAt(asked.art, 'medium'),
          progress: null,
          ...statusOf(asked.availability),
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
    library: cardsOf(
      list,
      (show): ShowCard =>
        ({
          title: show.title,
          ref: mediaRefKey(show.ref),
          sub: show.sub ?? '',
          image: artAt(show.art, 'medium'),
          unplayed: false,
          ...statusOf(show.availability),
        }) as ShowCard,
      (asked): ShowCard =>
        ({
          title: asked.title,
          ref: '',
          sub: asked.sub ?? '',
          image: artAt(asked.art, 'medium'),
          unplayed: false,
          ...statusOf(asked.availability),
        }) as ShowCard,
    ),
    lists: lists ?? [],
  };
}

export function musicData(list: LibraryList, page: MusicData): MusicData {
  return {
    ...page,
    sort: sortOf(page.sort, list),
    library: cardsOf(
      list,
      (album): AlbumCard =>
        ({
          title: album.title,
          ref: mediaRefKey(album.ref),
          sub: album.sub ?? '',
          image: artAt(album.art, 'medium'),
          ...statusOf(album.availability),
        }) as AlbumCard,
      (asked): AlbumCard =>
        ({
          title: asked.title,
          ref: '',
          sub: asked.sub ?? '',
          image: artAt(asked.art, 'medium'),
          ...statusOf(asked.availability),
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
 * come from `GET /api/feed`, each card opening its book or episode. Only Jump back in, Up next and
 * Still listening are left out when empty, unnamed in the page's section bar. The feature, the
 * shelves' ids and the shelves later milestones serve (recently added, people, picks, recently
 * played) stay empty, those shelves still named in the section bar.
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
