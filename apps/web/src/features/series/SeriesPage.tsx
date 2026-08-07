/**
 * A series' own page (`/series/$seriesId`) — its books, in series order, each
 * linking to `ItemPage`. Reached from a Search "Series" result
 * (`SearchPage.tsx`), which is what made this route necessary in the first
 * place: those results rendered `interactive={false}` because there was
 * nowhere to send a click.
 *
 * There is no per-id "fetch one series" route on the BFF — only the listing
 * endpoint (`ApiClient.getLibrarySeries`'s own doc comment has the detail) — so
 * this page fetches the whole series list for the book library and finds its
 * id client-side, the same "list, then find by id" shape `BooksPage`/
 * `LibraryPage` already use for a library id. An id absent from that list (a
 * stale link, a typo, a series since deleted upstream) is a real "not found"
 * state, not a blank page — see the `notFound` branch below.
 *
 * **Book order is the array order `getLibrarySeries` returns, not a client-side
 * re-sort.** This page used to feed each book's `orderSeriesBooks` a
 * `seriesSequence` read off `book.media.series?.find((s) => s.id === seriesId)`
 * — but every book here comes back *minified* (Audiobookshelf's own
 * `getFilteredSeries`, source-derived from v2.36.0, not live-verified: no
 * credential is available to this session), and a minified item's `media.series`
 * is always a single fallback entry whose `id` is the *series name*, never the
 * real series id (see the trap documented on `packages/abs-client`'s `domain.ts`
 * header). That lookup could therefore never match, so every book's sequence
 * was always `null`, and `orderSeriesBooks` — correct, and untouched here —
 * degrades an all-null input to alphabetical-by-title, silently destroying the
 * real order.
 *
 * The real order isn't lost, though: Audiobookshelf sorts `books` by sequence
 * server-side before stripping the sequence number out of the minified
 * response (`seriesFilters.js`'s `getFilteredSeries`, same source trace). So
 * the array order *is* the correct order — this page now trusts it directly
 * instead of re-deriving (and mangling) it. The cost is real and worth naming:
 * there's no per-book sequence number left to display ("Book 3"), because
 * Audiobookshelf's own API doesn't send one on this endpoint. Omitting the
 * label is more honest than inventing one.
 */
import { useNavigate, useParams } from '@tanstack/react-router';
import { Card, Skeleton } from '@auralis/ui';
import { CoverImage } from '../../components/CoverImage.js';
import { useLibrariesQuery, useLibrarySeriesQuery } from '../../api/queries.js';
import { useApi } from '../../api/ApiContext.js';

export function SeriesPage() {
  const { seriesId } = useParams({ from: '/series/$seriesId' });
  const navigate = useNavigate();
  const api = useApi();

  const librariesQuery = useLibrariesQuery(true);
  const bookLibraryId = librariesQuery.data?.libraries.find(
    (library) => library.mediaType === 'book',
  )?.id;

  const seriesQuery = useLibrarySeriesQuery(bookLibraryId);

  const loading = librariesQuery.isLoading || (Boolean(bookLibraryId) && seriesQuery.isLoading);

  if (loading) {
    return (
      <div className="auralis-page" data-testid="series-page">
        <Skeleton shape="text" width={240} height={32} />
        <div className="auralis-card-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shape="rectangular" width={160} height={220} />
          ))}
        </div>
      </div>
    );
  }

  if (librariesQuery.isError) {
    return (
      <div className="auralis-page" data-testid="series-page">
        <p role="alert">Couldn't load your libraries: {librariesQuery.error.message}</p>
      </div>
    );
  }

  if (!bookLibraryId) {
    return (
      <div className="auralis-page" data-testid="series-page">
        <p>No book library is set up on this server yet.</p>
      </div>
    );
  }

  if (seriesQuery.isError) {
    return (
      <div className="auralis-page" data-testid="series-page">
        <p role="alert">Couldn't load this series: {seriesQuery.error.message}</p>
      </div>
    );
  }

  const series = seriesQuery.data?.series.find((s) => s.id === seriesId);

  if (!series) {
    return (
      <div className="auralis-page" data-testid="series-page">
        <h1>Series not found</h1>
        <p data-testid="series-not-found">
          This series isn't in your library — the link may be old, or it may have been removed.
        </p>
      </div>
    );
  }

  // `series.books` arrives already in the right order — see this file's header
  // comment for why re-deriving a sequence here would be wrong, not merely
  // redundant.
  return (
    <div className="auralis-page" data-testid="series-page">
      <h1 data-testid="series-name">{series.name}</h1>
      {series.description ? <p>{series.description}</p> : null}

      {series.books.length === 0 ? (
        <p>No books found in this series.</p>
      ) : (
        <div className="auralis-card-grid" data-testid="series-book-cards">
          {series.books.map((book) => (
            <Card
              key={book.id}
              interactive
              variant="elevated"
              data-testid={`series-book-${book.id}`}
              onClick={() => void navigate({ to: '/item/$itemId', params: { itemId: book.id } })}
            >
              <CoverImage
                src={api.coverUrl(book.id, { width: 200 })}
                size={160}
                fallbackIcon="book_2"
              />
              <h3>{book.media.title}</h3>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
