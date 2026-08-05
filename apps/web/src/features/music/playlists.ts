/**
 * Pure cache-rewrite logic for the playlist add/remove optimistic updates
 * (`api/queries.ts`'s `useAddToJellyfinPlaylistMutation`/`useRemoveFromJellyfinPlaylistMutation`).
 * Kept separate from those hooks, same reasoning as `favorites.ts`/`pagination.ts`: testable
 * without React Query or a network.
 *
 * Unlike `favorites.ts`'s `withFavoriteState` — which has to rewrite *every* cached Jellyfin
 * query at once because one item can legitimately appear in several unrelated listings — a
 * playlist add/remove only has one cache entry that's actually wrong until the next fetch:
 * that specific playlist's own items page (`queryKeys.jellyfinPlaylistItems(playlistId)`).
 * The playlists *list* page's `trackCount` also goes briefly stale, but that's a cosmetic
 * number, not something a user acts on the way they act on a track actually being in the
 * list — left to `onSettled`'s invalidation rather than optimistically patched here, which
 * would otherwise need this module to disambiguate a playlists-list page from a
 * playlist-items page sharing the same `{ items, total, startIndex }` envelope.
 */
import type { JellyfinPlaylistItem, JellyfinTrack } from '../../api/types.js';

interface PlaylistItemsPage {
  items: JellyfinPlaylistItem[];
  total: number;
  startIndex: number;
}

/** A `JellyfinPlaylistItem` is the one Jellyfin-derived shape in this app with a
 * `playlistItemId` field — `JellyfinTrack`/`JellyfinAlbum`/`JellyfinArtist`/`JellyfinPlaylist`
 * all lack it, so checking for it (rather than just `items`/`total`) is enough to tell a
 * playlist-items page apart from every other `{ items, total, startIndex }`-shaped cache
 * entry in this app, including the playlists list itself. */
function isPlaylistItemsPage(value: unknown): value is PlaylistItemsPage {
  if (typeof value !== 'object' || value === null) return false;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items) || typeof (value as { total?: unknown }).total !== 'number') {
    return false;
  }
  return (
    items.length === 0 ||
    typeof (items[0] as { playlistItemId?: unknown }).playlistItemId === 'string'
  );
}

/** Prefix marking a playlist row as not-yet-confirmed by the server — never a real
 * Jellyfin-issued `PlaylistItemId` (verified against `@auralis/jellyfin-client`'s
 * `schemas/raw.ts` playlists section: real entry ids come from `LinkedChild.ItemId`, a
 * GUID's `"N"` hex form, which never contains this prefix). `PlaylistDetailRow` uses this to
 * disable the remove control on a row that has nothing real to remove by yet. */
const OPTIMISTIC_PREFIX = 'optimistic-';

export function isOptimisticPlaylistItem(playlistItemId: string): boolean {
  return playlistItemId.startsWith(OPTIMISTIC_PREFIX);
}

function optimisticId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${OPTIMISTIC_PREFIX}${crypto.randomUUID()}`
    : `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Appends `tracks` (in order) to a cached playlist-items page. Degrades to returning `data`
 * unchanged — not a thrown error, not an empty page conjured from nothing — when `data`
 * isn't a recognised playlist-items page, which is the common case of a user adding to a
 * playlist they haven't opened this session and so have nothing cached for yet; the
 * eventual real fetch (this mutation's own `onSettled` invalidation) is what makes that
 * page correct, not this optimistic write.
 */
export function appendPlaylistItems(data: unknown, tracks: JellyfinTrack[]): unknown {
  if (!isPlaylistItemsPage(data)) return data;
  if (tracks.length === 0) return data;
  const added: JellyfinPlaylistItem[] = tracks.map((track) => ({
    playlistItemId: optimisticId(),
    track,
  }));
  return { ...data, items: [...data.items, ...added], total: data.total + added.length };
}

/** Removes the given `playlistItemId`s from a cached playlist-items page — same
 * no-op-on-unrecognised-shape degrade as `appendPlaylistItems`, for the same reason. */
export function removePlaylistItems(data: unknown, playlistItemIds: readonly string[]): unknown {
  if (!isPlaylistItemsPage(data)) return data;
  if (playlistItemIds.length === 0) return data;
  const toRemove = new Set(playlistItemIds);
  const items = data.items.filter((item) => !toRemove.has(item.playlistItemId));
  if (items.length === data.items.length) return data;
  return { ...data, items, total: Math.max(0, data.total - (data.items.length - items.length)) };
}
