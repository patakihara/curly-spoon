/**
 * Browse (docs/ROADMAP.md §12d, renamed from "For You" on-screen per
 * `docs/design/screens/FOR_YOU.md` §6.1 — the underlying files/routes keep the
 * `forYou`/`ForYou` name deliberately, see that section) — the app's landing
 * destination. Built from the user's own reference screenshots
 * (`docs/research/spec-addendum/01-for-you.jpg` through `04-for-you.jpg`, not in
 * git — see that section's header for why): a two-column "quick picks" grid of
 * small thumbnail-plus-title tiles, a row of content-type filter chips, and —
 * below that — nothing but uniform album-card carousels, one card geometry
 * repeated for every content type. `04-for-you.jpg` is Spotify doing the
 * opposite for its Podcasts filter (a 4-column icon grid, then full-width
 * episode cards) and is explicitly the anti-pattern this page must not
 * reproduce.
 *
 * There is no BFF endpoint that returns one mixed-type home feed, so this page
 * is where four independent sources get stitched together client-side:
 * Audiobookshelf's per-library home shelves (books, podcasts), Jellyfin's
 * favourite albums (music), and the book library's recommended shelves.
 * `forYouFeed.ts` holds that stitching as pure, tested functions; this file is
 * only the data-fetching and the chip/loading states around it.
 *
 * A source that errors (an unconfigured Jellyfin, a library whose shelves
 * fail to load) degrades to "that carousel doesn't appear" rather than
 * failing the whole page — a mixed-source aggregator shouldn't go blank
 * because one of its three sources is down. Wave 16e-foryou-W changes *when*
 * that shows, not the degrade rule itself — see `pageLoading`'s doc comment.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Chip, Skeleton } from '@auralis/ui';
import {
  queryKeys,
  useJellyfinConfigQuery,
  useJellyfinFavoriteAlbumsQuery,
  useLibrariesQuery,
  useSetupQuery,
} from '../../api/queries.js';
import { isExternalItem } from '../../api/availability.js';
import { useApi } from '../../api/ApiContext.js';
import { CoverImage } from '../../components/CoverImage.js';
import { useBreakpoint } from '../../hooks/useBreakpoint.js';
import { Carousel } from './Carousel.js';
import {
  albumsToCarousel,
  buildForYouCarousels,
  buildQuickPicks,
  filterCarousels,
  shelfToCarousel,
  type FeedCarousel,
  type FeedItem,
} from './forYouFeed.js';
import {
  DEFAULT_FOR_YOU_FILTER,
  FOR_YOU_FILTER_OPTIONS,
  selectForYouFilter,
} from './forYouFilters.js';

const COLUMN_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
};

const FILTER_ROW_STYLE: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const QUICK_GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
};

/**
 * Wave 16e-foryou-W, `docs/design/screens/FOR_YOU.md` §3.2: a genuine desktop/compact
 * split (row gap, radius, background all differ by breakpoint) rather than the single
 * fixed style this tile rendered at every width before. The compact/mobile column
 * deliberately stays on `--m3-surface-container` — Sonora's own `QuickPick` source does
 * this, not an unmigrated leftover (§3.2's table note: "do not 'fix' to --surface-card").
 */
function quickTileStyleFor(isCompact: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: isCompact ? 10 : 12,
    padding: 8,
    borderRadius: isCompact ? 'var(--radius-sm)' : 'var(--radius-xs)',
    background: isCompact ? 'var(--m3-surface-container)' : 'var(--surface-card)',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    color: 'inherit',
    minWidth: 0,
    // A `<button>` shrink-wraps to its content's width by default even with
    // `display: flex` set on itself — that default width, not the grid column,
    // is what a tile actually rendered at. Each `role="listitem"` grid cell above
    // it already stretches to fill its column (CSS Grid's default
    // `justify-items: stretch`), so this is the one property standing between a
    // ~260px tile and the ~422px column it sits in — found by screenshotting the
    // desktop width pass at 1440px, where the shortfall left a wide dead gap next
    // to every quick pick (web design audit, 2026-08-07).
    width: '100%',
  };
}

