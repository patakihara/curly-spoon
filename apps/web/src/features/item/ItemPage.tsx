/**
 * Item detail — metadata plus the entry point into playback. Starting playback
 * needs a session (`POST /items/:id/play`), not just the item metadata already
 * on this page, because only the session carries tracks/chapters/the resume
 * point; the item alone is display chrome (see `playerStore.ts`'s header).
 */
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, LinearProgress } from '@auralis/ui';
import { RichDescription } from '../../components/RichDescription.js';
import { CoverImage } from '../../components/CoverImage.js';
import { useApi } from '../../api/ApiContext.js';
import { useItemQuery, usePlayItemMutation } from '../../api/queries.js';
import { ApiError } from '../../api/errors.js';
import { audiobookshelfSource } from '../player/playbackSource.js';
import { usePlayerStore } from '../../state/playerStore.js';

export function ItemPage() {
  const { itemId } = useParams({ from: '/item/$itemId' });
  const api = useApi();
  const itemQuery = useItemQuery(itemId);
  const playMutation = usePlayItemMutation();
  const [playError, setPlayError] = useState<string | null>(null);

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

  const handlePlay = async () => {
    setPlayError(null);
    try {
      const { session } = await playMutation.mutateAsync(item.id);
      usePlayerStore.getState().load(item, session, audiobookshelfSource(api, item.id, session.id));
      usePlayerStore.getState().play();
    } catch (err) {
      const apiError =
        err instanceof ApiError ? err : new ApiError('unknown_error', String(err), 0);
      setPlayError(
        apiError.isNetworkError
          ? "Couldn't reach the Auralis server. Try again."
          : apiError.message || 'Could not start playback.',
      );
    }
  };

  return (
    <div className="auralis-page" data-testid="item-page">
      <div className="auralis-item-header">
        <CoverImage
          src={api.coverUrl(item.id, { width: 400 })}
          alt=""
          size={200}
          fallbackIcon="book_2"
          style={{ borderRadius: 'var(--m3-shape-lg)' }}
        />
        <div className="auralis-item-header__meta">
          <h1>{item.media.title}</h1>
          {item.media.subtitle ? <p>{item.media.subtitle}</p> : null}
          {item.media.authors?.length ? (
            <p>{item.media.authors.map((a) => a.name).join(', ')}</p>
          ) : null}
          {item.media.narrator ? <p>Narrated by {item.media.narrator}</p> : null}
          <Button
            data-testid="item-play"
            loading={playMutation.isPending}
            onClick={() => void handlePlay()}
          >
            {item.progress ? 'Resume' : 'Play'}
          </Button>
          {playError ? (
            <p role="alert" data-testid="item-play-error">
              {playError}
            </p>
          ) : null}
        </div>
      </div>

      {item.progress ? (
        <div className="auralis-item-progress" data-testid="item-progress">
          <LinearProgress value={item.progress.progress} aria-label="Listening progress" />
        </div>
      ) : null}

      <RichDescription
        html={item.media.description}
        className="auralis-item-description"
        data-testid="item-description"
      />
    </div>
  );
}
