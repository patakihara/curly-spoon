/**
 * The signed-in person's library lists: their books, podcast shows or albums, from the library
 * index, kept to the libraries they may open. Audiobookshelf's own `GET /api/me`, asked with their
 * token, says which libraries those are and how far through each book they are; Jellyfin's
 * `GET /UserViews`, asked the same way, says which music libraries they see, hidden from their
 * home screen or not. An unfinished book at 0 is listed as not started. A person not linked
 * to an upstream may open none of its libraries, so its lists are empty. Everything listed is in
 * the household's own libraries, so it is `owned`.
 */
import {
  type LibraryEntry,
  type LibraryEntryKind,
  listLibrary,
  type MediaRef,
  mediaRefKey,
} from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import type { AbsClient } from '../adapters/audiobookshelf/client.js';
import { libraryAccessSchema } from '../adapters/audiobookshelf/schemas.js';
import type { JellyfinClient } from '../adapters/jellyfin/client.js';
import type { Creator } from '../libraryIndex/rows.js';
import { type StoredRow, topLevelOfKind } from '../libraryIndex/store.js';
import { Refusal, serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { upstreamFor } from '../upstream/links.js';
import { signedIn } from './auth.js';
import { refusalFor, type UpstreamAccess } from './play.js';

/** Who a list names under each title: a book's authors, a show's host, an album's artists. */
const SUB_ROLE: Record<LibraryEntryKind, Creator['role']> = {
  book: 'author',
  show: 'host',
  album: 'album-artist',
};

const byTitle = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function entry(row: StoredRow, kind: LibraryEntryKind, progress: number | null): LibraryEntry {
  const ref: MediaRef = { source: row.source, id: row.id };
  const names = row.creators.filter((c) => c.role === SUB_ROLE[kind]).map((c) => c.name);
  return {
    ref,
    kind,
    title: row.title,
    sub: names.length > 0 ? names.join(', ') : null,
    art: `/api/media/${mediaRefKey(ref)}/art`,
    progress,
    availability: { kind: 'owned' },
  };
}

/** The person's books or shows, in the Audiobookshelf libraries their account may open. */
async function absEntries(db: Db, abs: AbsClient, kind: 'book' | 'show'): Promise<LibraryEntry[]> {
  const me = await abs.getMe();
  const access = libraryAccessSchema.safeParse(me);
  if (!access.success) throw new Refusal(502, 'upstream_failed');
  const { permissions, librariesAccessible } = access.data;
  const open = (libraryId: string | null) =>
    permissions.accessAllLibraries ||
    (libraryId !== null && librariesAccessible.includes(libraryId));
  const progress = new Map(
    me.mediaProgress
      .filter((p) => p.episodeId == null)
      .map((p) => [p.libraryItemId, p.isFinished ? 1 : Math.min(1, p.progress)] as const)
      .filter(([, share]) => share > 0),
  );
  return topLevelOfKind(db, kind)
    .filter((row) => row.source === 'abs' && open(row.libraryId))
    .map((row) => entry(row, kind, kind === 'book' ? (progress.get(row.id) ?? null) : null));
}

/** The person's albums, in the Jellyfin music libraries they see. */
async function jellyfinEntries(db: Db, jellyfin: JellyfinClient): Promise<LibraryEntry[]> {
  const views = new Set((await jellyfin.getUserViews()).map((view) => view.Id));
  return topLevelOfKind(db, 'album')
    .filter((row) => row.libraryId !== null && views.has(row.libraryId))
    .map((row) => entry(row, 'album', null));
}

export function libraryRoutes(
  app: FastifyInstance,
  options: { db: Db; upstreams: UpstreamAccess | null },
): void {
  const { db, upstreams } = options;

  serve(app, listLibrary, async (request, _reply, _body, { params }) => {
    const user = signedIn(request);
    const clients =
      upstreams === null ? { abs: null, jellyfin: null } : upstreamFor({ db, ...upstreams }, user);
    let items: LibraryEntry[] = [];
    try {
      if (params.medium === 'music') {
        if (clients.jellyfin !== null) items = await jellyfinEntries(db, clients.jellyfin);
      } else if (clients.abs !== null) {
        items = await absEntries(db, clients.abs, params.medium === 'books' ? 'book' : 'show');
      }
    } catch (error) {
      if (error instanceof Refusal) throw error;
      refusalFor(error);
    }
    return { items: items.sort((a, b) => byTitle.compare(a.title, b.title)) };
  });
}
