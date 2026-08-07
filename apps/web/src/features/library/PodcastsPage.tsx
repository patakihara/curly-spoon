/**
 * The `/podcasts` destination (`docs/ROADMAP.md` §12a) — the podcast twin of
 * `BooksPage.tsx`. See that file's doc comment for the reasoning: a stable
 * nav path resolving to the first `mediaType: 'podcast'` library at render
 * time, rendering the same `LibraryView` `/library/$libraryId` does.
 */
import { useLibrariesQuery } from '../../api/queries.js';
import { Skeleton } from '@auralis/ui';
import { LibraryView } from './LibraryPage.js';

export function PodcastsPage() {
  const librariesQuery = useLibrariesQuery(true);
  const podcastLibraryId = librariesQuery.data?.libraries.find(
    (library) => library.mediaType === 'podcast',
  )?.id;

  if (librariesQuery.isLoading) {
    return (
      <div className="auralis-page" data-testid="podcasts-page">
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
      <div className="auralis-page" data-testid="podcasts-page">
        <p role="alert">Couldn't load your libraries: {librariesQuery.error.message}</p>
      </div>
    );
  }

  if (!podcastLibraryId) {
    return (
      <div className="auralis-page" data-testid="podcasts-page">
        <p>No podcast library is set up on this server yet.</p>
      </div>
    );
  }

  return (
    <div data-testid="podcasts-page">
      <LibraryView libraryId={podcastLibraryId} />
    </div>
  );
}
