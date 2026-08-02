/**
 * Home. Phase 5 replaces this with real shelves ("Continue listening", "Recently
 * added", series); this phase's job is the shell around it, so Home here simply
 * proves the plumbing end-to-end: it lists the libraries the signed-in user
 * actually has, each linking into `/library/$libraryId`.
 */
import { useNavigate } from '@tanstack/react-router';
import { Card, Skeleton } from '@auralis/ui';
import { useLibrariesQuery, useSetupQuery } from '../../api/queries.js';

export function HomePage() {
  const navigate = useNavigate();
  const setupQuery = useSetupQuery();
  const configured = setupQuery.data?.configured ?? false;
  const librariesQuery = useLibrariesQuery(configured);

  return (
    <div className="auralis-page" data-testid="home-page">
      <h1>Home</h1>

      {!configured ? (
        <p>Connect Audiobookshelf in Settings to see your libraries here.</p>
      ) : librariesQuery.isLoading ? (
        <div className="auralis-card-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shape="rectangular" width={220} height={120} />
          ))}
        </div>
      ) : librariesQuery.isError ? (
        <p role="alert">Couldn't load your libraries: {librariesQuery.error.message}</p>
      ) : (
        <div className="auralis-card-grid" data-testid="library-cards">
          {librariesQuery.data?.libraries.map((library) => (
            <Card
              key={library.id}
              interactive
              variant="elevated"
              data-testid={`library-card-${library.id}`}
              onClick={() =>
                void navigate({ to: '/library/$libraryId', params: { libraryId: library.id } })
              }
            >
              <h2>{library.name}</h2>
              <p>{library.mediaType === 'book' ? 'Audiobooks' : 'Podcasts'}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
