/**
 * Pure aggregation for the For You feed (docs/ROADMAP.md §12d). Audiobookshelf's
 * per-library shelves, Jellyfin's favourite albums, and — since wave 15c-2-W —
 * `GET /api/v1/recommended`'s own cross-medium shelves are three independent client
 * fetches with no single upstream endpoint unifying all of Home, so this is where they
 * get stitched into one uniform list of `FeedCarousel`s, all meant to render with
 * exactly one card geometry (`Carousel.tsx`), plus a flat `quickPicks` list for the grid
 * at the top of the page. Kept out of `HomePage.tsx` for the same reason
 * `searchFilters.ts` is kept out of `SearchPage.tsx`: this is behaviour worth testing
 * directly, not through rendered JSX.
 */
import type { IconName } from '@auralis/ui';
import type {
  JellyfinAlbum,
  LibraryItem,
  MixedRecommendedItem,
  MixedRecommendedShelf,
  Shelf,
} from '../../api/types.js';

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
  /**
   * Wave 15d-1-W (music), widened by 15d-1-books-W: whether this item is real library
   * content ("owned") or an external, not-yet-owned placeholder the user does not have
   * ("external") — `JellyfinAlbum.availability` and `LibraryItem.availability`'s doc
   * comments (`api/types.ts`) have the server contracts. Optional and `undefined` on every
   * ordinary shelf; today only music's and mixed recommended shelves ever set it.
   * `Carousel.tsx` and every `onSelect` handler treat an absent value the same as `'owned'`,
   * so no existing carousel changes.
   */
  availability?: 'owned' | 'external';
  /**
   * Wave 15c-2-W: the noun a mixed-medium shelf's card leads its subtitle with —
   * `"Audiobook"`/`"Podcast"`/`"Album"`, from `MixedRecommendedShelf.itemLabels`
   * (`api/types.ts`). `undefined` on every ordinary or single-kind shelf, which render
   * their plain subtitle exactly as before. Kept separate from `subtitle` itself (rather
   * than baked in at construction time) so callers that need the *raw* subtitle — e.g.
   * `HomePage.tsx`'s external-book request prefill — never see the label leak in; use
   * `displaySubtitle()` below wherever the composed, announced text is what's wanted.
   */
  typeLabel?: string;
}

export interface FeedCarousel {
  id: string;
  label: string;
  /** `'mixed'` only for a recommended shelf whose items span more than one kind
   * (`mixedShelfToCarousel` below sets it from the same `itemLabels`-presence signal the
   * server uses) — `filterCarousels` has no single content-type filter such a shelf could
   * honestly match, so it is shown only under "all", never under a specific chip. A
   * single-kind recommended shelf gets its one real `ForYouContentType` instead, exactly
   * like any other carousel, and filters normally. */
  contentType: ForYouContentType | 'mixed';
  items: FeedItem[];
  /** Why this carousel was chosen for this user, e.g. "Because you finished Dune" —
   * present only on recommended carousels (docs/ROADMAP.md §13). An ordinary
   * Audiobookshelf/Jellyfin shelf carries no reason, since Auralis didn't choose it. */
  reason?: string;
}

/** The text a card actually shows and announces: the type label (when the item carries
 * one) leading the item's own subtitle, e.g. `"Audiobook • Ursula K. Le Guin"` — Sofia's
 * own Spotify reference disambiguates a mixed shelf exactly this way
 * (`docs/USER_DECISIONS.md` decision 2). Absent `typeLabel` (every ordinary or
 * single-kind shelf) returns `subtitle` unchanged. Shared by `Carousel.tsx`'s card (both
 * the visible `<p>` and, via `cardLabel`, the announced `aria-label`) and `HomePage.tsx`'s
 * quick-pick tiles, since quick picks are built from these same `FeedCarousel.items`
 * (`buildQuickPicks`) and must announce the same thing a shelf card does. */
export function displaySubtitle(item: Pick<FeedItem, 'subtitle' | 'typeLabel'>): string | null {
  if (!item.typeLabel) return item.subtitle;
  return item.subtitle ? `${item.typeLabel} • ${item.subtitle}` : item.typeLabel;
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
      // Wave 15d-1-books-W: forwards `LibraryItem.availability` (see `api/types.ts`'s doc
      // comment) into the FeedItem the same way `albumsToCarousel` already forwards
      // `JellyfinAlbum.availability`. `undefined` on every ordinary book/podcast shelf item —
      // only `RecommendedShelf.items` (via `recommendedShelvesToCarousels`, which reuses this
      // function) ever sets `'owned'`/`'external'`.
      availability: item.availability,
    })),
  };
}

