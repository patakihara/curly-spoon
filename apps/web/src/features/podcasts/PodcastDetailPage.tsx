/**
 * Podcast detail: cover, metadata, and the episode list — the podcast sibling of
 * `features/item/ItemPage.tsx`'s book detail view. Kept as its own component and
 * route (`/podcast/$itemId`, `LibraryPage.tsx`'s click handler routes here for
 * `media.kind === 'podcast'`) rather than branching inside `ItemPage` itself: a
 * podcast container has no single audio stream of its own to "Play"/"Resume" —
 * every playable thing here is one of its episodes — so the two pages' layouts
 * diverge enough that sharing one component would mean threading a kind check
 * through most of its JSX.
 *
 * Reuses `useItemQuery` unchanged (same `GET /items/:id?expanded=1&include=progress`
 * `ItemPage` already uses) — an expanded fetch is what populates `media.episodes`
 * (`packages/abs-client`'s minified/expanded split), and it's already the shape
 * this app fetches for every item detail view, book or podcast.
 *
 * **Restyled against the shared `MediaHeader`** (16e-podcast-W,
 * `docs/design/screens/PODCAST_DETAIL.md` §9) — the header block this page used to own
 * inline is now the same component `ItemPage.tsx` uses. Two behaviours the spec adds
 * beyond the restyle: a composed episode-count/unplayed-count meta line (`podcastMeta.ts`,
 * §5) and a "Play latest" header action (§6) that is pure sugar over the existing
 * per-episode `handlePlayEpisode` path — sort newest-first, take the first, call the same
 * function every episode row already calls. Its loading/error state therefore reuses the
 * existing `pendingEpisodeId`/`playError` state machine unchanged; no new state was added.
 */
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Button, Chip, Icon, ListItem, Skeleton } from '@auralis/ui';
import { RichDescription } from '../../components/RichDescription.js';
import { MediaHeader, MEDIA_HEADER_SUBTITLE_CLASS } from '../../components/MediaHeader.js';
import { useApi } from '../../api/ApiContext.js';
import { useItemQuery, useMyProgressQuery, usePlayEpisodeMutation } from '../../api/queries.js';
import { ApiError } from '../../api/errors.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { formatDuration } from '../player/playback.js';
import { audiobookshelfSource } from '../player/playbackSource.js';
import { sortEpisodes, type EpisodeOrder } from './episodeOrder.js';
import { episodeProgressState, findEpisodeProgress } from './episodeProgress.js';
import { composePodcastMeta } from './podcastMeta.js';

const ORDER_OPTIONS: Array<{ key: EpisodeOrder; label: string }> = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
];

