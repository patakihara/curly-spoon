/**
 * The `/books` destination (`docs/ROADMAP.md` §12a): a stable nav path that
 * resolves to the first `mediaType: 'book'` library at render time, rather
 * than baking a library id into the nav destination the way the old Books
 * link (`/library/$libraryId`) did. `/library/$libraryId` itself is
 * unchanged — this renders the identical `LibraryView`.
 */
import { useLibrariesQuery } from '../../api/queries.js';
import { Skeleton } from '@auralis/ui';
import { LibraryView } from './LibraryPage.js';

export function BooksPage() {
  const librariesQuery = useLibrariesQuery(true);
  const bookLibraryId = librariesQuery.data?.libraries.find(
    (library) => library.mediaType === 'book',
  )?.id;

  if (librariesQuery.isLoading) {
    return (
      <div className="auralis-page" data-testid="books-page">
        <div className="auralis-card-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="rectangular" width={180} height={240} />
          ))}
        </div>
      </div>
    );
  }

  if (librariesQuery.isError) {
    return (
      <div className="auralis-page" data-testid="books-page">
        <p role="alert">Couldn't load your libraries: {librariesQuery.error.message}</p>
      </div>
    );
  }

  if (!bookLibraryId) {
    return (
      <div className="auralis-page" data-testid="books-page">
        <p>No book library is set up on this server yet.</p>
      </div>
    );
  }

  return (
    <div data-testid="books-page">
      <LibraryView libraryId={bookLibraryId} />
    </div>
  );
}
