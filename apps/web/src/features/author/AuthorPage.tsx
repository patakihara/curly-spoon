/**
 * An author's own page (`/author/$authorId`) — their books in the library.
 * Reached from a Search "Authors" result, the same way `SeriesPage` is reached
 * from a "Series" one.
 *
 * Backed by `GET /authors/:id` (`useAuthorQuery`), a real per-entity fetch —
 * not the "fetch every item, match client-side" shape this page used to use
 * (`findAuthorBooks`, now deleted). That matching could never work: every path
 * that lists items returns *minified* Audiobookshelf items, and a minified
 * item's `media.authors[]` is a single fallback entry whose `id` is the
 * author's *name*, never a real author id (the trap documented on
 * `packages/abs-client`'s `domain.ts` header) — so `authorId === author.id`
 * never matched, and `/author/*` was dead on arrival regardless of which
 * author was clicked. `AbsClient.getAuthor`'s own doc comment has the full
 * source trace for the replacement endpoint.
 *
 * A 404 from that endpoint is a real "author not found" (an unknown/removed
 * author id), distinct from any other fetch failure — see the two error
 * branches below.
 */
import { useNavigate, useParams } from '@tanstack/react-router';
import { Card, Skeleton } from '@auralis/ui';
import { CoverImage } from '../../components/CoverImage.js';
import { useAuthorQuery } from '../../api/queries.js';
import { useApi } from '../../api/ApiContext.js';
import { ApiError } from '../../api/errors.js';

export function AuthorPage() {
  const { authorId } = useParams({ from: '/author/$authorId' });
  const navigate = useNavigate();
  const api = useApi();

  const authorQuery = useAuthorQuery(authorId);

  if (authorQuery.isLoading) {
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

  if (authorQuery.isError) {
    if (authorQuery.error instanceof ApiError && authorQuery.error.status === 404) {
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
        <p role="alert">Couldn't load this author: {authorQuery.error.message}</p>
      </div>
    );
  }

  const author = authorQuery.data;
  // Unreachable in practice — `isLoading`/`isError` above are exhaustive over
  // this query's states — but `data` is still typed `T | undefined`, so this
  // is here purely to satisfy that rather than asserting past it.
  if (!author) return null;

  return (
    <div className="auralis-page" data-testid="author-page">
      <h1 data-testid="author-name">{author.name}</h1>
      {author.description ? <p>{author.description}</p> : null}

      <div className="auralis-card-grid" data-testid="author-book-cards">
        {author.books.map((book) => (
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
            <h3>{book.media.title}</h3>
          </Card>
        ))}
      </div>
    </div>
  );
}