/** FOR_YOU.md §3.2's QuickPick Title row: `--text-md`/`--surface-fg` on desktop,
 * `--text-sm`/`--m3-on-background` on compact — same `--m3-*`-stays-on-compact pattern
 * as the tile background above. `fontWeight: 700` (was 600) matches the table exactly. */
function quickTitleStyleFor(isCompact: boolean): CSSProperties {
  return {
    margin: 0,
    fontSize: isCompact ? 'var(--text-sm)' : 'var(--text-md)',
    fontWeight: 700,
    lineHeight: 1.3,
    color: isCompact ? 'var(--m3-on-background)' : 'var(--surface-fg)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  };
}

const QUICK_PICK_COUNT = 8;
const QUICK_TILE_COVER_SIZE_DESKTOP = 52;
const QUICK_TILE_COVER_SIZE_COMPACT = 48;

/** FOR_YOU.md §6.2: a fixed, small placeholder count for the page-level loading
 * skeleton — real shelf count isn't knowable before any source resolves, and the spec
 * deliberately doesn't pin an exact number ("pick something in the 2-4 range"). 3. */
const SKELETON_CAROUSEL_COUNT = 3;

/** `useLibraryHomeQuery` (api/queries.ts) has no `enabled` flag — calling it with a
 * library id that isn't known yet would fire a request that 404s and flashes an
 * error before the real id arrives (see that hook's own doc comment). For You needs
 * *two* such queries running conditionally side by side (books, podcasts), which the
 * shared hook can't do; this local variant adds `enabled` without touching
 * `api/queries.ts`, a file another wave may also be depending on staying stable. It
 * reuses that hook's own query key, so both still share one cache entry per library.
 */
function useOptionalLibraryHomeQuery(libraryId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: libraryId
      ? queryKeys.libraryHome(libraryId)
      : (['libraries', 'home', 'none'] as const),
    queryFn: ({ signal }) => api.getLibraryHome(libraryId as string, signal),
    enabled: Boolean(libraryId),
    staleTime: 30_000,
  });
}

/** Same shape as `useOptionalLibraryHomeQuery` above, for `GET /libraries/:id/recommended`
 * (docs/ROADMAP.md §13). Deliberately its own query, not merged into the home query: a
 * recommendation failure must not touch the shelves `useOptionalLibraryHomeQuery` already
 * fetched successfully — react-query already isolates failures per query key, this is just
 * two independent `useQuery` calls rather than one that could fail as a unit. */
function useOptionalLibraryRecommendedQuery(libraryId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: libraryId
      ? queryKeys.libraryRecommended(libraryId)
      : (['libraries', 'recommended', 'none'] as const),
    queryFn: ({ signal }) => api.getLibraryRecommended(libraryId as string, signal),
    enabled: Boolean(libraryId),
    staleTime: 30_000,
  });
}

