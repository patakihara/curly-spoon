import {
  type ListDetail,
  type ListImport,
  type ListImportStop,
  type ListItem,
  type ListKind,
  type ListSummary,
  type ListUnmatched,
  mediaRefKey,
  type UnmatchedReason,
} from '@auralis/schema';
import { type ListData } from '../generated/pages/List';
import { type MusicData } from '../generated/pages/Music';
import { type PlaylistData } from '../generated/pages/Playlist';
import { type PodcastsData } from '../generated/pages/Podcasts';
import { artAt, clock, day, emptied, span } from './format';
import { listMenu } from './menus';

/**
 * Lists that aren't queues, as the pages draw them: one list's page from `GET /api/lists/{id}`,
 * and the Podcasts page's cards from your lists, `GET /api/lists`. A list is named by its kind; a
 * digest by its shows, its episodes and the order it plays them in. Its covers are the ones the
 * server gives: its entries' art, a digest's its shows'. Each entry opens its own kind's page, and
 * its menu holds what can be done to it (`./menus`). A music list is Music's: its page draws its
 * songs in order, each playing from its art, and, for one imported from Spotify, how far the import
 * has come and, last, the songs it left off and why; its card is on Music, every other list's on
 * Podcasts.
 */

/** What each kind of list is called, and what it counts. */
const KINDS: Record<ListKind, string> = {
  listening: 'List',
  playlist: 'Playlist',
  digest: 'Digest',
  music: 'Playlist',
};

const NOUNS: Record<ListItem['kind'], [string, string]> = {
  book: ['book', 'books'],
  show: ['show', 'shows'],
  episode: ['episode', 'episodes'],
  song: ['song', 'songs'],
};

const counted = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

/** A list's size: a listening list's by its books and shows, a music list's in songs, any other's in episodes. */
function sizeOf(list: ListSummary): string {
  if (list.kind === 'music') return counted(list.count, NOUNS.song);
  if (list.kind !== 'listening') return counted(list.count, NOUNS.episode);
  const kinds = (['book', 'show', 'episode'] as const).filter((kind) => list.counts[kind] > 0);
  if (kinds.length === 0) return counted(0, ['item', 'items']);
  return kinds.map((kind) => counted(list.counts[kind], NOUNS[kind])).join(' · ');
}

const coversOf = (list: ListSummary): string[] => list.covers.map((art) => artAt(art, 'medium'));

/** The canvas's types hold only the mixes its samples show; an answer may hold any. */
type Row = ListData['items'][number];

function rowOf(item: ListItem): Row {
  const begun = item.progress !== null && !item.finished;
  return {
    title: item.title,
    ref: mediaRefKey(item.ref),
    page: item.kind,
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
    menu: listMenu(list),
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

/** A list as a card, opening its page. */
const cardOf = (list: ListSummary) => ({
  title: list.name,
  ref: list.id,
  sub: `${KINDS[list.kind]} · ${sizeOf(list)}`,
  covers: coversOf(list),
});

/** Your lists but music lists as the Podcasts page's cards, in the order given: The Digest first. */
export function listCards(lists: ListSummary[]): PodcastsData['lists'] {
  return lists.filter((list) => list.kind !== 'music').map(cardOf);
}

/** Your music lists as the Music page's cards, oldest first. */
export function musicCards(lists: ListSummary[]): MusicData['lists'] {
  return lists.filter((list) => list.kind === 'music').map(cardOf);
}

/** Why an import stopped, as its page says it. */
const STOPPED: Record<ListImportStop, string> = {
  playlist_not_found: 'the playlist is gone or private',
  spotify_unavailable: 'Spotify didn’t answer',
  medium_unavailable: 'YouTube Music is unavailable',
};

/** Why a playlist's entry is not on the list, as its row says it. */
const LEFT_OFF: Record<UnmatchedReason, string> = {
  noMatch: 'Not found',
  notASong: 'Not a song',
  unavailable: 'Not on Spotify',
  listFull: 'List full',
};

/** Where an imported list's import stands: how far it has come, or how many it found. */
function importMeta(state: ListImport): string {
  const { done, total } = state;
  if (state.state === 'reading' || state.state === 'matching') {
    return total === 0 ? 'Importing' : `Importing ${done} of ${total}`;
  }
  if (state.state === 'stopped') {
    const why = STOPPED[state.stopped ?? 'spotify_unavailable'];
    return `Import stopped: ${why} · ${done} of ${total} read`;
  }
  return `From Spotify · ${total - state.unmatched.length} of ${total} found`;
}

function leftOffRow(entry: ListUnmatched): PlaylistData['unmatched'][number]['songs'][number] {
  return {
    title: entry.title ?? 'Unnamed',
    meta: [
      entry.artists.length === 0 ? null : entry.artists.join(', '),
      entry.album,
      entry.duration === null ? null : clock(entry.duration),
    ]
      .filter((part) => part !== null)
      .join(' · '),
    image: '',
    status: LEFT_OFF[entry.reason],
  };
}

/** A music list's page from `GET /api/lists/{id}`. */
export function playlistData(list: ListDetail, page: PlaylistData): PlaylistData {
  const left = list.import?.unmatched ?? [];
  return {
    ...emptied(page),
    title: list.name,
    ref: list.id,
    kind: KINDS[list.kind],
    meta: list.import === null ? sizeOf(list) : importMeta(list.import),
    image: artAt(list.covers[0] ?? null, 'large'),
    menu: listMenu(list),
    songs: list.items.map((song): PlaylistData['songs'][number] => ({
      title: song.title,
      meta: [song.sub, song.duration === null ? null : clock(song.duration)]
        .filter((part) => part !== null)
        .join(' · '),
      image: artAt(song.art, 'small'),
      status: null,
      ref: mediaRefKey(song.ref),
    })),
    unmatched: left.length === 0 ? [] : [{ songs: left.map(leftOffRow) }],
  };
}