/** `MixedRecommendedItem.kind` -> the three-way `ForYouContentType` this module's
 * routing/filtering already understands. `HomePage.tsx`'s `handleSelect` and
 * `filterCarousels` both switch on `FeedItem.contentType`/`FeedCarousel.contentType`,
 * never on the wire's `kind` directly — this is the one place that translation happens
 * for a mixed shelf's items. */
function contentTypeForKind(kind: MixedRecommendedItem['kind']): ForYouContentType {
  if (kind === 'book') return 'books';
  if (kind === 'podcast') return 'podcasts';
  return 'music';
}

function fallbackIconForKind(kind: MixedRecommendedItem['kind']): IconName {
  if (kind === 'book') return 'book';
  if (kind === 'podcast') return 'podcasts';
  return 'music_note';
}

/** One item off `GET /api/v1/recommended` becomes one `FeedItem`. Cover resolution
 * splits by kind exactly like `HomePage.tsx`'s existing book/podcast vs. album calls
 * (`coverUrl`/`artworkUrl` build a URL from the id alone — see `shelfToCarousel`'s and
 * `albumsToCarousel`'s identical pattern above), so `item.coverPath`/`item.imageTag`
 * themselves are never read here; they exist on the wire for Android, which has no
 * such per-id URL builder (`api/types.ts`'s doc comment on `MixedRecommendedItem`).
 *
 * `progress` is always `null`: a recommended item is by construction one the user has
 * no progress on — `score.ts:38` (server) excludes every id in `knownItemIds`, which
 * `profile.ts:123` populates from every progress-carrying item — the same property
 * that already made the deleted `recommendedShelvesToCarousels`'s progress bar
 * unreachable on the book-only route this replaces. See
 * `docs/agent-specs/15c-2-CLIENTS.md`'s "blocker recon" section. */
function mixedItemToFeedItem(
  item: MixedRecommendedItem,
  itemLabels: MixedRecommendedShelf['itemLabels'],
  coverUrl: (itemId: string) => string,
  artworkUrl: (albumId: string) => string,
): FeedItem {
  return {
    id: item.id,
    contentType: contentTypeForKind(item.kind),
    title: item.title,
    subtitle: item.subtitle,
    coverSrc: item.kind === 'album' ? artworkUrl(item.id) : coverUrl(item.id),
    fallbackIcon: fallbackIconForKind(item.kind),
    progress: null,
    availability: item.availability,
    typeLabel: itemLabels?.[item.id],
  };
}

/** `GET /api/v1/recommended` (docs/ROADMAP.md §15c-2, wave 15c-2-W,
 * `docs/agent-specs/15c-2-CLIENTS.md`) — the cross-medium replacement for the deleted,
 * book-only `recommendedShelvesToCarousels`. A shelf's `contentType` is `'mixed'` when
 * the server's `itemLabels` is present (spans more than one kind) and the single real
 * kind otherwise — see `FeedCarousel.contentType`'s own doc comment for what that
 * controls. A shelf with no items (the server guarantees at least 2, but this stays
 * defensive rather than trusting that forever) is dropped, same as `HomePage.tsx`
 * already does for ordinary shelves. */
export function mixedShelvesToCarousels(
  shelves: MixedRecommendedShelf[],
  coverUrl: (itemId: string) => string,
  artworkUrl: (albumId: string) => string,
): FeedCarousel[] {
  return shelves
    .filter((shelf) => shelf.items.length > 0)
    .map((shelf) => ({
      id: shelf.id,
      label: shelf.label,
      contentType: shelf.itemLabels ? ('mixed' as const) : contentTypeForKind(shelf.items[0]!.kind),
      items: shelf.items.map((item) =>
        mixedItemToFeedItem(item, shelf.itemLabels, coverUrl, artworkUrl),
      ),
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
  recommendedShelves: MixedRecommendedShelf[] | null;
  coverUrl: (itemId: string) => string;
  artworkUrl: (albumId: string) => string;
}): FeedCarousel[] {
  const recommended = params.recommendedShelves
    ? mixedShelvesToCarousels(params.recommendedShelves, params.coverUrl, params.artworkUrl)
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
      availability: album.availability,
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
