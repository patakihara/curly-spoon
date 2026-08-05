/**
 * Pure cache-rewrite logic for the favourite-toggle optimistic update
 * (`api/queries.ts`'s `useToggleJellyfinFavoriteMutation`). Kept separate from that hook,
 * same reasoning as `pagination.ts`: testable without React Query or a network.
 *
 * A favourite toggle can be clicked from several different pages (an album's own track
 * list, an artist's album grid, a favourites view, a search-result card), and the same
 * item can legitimately be showing in *several* cached queries at once — e.g. a favourited
 * album sitting in both `jellyfinAlbums` (its artist's own listing) and a
 * favourites-only listing already in cache. Waiting for a round trip before any of those
 * update would leave the other views stale until their own next refetch, which reads as
 * "the toggle didn't work" everywhere except the one place it was clicked. So the update
 * is applied across *every* cached Jellyfin query at once — see this module's `withFavoriteState`,
 * driven by `queryClient.setQueriesData({ queryKey: ['jellyfin'] }, ...)` in `queries.ts`.
 */

/** Anything with a Jellyfin item id and a favourite flag — `JellyfinArtist`, `JellyfinAlbum`
 * and `JellyfinTrack` (`api/types.ts`) all satisfy this structurally, without needing a
 * shared base type there purely to serve this one cache-rewrite helper. */
interface Favoritable {
  id: string;
  favorite: boolean;
}

function isFavoritable(value: unknown): value is Favoritable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { favorite?: unknown }).favorite === 'boolean'
  );
}

function setIfMatch<T extends Favoritable>(item: T, itemId: string, favorite: boolean): T {
  return item.id === itemId ? { ...item, favorite } : item;
}

/** A `JellyfinLibraryPage<T>`-shaped cache entry (`{ items: T[], total, startIndex }`) —
 * every artist/album/track listing and favourites-only listing takes this shape. */
function isFavoritablePage(value: unknown): value is { items: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { items?: unknown }).items)
  );
}

/** A `JellyfinSearchResults`-shaped cache entry (`{ artists, albums, tracks }`) — the one
 * cached shape that holds favouritable items outside an `items` array. */
function isSearchResults(
  value: unknown,
): value is { artists: unknown[]; albums: unknown[]; tracks: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { artists?: unknown }).artists) &&
    Array.isArray((value as { albums?: unknown }).albums) &&
    Array.isArray((value as { tracks?: unknown }).tracks)
  );
}

/**
 * Rewrites `itemId`'s favourite flag to `favorite` wherever it appears in `data`, without
 * mutating the input. Total over every shape a Jellyfin React Query cache entry can take:
 * a browse/favourites listing (`{ items: [...] }`), search results
 * (`{ artists, albums, tracks }`), or something else entirely (`JellyfinConfig`,
 * `JellyfinLyricsResponse`, a query still `undefined` mid-flight, ...) — anything not
 * recognised passes through unchanged, `===` to the input. That totality is what lets
 * `useToggleJellyfinFavoriteMutation` call this against *every* `['jellyfin', ...]` cache
 * entry indiscriminately (config and lyrics included) rather than having to enumerate
 * which query keys are "favouritable" first.
 */
export function withFavoriteState(data: unknown, itemId: string, favorite: boolean): unknown {
  if (isFavoritablePage(data)) {
    return {
      ...data,
      items: data.items.map((item) =>
        isFavoritable(item) ? setIfMatch(item, itemId, favorite) : item,
      ),
    };
  }
  if (isSearchResults(data)) {
    return {
      ...data,
      artists: data.artists.map((item) =>
        isFavoritable(item) ? setIfMatch(item, itemId, favorite) : item,
      ),
      albums: data.albums.map((item) =>
        isFavoritable(item) ? setIfMatch(item, itemId, favorite) : item,
      ),
      tracks: data.tracks.map((item) =>
        isFavoritable(item) ? setIfMatch(item, itemId, favorite) : item,
      ),
    };
  }
  return data;
}
