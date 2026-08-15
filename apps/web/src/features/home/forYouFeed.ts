/**
 * Pure aggregation for the For You feed (docs/ROADMAP.md §12d). There is no
 * BFF endpoint that returns one mixed-type home feed — Audiobookshelf's
 * per-library shelves and Jellyfin's favourite albums are three independent
 * fetches — so this is where they get stitched into one uniform list of
 * `FeedCarousel`s, all meant to render with exactly one card geometry
 * (`Carousel.tsx`), plus a flat `quickPicks` list for the grid at the top of
 * the page. Kept out of `HomePage.tsx` for the same reason `searchFilters.ts`
 * is kept out of `SearchPage.tsx`: this is behaviour worth testing directly,
 * not through rendered JSX.
 */
import type { IconName } from '@auralis/ui';
import type { JellyfinAlbum, LibraryItem, RecommendedShelf, Shelf } from '../../api/types.js';

export type ForYouContentType = 'books' | 'podcasts' | 'music';

export interface FeedItem {
  id: string;
  contentType: ForYouContentType;
  title: string;
  subtitle: string | null;
  coverSrc: string;
  fallbackIcon: IconName;
  /** 0..1, or `null` for content with no progress concept (a Jellyfin album). */
  progress: number | null;
}

export interface FeedCarousel {
  id: string;
  label: string;
  contentType: ForYouContentType;
  items: FeedItem[];
  /** Why this carousel was chosen for this user, e.g. "Because you finished Dune" —
   * present only on recommended carousels (docs/ROADMAP.md §13). An ordinary
   * Audiobookshelf/Jellyfin shelf carries no reason, since Auralis didn't choose it. */
  reason?: string;
}

/** `authors[]` is the richer, structured field and wins when present; `author`
 * is the free-text fallback some upstream shapes send instead — mirrors the
 * identical rule the previous, audiobook-only `HomePage.tsx` used. */
function bookAuthorLabel(item: LibraryItem): string | null {
  const joined = item.media.authors?.map((a) => a.name).join(', ');
  if (joined && joined.length > 0) return joined;
  return item.media.author ?? null;
}

/** One Audiobookshelf shelf (a "Continue Listening", "Recently Added", …) becomes
 * one carousel. `contentType` is passed in by the caller rather than read off
 * `shelf.type` — a podcast library's shelves can carry `type: 'episode'` while
 * still belonging to the podcast content type, so the library the shelf came
 * from is the source of truth, not the shelf's own type string. */
export function shelfToCarousel(
  shelf: Shelf,
  contentType: 'books' | 'podcasts',
  coverUrl: (itemId: string) => string,
): FeedCarousel {
  const fallbackIcon: IconName = contentType === 'books' ? 'book' : 'podcasts';
  return {
    id: shelf.id,
    label: shelf.label,
    contentType,
    items: shelf.items.map((item) => ({
      id: item.id,
      contentType,
      title: item.media.title,
      subtitle: contentType === 'books' ? bookAuthorLabel(item) : (item.media.author ?? null),
      coverSrc: coverUrl(item.id),
      fallbackIcon,
      progress: item.progress?.progress ?? null,
    })),
  };
}

/** `GET /libraries/:id/recommended` (docs/ROADMAP.md §13) returns shelves that are
 * `Shelf`-shaped plus a `reason` string, always about audiobooks (13a–13d; music's
 * turn is 13e) — so this reuses `shelfToCarousel`'s 'books' mapping and carries the
 * `reason` through onto the resulting `FeedCarousel`. A shelf with no items (the
 * server guarantees at least 2, but this stays defensive rather than trusting that
 * forever) is dropped, same as `HomePage.tsx` already does for ordinary shelves. */
export function recommendedShelvesToCarousels(
  shelves: RecommendedShelf[],
  coverUrl: (itemId: string) => string,
): FeedCarousel[] {
  return shelves
    .filter((shelf) => shelf.items.length > 0)
    .map((shelf) => ({
      ...shelfToCarousel(shelf, 'books', coverUrl),
      reason: shelf.reason,
    }));
}

/**
 * The whole For You feed's carousel list, in the order the page renders them:
 * Audiobookshelf's own book/podcast shelves, then Jellyfin's music, then Auralis's
 * own recommended shelves last. Recommended goes last rather than first so a
 * cold-start user (no listening history, `recommendedShelves: []`) sees exactly
 * today's feed with nothing missing from the top, and a user who does have
 * recommendations finds them as a continuation of "what's already true about your
 * library" rather than displacing it — this is the "append, don't replace" decision
 * `docs/ROADMAP.md` §13 already made, made concrete as one testable function instead
 * of an inline spread in `HomePage.tsx`.
 *
 * `recommendedShelves` is `null` to mean "unknown or failed" (the query is loading,
 * errored, or hasn't run yet) — passing `null` here, rather than `[]`, is what a
 * failed `/recommended` request degrades to, and it produces exactly the same
 * carousel list as if no recommended carousels existed at all.
 */
export function buildForYouCarousels(params: {
  book: FeedCarousel[];
  podcast: FeedCarousel[];
  music: FeedCarousel[];
  recommendedShelves: RecommendedShelf[] | null;
  coverUrl: (itemId: string) => string;
}): FeedCarousel[] {
  const recommended = params.recommendedShelves
    ? recommendedShelvesToCarousels(params.recommendedShelves, params.coverUrl)
    : [];
  return [...params.book, ...params.podcast, ...params.music, ...recommended];
}

/** Jellyfin has no "shelf" concept — this wraps whatever album list the
 * caller already fetched (favourite albums today) into the same
 * `FeedCarousel` shape a book/podcast shelf produces, so the rest of this
 * module and `Carousel.tsx` never need to know the difference. */
export function albumsToCarousel(
  id: string,
  label: string,
  albums: JellyfinAlbum[],
  artworkUrl: (albumId: string) => string,
): FeedCarousel {
  return {
    id,
    label,
    contentType: 'music',
    items: albums.map((album) => ({
      id: album.id,
      contentType: 'music',
      title: album.name,
      subtitle: album.artistName,
      coverSrc: artworkUrl(album.id),
      fallbackIcon: 'music_note',
      progress: null,
    })),
  };
}

/** Which carousels the current content-type filter should render. `'all'`
 * (and, degrading rather than throwing, any value this module doesn't
 * recognise) shows every carousel. */
export function filterCarousels(carousels: FeedCarousel[], filter: string): FeedCarousel[] {
  if (filter !== 'books' && filter !== 'podcasts' && filter !== 'music') return carousels;
  return carousels.filter((carousel) => carousel.contentType === filter);
}

/**
 * The quick-selection grid: up to `max` items, taken round-robin across
 * carousels — one from the first carousel, one from the second, …, wrapping
 * back around to the first once every carousel has contributed one item —
 * rather than draining one carousel before touching the next. That mixes
 * content types the way the reference screenshots' own grid does, instead of
 * defaulting to "whatever the first carousel happens to be" whenever more
 * than one content type has data.
 */
export function buildQuickPicks(carousels: FeedCarousel[], max = 8): FeedItem[] {
  const picks: FeedItem[] = [];
  let round = 0;
  while (picks.length < max) {
    const before = picks.length;
    for (const carousel of carousels) {
      if (picks.length >= max) break;
      const item = carousel.items[round];
      if (item) picks.push(item);
    }
    if (picks.length === before) break; // no carousel had anything left this round
    round += 1;
  }
  return picks;
}
