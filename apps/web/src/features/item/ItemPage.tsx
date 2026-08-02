/**
 * Item detail. Phase 5 adds the full player (chapters, speed, sleep timer,
 * bookmarks); this phase shows the metadata the BFF already returns, so the
 * route and its loading/error states are real.
 */
import { useParams } from '@tanstack/react-router';
import { LinearProgress } from '@auralis/ui';
import { useApi } from '../../api/ApiContext.js';
import { useItemQuery } from '../../api/queries.js';

export function ItemPage() {
  const { itemId } = useParams({ from: '/item/$itemId' });
  const api = useApi();
  const itemQuery = useItemQuery(itemId);

  if (itemQuery.isLoading) {
    return (
      <div className="auralis-page" data-testid="item-page">
        <p>Loading…</p>
      </div>
    );
  }

  // Unlike list pages (which degrade to an inline message so the rest of the
  // page stays usable), a detail page with no data has nothing else useful to
  // show — throwing hands it to this route's `errorComponent`
  // (`RouteErrorBoundary`), the real "something broke, try again" surface
  // rather than a bare inline message.
  if (itemQuery.isError) throw itemQuery.error;

  const item = itemQuery.data?.item;
  if (!item) return null;

  return (
    <div className="auralis-page" data-testid="item-page">
      <div className="auralis-item-header">
        <img
          className="auralis-item-cover"
          src={api.coverUrl(item.id, { width: 400 })}
          alt=""
          width={200}
          height={200}
        />
        <div>
          <h1>{item.media.title}</h1>
          {item.media.subtitle ? <p>{item.media.subtitle}</p> : null}
          {item.media.authors?.length ? <p>{item.media.authors.map((a) => a.name).join(', ')}</p> : null}
          {item.media.narrator ? <p>Narrated by {item.media.narrator}</p> : null}
        </div>
      </div>

      {item.progress ? (
        <div className="auralis-item-progress" data-testid="item-progress">
          <LinearProgress value={item.progress.progress} aria-label="Listening progress" />
        </div>
      ) : null}

      {item.media.description ? (
        <p className="auralis-item-description">{item.media.description}</p>
      ) : null}
    </div>
  );
}
