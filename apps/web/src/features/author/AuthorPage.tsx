/**
 * An author's own page (`/author/$authorId`) — their books in the library.
 * Reached from a Search "Authors" result, the same way `SeriesPage` is reached
 * from a "Series" one.
 *
 * There is no "fetch one author" or "books by author" route on the BFF, and no
 * `filter=` support wired up on the web client for `GET /libraries/:id/items`
 * either — so, deliberately, this fetches every item in the book library once
 * (capped at the BFF's max page size, 500 — see `useAllLibraryItemsQuery`'s doc
 * comment) and derives both the author's name and their book list client-side
 * with `findAuthorBooks`, the same "no dedicated entity fetch, derive from the
 * children" shape `MusicArtistPage.tsx` already uses for a Jellyfin artist. This
 * is out-of-scope-12c-2 content only in the sense that it's still *library*
 * content; no non-library/requestable books are shown here.
 */
import { useNavigate, useParams } from '@tanstack/react-router';
import { Card, Skeleton } from '@auralis/ui';
import { CoverImage } from '../../components/CoverImage.js';
import { useAllLibraryItemsQuery, useLibrariesQuery } from '../../api/queries.js';
import { findAuthorBooks } from './authorBooks.js';
import { useApi } from '../../api/ApiContext.js';

export function AuthorPage() {
  const { authorId } = useParams({ from: '/author/$authorId' });
  const navigate = useNavigate();
  const api = useApi();

  const librariesQuery = useLibrariesQuery(true);
  const bookLibraryId = librariesQuery.data?.libraries.find(
    (library) => library.mediaType === 'book',
  )?.id;

  const itemsQuery = useAllLibraryItemsQuery(bookLibraryId);

  const loading = librariesQuery.isLoading || (Boolean(bookLibraryId) && itemsQuery.isLoading);

  if (loading) {
    return (
      <div className="auralis-page" data-testid="author-page">
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
      <div className="auralis-page" data-testid="author-page">
        <p role="alert">Couldn't load your libraries: {librariesQuery.error.message}</p>
      </div>
    );
  }

  if (!bookLibraryId) {
    return (
      <div className="auralis-page" data-testid="author-page">
        <p>No book library is set up on this server yet.</p>
      </div>
    );
  }

  if (itemsQuery.isError) {
    return (
      <div className="auralis-page" data-testid="author-page">
        <p role="alert">Couldn't load this author's books: {itemsQuery.error.message}</p>
      </div>
    );
  }

  const result = findAuthorBooks(authorId, itemsQuery.data?.items ?? []);

  if (!result) {
    return (
      <div className="auralis-page" data-testid="author-page">
        <h1>Author not found</h1>
        <p data-testid="author-not-found">
          This author isn't in your library — the link may be old, or it may have been removed.
        </p>
      </div>
    );
  }

  return (
    <div className="auralis-page" data-testid="author-page">
      <h1 data-testid="author-name">{result.authorName}</h1>

      <div className="auralis-card-grid" data-testid="author-book-cards">
        {result.books.map((book) => (
          <Card
            key={book.id}
            interactive
            variant="elevated"
            data-testid={`author-book-${book.id}`}
            onClick={() => void navigate({ to: '/item/$itemId', params: { itemId: book.id } })}
          >
            <CoverImage
              src={api.coverUrl(book.id, { width: 200 })}
              size={160}
              fallbackIcon="book_2"
            />
            <h3>{book.title}</h3>
          </Card>
        ))}
      </div>
    </div>
  );
}