/** `publishedAt` is epoch-ms or `null` (an undated feed entry) — degrades to a dash rather than "Invalid Date". */
function formatPublishedAt(publishedAt: number | null): string {
  if (publishedAt === null) return '—';
  return new Date(publishedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PodcastDetailPage() {
  const { itemId } = useParams({ from: '/podcast/$itemId' });
  const api = useApi();
  const itemQuery = useItemQuery(itemId);
  const progressQuery = useMyProgressQuery();
  const playEpisodeMutation = usePlayEpisodeMutation();

  const [order, setOrder] = useState<EpisodeOrder>('newest');
  const [pendingEpisodeId, setPendingEpisodeId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<{ episodeId: string; message: string } | null>(null);

  if (itemQuery.isLoading) {
    return (
      <div className="auralis-page" data-testid="podcast-detail-page">
        <p>Loading…</p>
      </div>
    );
  }

  // Same reasoning as ItemPage: a detail page with nothing to show hands off to
  // the route's RouteErrorBoundary rather than rendering an inline message.
  if (itemQuery.isError) throw itemQuery.error;

  const item = itemQuery.data?.item;
  if (!item) return null;

  if (item.media.kind !== 'podcast') {
    return (
      <div className="auralis-page" data-testid="podcast-detail-page">
        <p role="alert">This item isn't a podcast.</p>
      </div>
    );
  }

  const episodes = sortEpisodes(item.media.episodes ?? [], order);
  const allProgress = progressQuery.data?.progress ?? [];

  // The header's meta line and "Play latest" both need the newest episode and
  // the unplayed count independent of the user's chosen `order` (§5, §6) — computed
  // from the raw, unsorted list rather than `episodes` (which follows `order`).
  const rawEpisodes = item.media.episodes ?? [];
  const unplayedCount = rawEpisodes.filter(
    (episode) =>
      episodeProgressState(findEpisodeProgress(allProgress, item.id, episode.id)) !== 'played',
  ).length;
  const meta = composePodcastMeta(rawEpisodes.length, unplayedCount);
  const newestEpisode = sortEpisodes(rawEpisodes, 'newest')[0];

  const handlePlayEpisode = async (episodeId: string) => {
    setPlayError(null);
    setPendingEpisodeId(episodeId);
    try {
      const { session } = await playEpisodeMutation.mutateAsync({ itemId: item.id, episodeId });
      usePlayerStore.getState().load(item, session, audiobookshelfSource(api, item.id, session.id));
      usePlayerStore.getState().play();
    } catch (err) {
      const apiError =
        err instanceof ApiError ? err : new ApiError('unknown_error', String(err), 0);
      setPlayError({
        episodeId,
        message: apiError.isNetworkError
          ? "Couldn't reach the Auralis server. Try again."
          : apiError.message || 'Could not start playback.',
      });
    } finally {
      setPendingEpisodeId(null);
    }
  };

  // "Play latest" (§6, new): sort newest-first, take the first, call the exact
  // same per-episode play path every episode row already calls with that
  // episode's id — sugar over an existing action, no new play concept.
  const handlePlayLatest = () => {
    if (newestEpisode) void handlePlayEpisode(newestEpisode.id);
  };

  return (
    <div className="auralis-page" data-testid="podcast-detail-page">
      <MediaHeader
        coverSrc={api.coverUrl(item.id, { width: 400 })}
        fallbackIcon="podcasts"
        kindLabel="Podcast"
        title={item.media.title}
        subtitle={
          item.media.author ? (
            <p className={MEDIA_HEADER_SUBTITLE_CLASS}>{item.media.author}</p>
          ) : null
        }
        meta={meta}
        actions={
          newestEpisode ? (
            <Button
              data-testid="podcast-play-latest"
              loading={pendingEpisodeId === newestEpisode.id}
              onClick={handlePlayLatest}
            >
              Play latest
            </Button>
          ) : null
        }
      />

      <RichDescription
        html={item.media.description}
        className="auralis-item-description"
        data-testid="item-description"
      />

      <section>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <h2>Episodes</h2>
          <div
            data-testid="episode-order-controls"
            role="group"
            aria-label="Episode order"
            style={{ display: 'flex', gap: 8 }}
          >
            {ORDER_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                variant="filter"
                selected={order === option.key}
                onSelectedChange={() => setOrder(option.key)}
                data-testid={`episode-order-${option.key}`}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>

        {episodes.length === 0 ? (
          <p>This podcast has no episodes yet.</p>
        ) : (
          <ul
            data-testid="podcast-episode-list"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {episodes.map((episode) => {
              const state = episodeProgressState(
                findEpisodeProgress(allProgress, item.id, episode.id),
              );
              const isPending = pendingEpisodeId === episode.id;
              return (
                <li key={episode.id}>
                  <ListItem
                    data-testid={`podcast-episode-${episode.id}`}
                    headline={episode.title}
                    overline={formatPublishedAt(episode.publishedAt)}
                    supportingText={`${formatDuration(episode.duration)}${
                      state === 'played'
                        ? ' · Played'
                        : state === 'in-progress'
                          ? ' · In progress'
                          : ''
                    }`}
                    trailing={
                      isPending ? (
                        <Skeleton shape="circular" width={24} height={24} />
                      ) : state === 'played' ? (
                        <Icon name="check" />
                      ) : (
                        <Icon name="play" />
                      )
                    }
                    disabled={isPending}
                    aria-busy={isPending}
                    onClick={() => void handlePlayEpisode(episode.id)}
                  />
                  {playError?.episodeId === episode.id ? (
                    <p role="alert" data-testid={`podcast-episode-error-${episode.id}`}>
                      {playError.message}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
