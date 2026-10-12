/**
 * The queue engine's index lookup, as the server runs it: what an item enters a queue as, from
 * the library index. An album enters as its indexed tracks by disc and position, a book as its
 * chapters, an episode or a song as itself. The index keeps no chapters, so a book's chapter
 * count is read from Audiobookshelf as the person, ahead of the engine's synchronous lookup, and
 * kept until the index sees the book change. A Jellyfin item the index does not hold plays as a
 * lone song: Instant Mix can name tracks the index has not reached yet.
 */
import type { MediaRef, QueueType } from '@auralis/schema';
import { albumTracks, booksInSeries, indexedRow, type StoredRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import type { QueueEntry, SessionValue } from '../store/listening.js';
import type { Expansion } from './engine.js';

/** What reads a book's chapter count, as the person. */
export interface ChapterSource {
  getChapterCount(itemId: string): Promise<number>;
}

const key = (ref: MediaRef) => `${ref.source}:${ref.id}`;

export class IndexLookup {
  /** Each book's chapter count, by ref key, with the index version of the book it was read for. */
  private readonly chapters = new Map<string, { version: number; count: number }>();

  constructor(
    private readonly db: Db,
    private readonly log: { warn(detail: object, message: string): void },
  ) {}

  /**
   * Reads the chapter count of every indexed book among `refs` that this lookup does not hold for
   * the book's current index version. A book whose read fails plays as one entry until a later
   * read succeeds.
   */
  async load(refs: readonly MediaRef[], abs: ChapterSource | null): Promise<void> {
    if (abs === null) return;
    await Promise.all(
      refs.map(async (ref) => {
        const row = this.book(ref);
        if (row === null || this.chapters.get(key(ref))?.version === row.version) return;
        try {
          const count = await abs.getChapterCount(ref.id);
          this.chapters.set(key(ref), { version: row.version, count });
        } catch (err) {
          this.log.warn({ err, ref }, "a book's chapters could not be read; it plays as one entry");
        }
      }),
    );
  }

  /** The engine's lookup: what `ref` enters a queue as, or null for an item it cannot queue. */
  expand = (ref: MediaRef): Expansion | null => {
    const row = indexedRow(this.db, ref.source, ref.id);
    if (row === undefined) {
      return ref.source === 'jellyfin' ? { kind: 'track', entries: [{ ref }], from: null } : null;
    }
    switch (row.kind) {
      case 'track':
        return { kind: 'track', entries: [{ ref }], from: null };
      case 'album':
        return {
          kind: 'album',
          entries: albumTracks(this.db, row.id).map((t) => ({
            ref: { source: t.source, id: t.id },
          })),
          from: { kind: 'album', ref },
        };
      case 'episode':
        return {
          kind: 'episode',
          entries: [{ ref }],
          from:
            row.parentId === null
              ? null
              : { kind: 'show', ref: { source: 'abs', id: row.parentId } },
        };
      case 'book': {
        const count =
          this.chapters.get(key(ref))?.version === row.version
            ? (this.chapters.get(key(ref))?.count ?? 0)
            : 0;
        const entries: QueueEntry[] =
          count === 0
            ? [{ ref }]
            : Array.from({ length: count }, (_, chapter) => ({ ref, chapter }));
        return { kind: 'book', entries, from: { kind: 'book', ref } };
      }
      case 'show':
        return null;
    }
  };

  /** The refs a plan for `ref` plays: an album's indexed tracks with the album, else `ref` alone. */
  covered(ref: MediaRef): Set<string> {
    const row = indexedRow(this.db, ref.source, ref.id);
    const tracks = row?.kind === 'album' ? albumTracks(this.db, row.id) : [];
    return new Set([key(ref), ...tracks.map((t) => key({ source: t.source, id: t.id }))]);
  }

  /**
   * The books autoplay on the spoken queue may need chapters of: the book it follows (its current
   * item, else its newest play) and every book of that book's series.
   */
  autoplayBooks(session: SessionValue): MediaRef[] {
    const queue: QueueType = 'spoken';
    const newest = session.history.filter((h) => h.queue === queue).at(-1);
    const followed = session.queues[queue].current?.ref ?? newest?.ref;
    const row = followed === undefined ? null : this.book(followed);
    if (row === null) return [];
    const series = row.series.flatMap((s) => booksInSeries(this.db, s.id));
    return [row, ...series].map((b) => ({ source: b.source, id: b.id }));
  }

  private book(ref: MediaRef): StoredRow | null {
    const row = indexedRow(this.db, ref.source, ref.id);
    return row?.kind === 'book' ? row : null;
  }
}
