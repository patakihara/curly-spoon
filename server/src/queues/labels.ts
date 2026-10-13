/**
 * What a queue row shows of an entry: its title, its artist, author or show (`sub`) and its
 * length in seconds, from the library index. A book's chapter entry shows the chapter, under the
 * book's title, from the chapters the lookup read. An item the index does not hold is read from
 * its upstream as the person, each once: a Jellyfin track (Instant Mix can name one) from
 * Jellyfin; an Audiobookshelf episode from its show, found through the person's own progress on
 * it (`GET /api/me`); any other Audiobookshelf id as a book, from its expanded answer. A read that
 * fails is logged and leaves the entry unlabelled.
 */
import type { MediaRef } from '@auralis/schema';
import type { ItemSummary } from '../adapters/audiobookshelf/schemas.js';
import type { Creator } from '../libraryIndex/rows.js';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import type { QueueEntry } from '../store/listening.js';
import type { BookChapter, IndexLookup } from './lookup.js';

export interface EntryLabel {
  title: string;
  sub: string | null;
  duration: number | null;
}

/** What reads a Jellyfin item the index does not hold, as the person. */
interface JellyfinItems {
  getPlayable(itemId: string): Promise<{
    Name?: string | null;
    Artists?: string[] | null;
    AlbumArtist?: string | null;
    RunTimeTicks?: number | null;
  }>;
}

/** What reads an Audiobookshelf book or episode the index does not hold, as the person. */
interface AbsItems {
  getBookDetail(itemId: string): Promise<{
    title: string;
    authors: string[];
    duration: number;
    chapters: BookChapter[];
  }>;
  getMe(): Promise<{ mediaProgress: { libraryItemId: string; episodeId?: string | null }[] }>;
  getItemSummary(itemId: string): Promise<ItemSummary>;
}

/** A label read from an upstream: one for the item, or one per chapter entry of a book. */
type ReadLabel = (entry: QueueEntry) => EntryLabel;

const UNLABELLED: EntryLabel = { title: '', sub: null, duration: null };
const TICKS_PER_SECOND = 10_000_000;

/** Who a row names under its title, by its kind. */
const SUB_ROLE: Record<string, Creator['role']> = {
  book: 'author',
  track: 'artist',
  album: 'album-artist',
  show: 'host',
};

const key = (ref: MediaRef) => `${ref.source}:${ref.id}`;

/** Names joined into one line; null when there are none. */
const line = (names: readonly string[] | null | undefined): string | null =>
  names !== null && names !== undefined && names.length > 0 ? names.join(', ') : null;

function fromIndex(db: Db, lookup: IndexLookup, row: StoredRow, entry: QueueEntry): EntryLabel {
  if (row.kind === 'episode') {
    const show = row.parentId === null ? undefined : indexedRow(db, 'abs', row.parentId);
    return { title: row.title, sub: show?.title ?? null, duration: row.duration };
  }
  const sub = line(row.creators.filter((c) => c.role === SUB_ROLE[row.kind]).map((c) => c.name));
  if (row.kind === 'book' && entry.chapter !== undefined) {
    const chapter = lookup.chapters(entry.ref)?.[entry.chapter];
    if (chapter !== undefined) {
      return { title: chapter.title, sub: row.title, duration: chapter.end - chapter.start };
    }
    return { title: row.title, sub, duration: null };
  }
  return { title: row.title, sub, duration: row.duration };
}

async function fromJellyfin(jellyfin: JellyfinItems, id: string): Promise<ReadLabel> {
  const item = await jellyfin.getPlayable(id);
  const ticks = item.RunTimeTicks;
  const label = {
    title: item.Name ?? '',
    sub: line(item.Artists) ?? item.AlbumArtist ?? null,
    duration: ticks === null || ticks === undefined ? null : ticks / TICKS_PER_SECOND,
  };
  return () => label;
}

/**
 * An Audiobookshelf id the index does not hold: an episode of the show the person's progress
 * names it under, else a book. `showOf` reads the person's progress once for every id.
 */
async function fromAbs(
  abs: AbsItems,
  id: string,
  showOf: () => Promise<Map<string, string>>,
): Promise<ReadLabel> {
  const showId = (await showOf()).get(id);
  if (showId !== undefined) {
    const show = await abs.getItemSummary(showId);
    const episode =
      show.mediaType === 'podcast' ? show.media.episodes.find((e) => e.id === id) : undefined;
    if (episode === undefined) throw new Error('the show no longer lists the episode');
    const label = {
      title: episode.title,
      sub: show.media.metadata.title,
      duration: episode.audioFile?.duration ?? null,
    };
    return () => label;
  }
  const book = await abs.getBookDetail(id);
  return (entry) => {
    const chapter = entry.chapter === undefined ? undefined : book.chapters[entry.chapter];
    if (chapter !== undefined) {
      return { title: chapter.title, sub: book.title, duration: chapter.end - chapter.start };
    }
    return { title: book.title, sub: line(book.authors), duration: book.duration };
  };
}

/**
 * Labels `entries`, reading from its upstream only each item the index does not hold, once.
 * The lookup must hold the chapters of the books among them (`IndexLookup.load`).
 */
export async function labelled(
  deps: {
    db: Db;
    lookup: IndexLookup;
    jellyfin: JellyfinItems | null;
    abs: AbsItems | null;
    log: { warn(detail: object, message: string): void };
  },
  entries: readonly QueueEntry[],
): Promise<(entry: QueueEntry) => EntryLabel> {
  const { db, lookup, jellyfin, abs, log } = deps;
  const unindexed = new Map<string, MediaRef>();
  for (const { ref } of entries) {
    if (indexedRow(db, ref.source, ref.id) === undefined) unindexed.set(key(ref), ref);
  }
  let progress: Promise<Map<string, string>> | undefined;
  const showOf = (client: AbsItems) => () =>
    (progress ??= client
      .getMe()
      .then(
        (me) =>
          new Map(
            me.mediaProgress.flatMap((p) => (p.episodeId ? [[p.episodeId, p.libraryItemId]] : [])),
          ),
      ));
  const read = new Map<string, ReadLabel>();
  await Promise.all(
    [...unindexed.values()].map(async (ref) => {
      try {
        if (ref.source === 'jellyfin') {
          if (jellyfin !== null) read.set(key(ref), await fromJellyfin(jellyfin, ref.id));
        } else if (abs !== null) {
          read.set(key(ref), await fromAbs(abs, ref.id, showOf(abs)));
        }
      } catch (err) {
        log.warn(
          { err, ref },
          'a queued item could not be read from its upstream; it is unlabelled',
        );
      }
    }),
  );
  return (entry) => {
    const row = indexedRow(db, entry.ref.source, entry.ref.id);
    if (row !== undefined) return fromIndex(db, lookup, row, entry);
    return read.get(key(entry.ref))?.(entry) ?? UNLABELLED;
  };
}
