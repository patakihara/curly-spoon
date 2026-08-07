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
 */
import { useNavigate, useParams } from '@tanstack/react-router';
import { Card, Skeleton } from '@auralis/ui';
import { CoverImage } from '../../components/CoverImage.js';
import { useLibrariesQuery, useLibrarySeriesQuery } from '../../api/queries.js';
import { orderSeriesBooks } from './seriesOrder.js';
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

  const orderedBooks = orderSeriesBooks(
    series.books.map((book) => ({
      id: book.id,
      title: book.media.title,
      seriesSequence: book.media.series?.find((s) => s.id === seriesId)?.sequence ?? null,
    })),
  );
  const booksById = new Map(series.books.map((book) => [book.id, book]));

  return (
    <div className="auralis-page" data-testid="series-page">
      <h1 data-testid="series-name">{series.name}</h1>
      {series.description ? <p>{series.description}</p> : null}

      {orderedBooks.length === 0 ? (
        <p>No books found in this series.</p>
      ) : (
        <div className="auralis-card-grid" data-testid="series-book-cards">
          {orderedBooks.map((ordered) => {
            const book = booksById.get(ordered.id)!;
            return (
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
                {ordered.seriesSequence !== null ? <p>Book {ordered.seriesSequence}</p> : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
