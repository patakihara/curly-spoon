/**
 * For You (docs/ROADMAP.md §12d) — the app's landing destination. Built from the
 * user's own reference screenshots (`docs/research/spec-addendum/01-for-you.jpg`
 * through `04-for-you.jpg`, not in git — see that section's header for why): a
 * two-column "quick picks" grid of small thumbnail-plus-title tiles, a row of
 * content-type filter chips, and — below that — nothing but uniform album-card
 * carousels, one card geometry repeated for every content type. `04-for-you.jpg`
 * is Spotify doing the opposite for its Podcasts filter (a 4-column icon grid,
 * then full-width episode cards) and is explicitly the anti-pattern this page
 * must not reproduce.
 *
 * There is no BFF endpoint that returns one mixed-type home feed, so this page
 * is where three independent sources get stitched together client-side:
 * Audiobookshelf's per-library home shelves (books, podcasts) and Jellyfin's
 * favourite albums (music). `forYouFeed.ts` holds that stitching as pure,
 * tested functions; this file is only the data-fetching and the chip/loading
 * states around it.
 *
 * A source that errors (an unconfigured Jellyfin, a library whose shelves
 * fail to load) degrades to "that carousel doesn't appear" rather than
 * failing the whole page — a mixed-source aggregator shouldn't go blank
 * because one of its three sources is down.
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
import { useApi } from '../../api/ApiContext.js';
import { CoverImage } from '../../components/CoverImage.js';
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

const QUICK_TILE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 8,
  borderRadius: 'var(--m3-shape-sm)',
  background: 'var(--m3-surface-container)',
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

const QUICK_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
};

const QUICK_PICK_COUNT = 8;
const QUICK_TILE_COVER_SIZE = 56;

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
  if (!loading && items.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Quick picks"
      style={QUICK_GRID_STYLE}
      data-testid="quick-picks-grid"
    >
      {loading
        ? Array.from({ length: QUICK_PICK_COUNT }, (_, i) => (
            <div
              role="listitem"
              key={i}
              style={QUICK_TILE_STYLE}
              data-testid={`quick-pick-skeleton-${i}`}
            >
              <Skeleton
                shape="rectangular"
                width={QUICK_TILE_COVER_SIZE}
                height={QUICK_TILE_COVER_SIZE}
              />
              <Skeleton shape="text" width="70%" />
            </div>
          ))
        : items.map((item) => (
            <div role="listitem" key={item.id}>
              <button
                type="button"
                style={QUICK_TILE_STYLE}
                data-testid={`quick-pick-${item.id}`}
                aria-label={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
                onClick={() => onSelect(item)}
              >
                <CoverImage
                  src={item.coverSrc}
                  size={QUICK_TILE_COVER_SIZE}
                  fallbackIcon={item.fallbackIcon}
                />
                <span style={QUICK_TITLE_STYLE} aria-hidden="true">
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

  const showBooksLoading =
    Boolean(bookLibrary) && bookHomeQuery.isLoading && (filter === 'all' || filter === 'books');
  const showPodcastsLoading =
    Boolean(podcastLibrary) &&
    podcastHomeQuery.isLoading &&
    (filter === 'all' || filter === 'podcasts');
  const showMusicLoading =
    jellyfinConfigured && favoriteAlbumsQuery.isLoading && (filter === 'all' || filter === 'music');
  const anyLoading = showBooksLoading || showPodcastsLoading || showMusicLoading;

  const handleSelect = (item: FeedItem) => {
    if (item.contentType === 'books') {
      void navigate({ to: '/item/$itemId', params: { itemId: item.id } });
    } else if (item.contentType === 'podcasts') {
      void navigate({ to: '/podcast/$itemId', params: { itemId: item.id } });
    } else {
      void navigate({ to: '/music/album/$albumId', params: { albumId: item.id } });
    }
  };

  return (
    <div className="auralis-page" data-testid="home-page">
      <h1>For you</h1>

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

          <QuickPickGrid
            items={quickPicks}
            loading={anyLoading && quickPicks.length === 0}
            onSelect={handleSelect}
          />

          {!anyLoading && carousels.length === 0 ? (
            <p>Nothing to show yet — start listening and it will show up here.</p>
          ) : !anyLoading && visibleCarousels.length === 0 ? (
            <p>Nothing to show for this filter yet.</p>
          ) : (
            <div style={COLUMN_STYLE}>
              {showBooksLoading ? (
                <Carousel
                  id="books-loading"
                  label="Audiobooks"
                  items={[]}
                  loading
                  onSelect={handleSelect}
                />
              ) : null}
              {showPodcastsLoading ? (
                <Carousel
                  id="podcasts-loading"
                  label="Podcasts"
                  items={[]}
                  loading
                  onSelect={handleSelect}
                />
              ) : null}
              {showMusicLoading ? (
                <Carousel
                  id="music-loading"
                  label="Music"
                  items={[]}
                  loading
                  onSelect={handleSelect}
                />
              ) : null}
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
