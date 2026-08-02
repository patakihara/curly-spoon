/**
 * Library browse. Phase 5 adds filter/sort/series grouping; this phase renders
 * the plain item list so the route, the BFF call and the loading/error/empty
 * states are all real and exercised end-to-end.
 */
import { useNavigate, useParams } from '@tanstack/react-router';
import { Card, Skeleton } from '@auralis/ui';
import { useLibraryItemsQuery } from '../../api/queries.js';

export function LibraryPage() {
  const { libraryId } = useParams({ from: '/library/$libraryId' });
  const navigate = useNavigate();
  const itemsQuery = useLibraryItemsQuery(libraryId);

  return (
    <div className="auralis-page" data-testid="library-page">
      <h1>Library</h1>

      {itemsQuery.isLoading ? (
        <div className="auralis-card-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="rectangular" width={180} height={240} />
          ))}
        </div>
      ) : itemsQuery.isError ? (
        <p role="alert">Couldn't load this library: {itemsQuery.error.message}</p>
      ) : itemsQuery.data && itemsQuery.data.items.length === 0 ? (
        <p>This library is empty.</p>
      ) : (
        <div className="auralis-card-grid" data-testid="library-item-cards">
          {itemsQuery.data?.items.map((item) => (
            <Card
              key={item.id}
              interactive
              variant="elevated"
              data-testid={`item-card-${item.id}`}
              onClick={() => void navigate({ to: '/item/$itemId', params: { itemId: item.id } })}
            >
              <h2>{item.media.title}</h2>
              {item.media.authors?.length ? (
                <p>{item.media.authors.map((a) => a.name).join(', ')}</p>
              ) : null}
              {item.media.author ? <p>{item.media.author}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
