/**
 * A previewed RSS feed, with the subscribe action.
 *
 * Showing the real parsed feed — title, artwork, description, and actual episodes —
 * before `POST /podcasts` runs is the point of this whole wave: it is what makes
 * subscribing to an arbitrary RSS URL safe, rather than a leap of faith based on a
 * directory search snippet. See `PodcastDiscoverPage`'s doc comment for how a preview
 * is reached (a directory result, or a pasted URL).
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Chip } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import { useSubscribePodcastMutation } from '../../api/queries.js';
import type {
  Library,
  PodcastDirectoryResult,
  PodcastFeedPreview as FeedPreview,
} from '../../api/types.js';
import { formatDuration } from '../player/playback.js';
import { buildSubscribeBody } from './subscribeMetadata.js';

function formatEpisodeDate(publishedAt: number | null, pubDate: string | null): string | null {
  const time = publishedAt ?? (pubDate ? Date.parse(pubDate) : NaN);
  if (!Number.isFinite(time)) return pubDate;
  return new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export interface PodcastFeedPreviewProps {
  preview: FeedPreview;
  rssFeed: string;
  /** The directory search result this preview was reached from, if any — carries
   * `itunesId`/`pageUrl` onto the subscribe body. `undefined` when the user pasted
   * the RSS URL directly instead of picking a search result. */
  directoryResult?: PodcastDirectoryResult | null;
  /** The server's podcast-mediaType library, if one exists — `undefined` means there
   * is nowhere to subscribe into yet. */
  podcastLibrary: Library | undefined;
}

export function PodcastFeedPreview({
  preview,
  rssFeed,
  directoryResult,
  podcastLibrary,
}: PodcastFeedPreviewProps) {
  const subscribeMutation = useSubscribePodcastMutation();
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  // Guards the two local-state updates below against landing after this component has
  // unmounted (e.g. the user navigates away mid-subscribe). The mutation's own cache
  // invalidation (`useSubscribePodcastMutation`'s `onSuccess`) isn't affected either way —
  // React Query owns that lifecycle independently of this component — so an unguarded
  // subscribe still leaves the subscription correctly reflected elsewhere; only this
  // component's own `subscribed`/`subscribeError` state needs the guard.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const body = podcastLibrary
    ? buildSubscribeBody({ preview, rssFeed, library: podcastLibrary, directoryResult })
    : null;

  const handleSubscribe = async () => {
    if (!body) return;
    setSubscribeError(null);
    try {
      await subscribeMutation.mutateAsync(body);
      if (mountedRef.current) setSubscribed(true);
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof ApiError ? err.message : 'Could not subscribe to this podcast.';
      setSubscribeError(message);
    }
  };

  return (
    <section data-testid="podcast-preview">
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {preview.image ? (
          <img
            src={preview.image}
            alt=""
            width={96}
            height={96}
            style={{ borderRadius: 12, objectFit: 'cover' }}
          />
        ) : null}
        <div>
          <h2>{preview.title ?? 'Untitled podcast'}</h2>
          {preview.author ? <p>{preview.author}</p> : null}
          {(preview.descriptionPlain ?? preview.description) ? (
            <p>{preview.descriptionPlain ?? preview.description}</p>
          ) : null}
          <p>{preview.numEpisodes} episodes</p>
        </div>
      </div>

      {!podcastLibrary ? (
        <p role="alert" data-testid="podcast-preview-no-library">
          No podcast library is configured on your Audiobookshelf server — connect one before
          subscribing.
        </p>
      ) : subscribed ? (
        <Chip variant="assist" data-testid="podcast-subscribe-success">
          Subscribed
        </Chip>
      ) : (
        <Button
          variant="filled"
          onClick={() => void handleSubscribe()}
          disabled={!body || subscribeMutation.isPending}
          data-testid="podcast-subscribe"
        >
          {subscribeMutation.isPending ? 'Subscribing…' : 'Subscribe'}
        </Button>
      )}

      {subscribeError ? (
        <p role="alert" data-testid="podcast-subscribe-error">
          {subscribeError}
        </p>
      ) : null}

      {preview.episodes.length > 0 ? (
        <ul
          data-testid="podcast-preview-episodes"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {preview.episodes.map((episode) => (
            <li key={episode.guid ?? episode.title}>
              <Card variant="outlined">
                <strong>{episode.title}</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {formatEpisodeDate(episode.publishedAt, episode.pubDate) ? (
                    <span>{formatEpisodeDate(episode.publishedAt, episode.pubDate)}</span>
                  ) : null}
                  {episode.durationSeconds !== null ? (
                    <span>{formatDuration(episode.durationSeconds)}</span>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