function QuickPickGrid({
  items,
  loading,
  onSelect,
}: {
  items: FeedItem[];
  loading: boolean;
  onSelect: (item: FeedItem) => void;
}) {
  const isCompact = useBreakpoint() === 'compact';
  if (!loading && items.length === 0) return null;

  const tileStyle = quickTileStyleFor(isCompact);
  const titleStyle = quickTitleStyleFor(isCompact);
  const coverSize = isCompact ? QUICK_TILE_COVER_SIZE_COMPACT : QUICK_TILE_COVER_SIZE_DESKTOP;

  return (
    <div
      role="list"
      aria-label="Quick picks"
      style={QUICK_GRID_STYLE}
      data-testid="quick-picks-grid"
    >
      {loading
        ? Array.from({ length: QUICK_PICK_COUNT }, (_, i) => (
            <div role="listitem" key={i} style={tileStyle} data-testid={`quick-pick-skeleton-${i}`}>
              <Skeleton shape="rectangular" width={coverSize} height={coverSize} />
              <Skeleton shape="text" width="70%" />
            </div>
          ))
        : items.map((item) => (
            <div role="listitem" key={item.id}>
              <button
                type="button"
                style={tileStyle}
                data-testid={`quick-pick-${item.id}`}
                aria-label={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
                onClick={() => onSelect(item)}
              >
                <CoverImage src={item.coverSrc} size={coverSize} fallbackIcon={item.fallbackIcon} />
                <span style={titleStyle} aria-hidden="true">
                  {item.title}
                </span>
              </button>
            </div>
          ))}
    </div>
  );
}

export function HomePage() {
  const api = useApi();
  const navigate = useNavigate();
  const [filter, setFilter] = useState(DEFAULT_FOR_YOU_FILTER);

  const setupQuery = useSetupQuery();
  const configured = setupQuery.data?.configured ?? false;

  const librariesQuery = useLibrariesQuery(configured);
  const bookLibrary = librariesQuery.data?.libraries.find(
    (library) => library.mediaType === 'book',
  );
  const podcastLibrary = librariesQuery.data?.libraries.find(
    (library) => library.mediaType === 'podcast',
  );

  const bookHomeQuery = useOptionalLibraryHomeQuery(bookLibrary?.id);
  const podcastHomeQuery = useOptionalLibraryHomeQuery(podcastLibrary?.id);
  // Recommendations are book-only through 13d (13e widens this to music) — scoped to
  // the book library the same way bookHomeQuery is. Its own query, its own failure
  // domain: see the hook's doc comment for why this must not be folded into
  // bookHomeQuery.
  const recommendedQuery = useOptionalLibraryRecommendedQuery(bookLibrary?.id);

  const jellyfinConfigQuery = useJellyfinConfigQuery();
  const jellyfinConfigured = jellyfinConfigQuery.data?.configured ?? false;
  // Always called (rules of hooks), same as every other query above — but only its
  // *result* is used, and only once Jellyfin is known to be configured; against an
  // unconfigured Jellyfin this errors, and that error is swallowed below rather than
  // shown, per this page's "one bad source doesn't blank the page" rule.
  const favoriteAlbumsQuery = useJellyfinFavoriteAlbumsQuery();

  const bookCarousels = useMemo<FeedCarousel[]>(() => {
    if (bookHomeQuery.isError) return [];
    const shelves = (bookHomeQuery.data?.shelves ?? []).filter((shelf) => shelf.items.length > 0);
    return shelves.map((shelf) =>
      shelfToCarousel(shelf, 'books', (id) => api.coverUrl(id, { width: 240 })),
    );
  }, [bookHomeQuery.data, bookHomeQuery.isError, api]);

  const podcastCarousels = useMemo<FeedCarousel[]>(() => {
    if (podcastHomeQuery.isError) return [];
    const shelves = (podcastHomeQuery.data?.shelves ?? []).filter(
      (shelf) => shelf.items.length > 0,
    );
    return shelves.map((shelf) =>
      shelfToCarousel(shelf, 'podcasts', (id) => api.coverUrl(id, { width: 240 })),
    );
  }, [podcastHomeQuery.data, podcastHomeQuery.isError, api]);

  const musicCarousels = useMemo<FeedCarousel[]>(() => {
    if (!jellyfinConfigured || favoriteAlbumsQuery.isError) return [];
    const albums = (favoriteAlbumsQuery.data?.items ?? []).filter((album) => album.favorite);
    if (albums.length === 0) return [];
    return [
      albumsToCarousel('music-favorite-albums', 'Your albums', albums, (id) =>
        api.jellyfinArtworkUrl(id),
      ),
    ];
  }, [jellyfinConfigured, favoriteAlbumsQuery.data, favoriteAlbumsQuery.isError, api]);

  // `recommendedShelves: null` — not `[]` — is what an errored or not-yet-settled
  // request degrades to: `buildForYouCarousels` treats `null` as "nothing to add",
  // producing exactly the pre-13c feed, and never as "the user has zero
  // recommendations" (that case is a real `[]` from the server, once the request
  // has actually succeeded).
  const carousels = useMemo(
    () =>
      buildForYouCarousels({
        book: bookCarousels,
        podcast: podcastCarousels,
        music: musicCarousels,
        recommendedShelves: recommendedQuery.isSuccess ? recommendedQuery.data.shelves : null,
        coverUrl: (id) => api.coverUrl(id, { width: 240 }),
      }),
    [
      bookCarousels,
      podcastCarousels,
      musicCarousels,
      recommendedQuery.isSuccess,
      recommendedQuery.data,
      api,
    ],
  );
  const visibleCarousels = useMemo(() => filterCarousels(carousels, filter), [carousels, filter]);
  const quickPicks = useMemo(
    () => buildQuickPicks(visibleCarousels, QUICK_PICK_COUNT),
    [visibleCarousels],
  );

  // Wave 16e-foryou-W, FOR_YOU.md §6.2 (docs/USER_DECISIONS.md decision 2's first bullet:
  // "Ofc Home should be in a loading state before it loads?"). Replaces the four
  // independent `show*Loading` booleans this page used to compute — each of which gated
  // its own carousel, so sources settled and painted one at a time, which is exactly the
  // unreserved layout-shift race phase 14c attributed and left unfixed. Now the whole
  // page renders *either* the full skeleton silhouette *or* the full real content, never
  // a mix of settled and unsettled sources at once.
  //
  // `recommendedQuery` is included here — the old `anyLoading` (this same file, before
  // this wave) omitted it, which is the exact gap this bullet closes.
  //
  // A source is "settled" once it is no longer loading, *or* has errored — react-query
  // already makes `isLoading` false the moment a query settles into `error` status, but
  // the `|| isError` half is kept explicit per FOR_YOU.md §6.2's own wording, so the page
  // cannot be held open indefinitely by a source stuck retrying: a permanently-broken
  // Jellyfin connection, say, must still let the rest of the page through, contributing
  // nothing to the feed (§5's existing per-source degrade rule, unchanged in what it
  // does — only in when the page notices it has happened).
  //
  // A source with nothing to fetch is settled automatically and needs no special case:
  // `useOptionalLibraryHomeQuery`/`useOptionalLibraryRecommendedQuery` pass `enabled:
  // Boolean(libraryId)`, and react-query's `isLoading` (`isPending && isFetching`) is
  // `false` for a disabled query that has never fetched — so a household with no
  // podcast library, say, never blocks the page on `podcastHomeQuery`.
  const bookSettled = !bookHomeQuery.isLoading || bookHomeQuery.isError;
  const podcastSettled = !podcastHomeQuery.isLoading || podcastHomeQuery.isError;
  const musicSettled = !favoriteAlbumsQuery.isLoading || favoriteAlbumsQuery.isError;
  const recommendedSettled = !recommendedQuery.isLoading || recommendedQuery.isError;
  const pageLoading = !(bookSettled && podcastSettled && musicSettled && recommendedSettled);

  // §6.6: the loading→loaded transition must be announced, not just drawn — neither
  // platform did this before this wave (grepped both `HomePage.tsx` and
  // `ForYouScreen.kt`/`ForYouCarousel.kt` for `aria-live`/`role="status"`/`liveRegion`
  // and found nothing), and §6.2's page-level hold makes the gap more noticeable, not
  // less: a screen-reader user now waits through one longer silence instead of several
  // shorter ones with no signal either way. Wording is new UI text with no existing
  // precedent to match, so — unlike §6.3's byte-for-byte external-item label — only
  // *something* being announced is required, not this exact phrasing.
  const loadingStatusMessage = pageLoading ? 'Loading your browse feed…' : 'Browse feed loaded.';

  const handleSelect = (item: FeedItem) => {
    if (item.contentType === 'books') {
      // Wave 15d-1-books-W: an external (Open Library-derived) recommended card has no real
      // Audiobookshelf item behind it — `item.id` is an opaque `external:openlibrary:…` id no
      // `GET /items/:id` call can resolve. Hand off into the request flow instead, pre-filled.
      // Wave 15d-1-books-W-2: inverted from `=== 'external'` to `!== 'owned'` — a parity review
      // ruled the equality form fail-unsafe (a missing/unrecognised value silently reads as
      // owned and dead-ends at `/item/:id`); Android already treats anything but `'owned'` as
      // external. `MusicHomePage.tsx`'s `handleSelectRecommended` mirrors this same fix. Owned
      // books are completely unchanged.
      if (isExternalItem(item)) {
        void navigate({
          to: '/requests',
          search: { prefillTitle: item.title, prefillAuthor: item.subtitle ?? undefined },
        });
        return;
      }
      void navigate({ to: '/item/$itemId', params: { itemId: item.id } });
    } else if (item.contentType === 'podcasts') {
      void navigate({ to: '/podcast/$itemId', params: { itemId: item.id } });
    } else {
      void navigate({ to: '/music/album/$albumId', params: { albumId: item.id } });
    }
  };

  return (
    <div className="auralis-page" data-testid="home-page">
      {/* Wave 16e-foryou-W, FOR_YOU.md §6.1: the on-screen heading matches the nav
          label, "Browse" — a pre-ruling in the spec, since no other screen in this app
          has ever had its heading disagree with its nav label. */}
      <h1>Browse</h1>

      {!configured ? (
        <p>Connect Audiobookshelf in Settings to see your libraries here.</p>
      ) : setupQuery.isLoading || librariesQuery.isLoading ? (
        <div style={COLUMN_STYLE}>
          {[0, 1].map((i) => (
            <Skeleton key={i} shape="rectangular" width="100%" height={200} />
          ))}
        </div>
      ) : librariesQuery.isError ? (
        <p role="alert">Couldn't load your libraries: {librariesQuery.error.message}</p>
      ) : (
        <>
          <div
            role="group"
            aria-label="Filter by content type"
            style={FILTER_ROW_STYLE}
            data-testid="for-you-filter"
          >
            {FOR_YOU_FILTER_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                variant="filter"
                selected={filter === option.value}
                onSelectedChange={() => setFilter((prev) => selectForYouFilter(prev, option.value))}
                data-testid={`for-you-filter-${option.value}`}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          {/* §6.6's live region — always mounted (not conditionally rendered), the same
              pattern `SearchPage.tsx`'s `search-status` uses, so a screen reader is
              guaranteed to observe the text *change* rather than possibly missing a
              node that only starts existing once loading begins. `role="status"` per
              FOR_YOU.md §6.6 and SEARCH.md §6.4's established pattern (an implicit
              `aria-live="polite"`, kept as an explicit prop too for the same reason
              `SearchPage.tsx` states it there — clarity, not necessity). Rendered as
              ordinary visible text, exactly like `search-status` — this repo has no
              visually-hidden-text convention, and neither status line needs one. */}
          <p role="status" aria-live="polite" data-testid="for-you-status">
            {loadingStatusMessage}
          </p>

          <QuickPickGrid items={quickPicks} loading={pageLoading} onSelect={handleSelect} />

          {pageLoading ? (
            // §3.3: N generic skeleton carousel rows while every source is still
            // settling — real shelf count and labels aren't known yet, so unlike the
            // loaded branch below these aren't filtered by content type or labelled.
            // `SKELETON_CAROUSEL_COUNT` is a cosmetic choice with no behavioural
            // consequence (FOR_YOU.md §6.2 explicitly declines to pin an exact number);
            // 3 is this wave's pick, stated here so the `-A`/`-P` waves can check they
            // agree, though an exact match isn't required. `aria-hidden`: the
            // placeholder rows carry no content a screen reader needs, and the live
            // region above already announces the loading state itself.
            <div style={COLUMN_STYLE} aria-hidden="true" data-testid="for-you-skeleton">
              {Array.from({ length: SKELETON_CAROUSEL_COUNT }, (_, i) => (
                <Carousel
                  key={i}
                  id={`skeleton-${i}`}
                  label=""
                  items={[]}
                  loading
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : carousels.length === 0 ? (
            <p>Nothing to show yet — start listening and it will show up here.</p>
          ) : visibleCarousels.length === 0 ? (
            <p>Nothing to show for this filter yet.</p>
          ) : (
            <div style={COLUMN_STYLE}>
              {visibleCarousels.map((carousel) => (
                <Carousel
                  key={carousel.id}
                  id={carousel.id}
                  label={carousel.label}
                  items={carousel.items}
                  reason={carousel.reason}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
