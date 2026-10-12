/**
 * What a queue row shows of an entry: its title, its artist, author or show (`sub`) and its
 * length in seconds, from the library index. A book's chapter entry shows the chapter, under the
 * book's title, from the chapters the lookup read. A Jellyfin track the index does not hold yet
 * (Instant Mix can name one) is read from Jellyfin as the person; a read that fails is logged
 * and leaves it unlabelled. An Audiobookshelf item leaves the index only once Audiobookshelf says
 * it is gone, so there is nothing left to read it from: it stays unlabelled too.
 */
import type { MediaRef } from '@auralis/schema';
import type { Creator } from '../libraryIndex/rows.js';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import type { QueueEntry } from '../store/listening.js';
import type { IndexLookup } from './lookup.js';

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

/**
 * Labels `entries`, reading from Jellyfin only the tracks the index does not hold, each once.
 * The lookup must hold the chapters of the books among them (`IndexLookup.load`).
 */
export async function labelled(
  deps: {
    db: Db;
    lookup: IndexLookup;
    jellyfin: JellyfinItems | null;
    log: { warn(detail: object, message: string): void };
  },
  entries: readonly QueueEntry[],
): Promise<(entry: QueueEntry) => EntryLabel> {
  const { db, lookup, jellyfin, log } = deps;
  const unindexed = new Map<string, MediaRef>();
  for (const { ref } of entries) {
    if (ref.source === 'jellyfin' && indexedRow(db, ref.source, ref.id) === undefined) {
      unindexed.set(key(ref), ref);
    }
  }
  const read = new Map<string, EntryLabel>();
  await Promise.all(
    [...unindexed.values()].map(async (ref) => {
      if (jellyfin === null) return;
      try {
        const item = await jellyfin.getPlayable(ref.id);
        const ticks = item.RunTimeTicks;
        read.set(key(ref), {
          title: item.Name ?? '',
          sub: line(item.Artists) ?? item.AlbumArtist ?? null,
          duration: ticks === null || ticks === undefined ? null : ticks / TICKS_PER_SECOND,
        });
      } catch (err) {
        log.warn({ err, ref }, 'a queued track could not be read from Jellyfin; it is unlabelled');
      }
    }),
  );
  return (entry) => {
    const row = indexedRow(db, entry.ref.source, entry.ref.id);
    if (row !== undefined) return fromIndex(db, lookup, row, entry);
    return read.get(key(entry.ref)) ?? UNLABELLED;
  };
}
