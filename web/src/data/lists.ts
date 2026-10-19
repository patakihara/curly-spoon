import { type ListDetail, type ListItem, type ListKind, mediaRefKey } from '@auralis/schema';
import { type ListData } from '../generated/pages/List';
import { type PodcastsData } from '../generated/pages/Podcasts';
import { artAt, day, emptied, span } from './format';

/**
 * Lists that aren't queues, as the pages draw them: one list's page from `GET /api/lists/{id}`,
 * and the Podcasts page's cards from each of your lists. A list is named by its kind; a digest by
 * its shows, its episodes and the order it plays them in. Its covers are its entries' art, a
 * digest's its shows'. The menu's actions are not bound to anything yet, so the menu holds none.
 */

/** What each kind of list is called, and what it counts. */
const KINDS: Record<ListKind, string> = {
  listening: 'List',
  playlist: 'Playlist',
  digest: 'Digest',
};

const NOUNS: Record<ListItem['kind'], [string, string]> = {
  book: ['book', 'books'],
  show: ['show', 'shows'],
  episode: ['episode', 'episodes'],
};

const counted = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

/** A list's size: a listening list's by its books and shows, any other's in episodes. */
function sizeOf(list: ListDetail): string {
  if (list.kind !== 'listening') return counted(list.items.length, NOUNS.episode);
  const kinds = (['book', 'show', 'episode'] as const).filter((kind) =>
    list.items.some((item) => item.kind === kind),
  );
  if (kinds.length === 0) return counted(0, ['item', 'items']);
  return kinds
    .map((kind) => counted(list.items.filter((i) => i.kind === kind).length, NOUNS[kind]))
    .join(' · ');
}

const coversOf = (list: ListDetail): string[] =>
  (list.kind === 'digest' ? list.shows : list.items).flatMap((entry) =>
    entry.art === null ? [] : [artAt(entry.art, 'medium')],
  );

/** The canvas's types hold only the mixes its samples show; an answer may hold any. */
type Row = ListData['items'][number];

function rowOf(item: ListItem): Row {
  const begun = item.progress !== null && !item.finished;
  return {
    title: item.title,
    ref: mediaRefKey(item.ref),
    description: '',
    meta: [
      item.sub,
      item.publishedAt === null ? null : day(item.publishedAt),
      item.duration === null ? null : span(item.duration),
      item.duration === null || !begun
        ? null
        : `${span(item.duration * (1 - item.progress!))} left`,
    ].filter((fact) => fact !== null),
    image: artAt(item.art, 'small'),
    progress: begun ? item.progress : null,
  } as Row;
}

export function listData(list: ListDetail, page: ListData): ListData {
  const digest = list.kind === 'digest';
  const order = list.order === 'newest' ? 'Newest first' : 'Oldest first';
  return {
    ...emptied(page),
    title: list.name,
    ref: list.id,
    kind: KINDS[list.kind],
    covers: coversOf(list),
    meta: digest
      ? [counted(list.shows.length, NOUNS.show), sizeOf(list), order.toLowerCase()].join(' · ')
      : sizeOf(list),
    shows: list.shows.map((show) => ({
      title: show.title,
      sub: show.sub ?? '',
      image: artAt(show.art, 'small'),
      ref: mediaRefKey(show.ref),
    })),
    order: digest ? order : '',
    items: list.items.map(rowOf),
  };
}

/** Your lists as the Podcasts page's cards, in the order given: The Digest first. */
export function listCards(lists: ListDetail[]): PodcastsData['lists'] {
  return lists.map((list) => ({
    title: list.name,
    ref: list.id,
    sub: `${KINDS[list.kind]} · ${sizeOf(list)}`,
    covers: coversOf(list),
  }));
}
