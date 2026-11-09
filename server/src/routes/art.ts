/**
 * Where this server serves an item's art, `GET /api/media/{ref}/art`, and which items it serves
 * art for: a book, show or album the library index holds at the top level (`items.ts`), which
 * serves their pages, an episode's under its show, and a streamed song's where its row names any. A
 * kept song's art is its Jellyfin track's: its album's.
 */
import { type ArtUrl, type LibraryEntryKind, type MediaRef, mediaRefKey } from '@auralis/schema';
import { indexedRow, topLevelOf } from '../libraryIndex/store.js';
import { keptTrack } from '../requests/songs/kept.js';
import type { Db } from '../store/connection.js';
import { streamedTrack } from '../store/streamedTracks.js';

/** The kinds art is served for, and a page at the top level. */
export const PAGE_KINDS: readonly string[] = ['book', 'show', 'album'] satisfies LibraryEntryKind[];

/** The art route's URL for `ref`. */
export const artUrl = (ref: MediaRef): ArtUrl => `/api/media/${mediaRefKey(ref)}/art`;

/**
 * `ref`'s art where the art route serves it: an indexed top-level book, show or album its upstream
 * has art for, a kept song's album, a streamed song's own; else null.
 */
export function artOf(db: Db, ref: MediaRef): ArtUrl | null {
  if (ref.source === 'ytmusic') {
    const kept = keptTrack(db, ref.id);
    if (kept !== null) return artOf(db, topLevelOf(db, kept));
    return (streamedTrack(db, ref.id)?.artUrl ?? null) === null ? null : artUrl(ref);
  }
  const row = indexedRow(db, ref.source, ref.id);
  const served =
    row !== undefined && row.parentId === null && PAGE_KINDS.includes(row.kind) && row.hasArt;
  return served ? artUrl(ref) : null;
}
