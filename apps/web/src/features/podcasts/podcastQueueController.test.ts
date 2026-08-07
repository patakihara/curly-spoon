import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from '../../state/playerStore.js';
import { usePodcastQueueStore } from '../../state/podcastQueueStore.js';
import type { LibraryItem, PlaybackSession } from '../../api/types.js';
import type { PlaybackSource } from '../player/playbackSource.js';
import {
  attachPodcastQueueEndedHandler,
  handlePodcastQueueEnded,
  setPodcastEpisodeLoader,
} from './podcastQueueController.js';
import type { PodcastQueueEntry } from '../player/queueEntries.js';

const inertSource: PlaybackSource = {
  reportProgress: { onTick: () => undefined, onEnd: () => undefined },
  resolveTrackUrl: () => null,
};

function podcastItem(id: string): LibraryItem {
  return {
    id,
    libraryId: '',
    coverPath: null,
    media: { kind: 'podcast', title: 'Show' },
    progress: null,
  };
}

function session(id: string, episodeId: string | null): PlaybackSession {
  return {
    id: `session-${id}`,
    libraryItemId: id,
    episodeId,
    mediaType: 'podcast',
    displayTitle: 'Episode',
    duration: 300,
    currentTime: 0,
    audioTracks: [],
    chapters: [],
  };
}

function entry(n: number): PodcastQueueEntry {
  return { itemId: `pod-1`, episodeId: `ep-${n}`, title: `Episode ${n}`, podcastTitle: 'Show' };
}

beforeEach(() => {
  usePlayerStore.getState().close();
  usePodcastQueueStore.setState({ queue: null });
  setPodcastEpisodeLoader(null);
});

describe('handlePodcastQueueEnded', () => {
  it('pauses without throwing when no queue is installed', async () => {
    usePlayerStore.getState().play();
    await handlePodcastQueueEnded();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('pauses when a queue exists but no loader is installed', async () => {
    usePodcastQueueStore.setState({ queue: { order: [entry(1), entry(2)], cursor: 0 } });
    usePlayerStore.getState().play();
    await handlePodcastQueueEnded();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('loads and plays the next queued episode via the injected loader', async () => {
    usePodcastQueueStore.setState({ queue: { order: [entry(1), entry(2)], cursor: 0 } });
    const loader = vi.fn().mockResolvedValue({
      item: podcastItem('pod-1'),
      session: session('pod-1', 'ep-2'),
      source: inertSource,
    });
    setPodcastEpisodeLoader(loader);

    await handlePodcastQueueEnded();

    expect(loader).toHaveBeenCalledWith(entry(2));
    expect(usePodcastQueueStore.getState().queue?.cursor).toBe(1);
    expect(usePlayerStore.getState().episodeId).toBe('ep-2');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('pauses rather than throwing when the loader rejects', async () => {
    usePodcastQueueStore.setState({ queue: { order: [entry(1), entry(2)], cursor: 0 } });
    setPodcastEpisodeLoader(vi.fn().mockRejectedValue(new Error('network down')));
    usePlayerStore.getState().play();

    await handlePodcastQueueEnded();

    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('pauses when the queue is already at its last entry', async () => {
    usePodcastQueueStore.setState({ queue: { order: [entry(1), entry(2)], cursor: 1 } });
    setPodcastEpisodeLoader(vi.fn());
    usePlayerStore.getState().play();

    await handlePodcastQueueEnded();

    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});

describe('attachPodcastQueueEndedHandler', () => {
  it('installs a handler that drives handlePodcastQueueEnded when onTrackEnded fires', async () => {
    usePodcastQueueStore.setState({ queue: { order: [entry(1), entry(2)], cursor: 0 } });
    const loader = vi.fn().mockResolvedValue({
      item: podcastItem('pod-1'),
      session: session('pod-1', 'ep-2'),
      source: inertSource,
    });
    setPodcastEpisodeLoader(loader);

    usePlayerStore.getState().load(podcastItem('pod-1'), session('pod-1', 'ep-1'), inertSource);
    attachPodcastQueueEndedHandler();
    usePlayerStore.getState().play();

    const onTrackEnded = usePlayerStore.getState().onTrackEnded;
    expect(onTrackEnded).not.toBeNull();
    onTrackEnded?.();
    await Promise.resolve().then(() => Promise.resolve());

    expect(loader).toHaveBeenCalled();
    expect(usePlayerStore.getState().episodeId).toBe('ep-2');
  });
});
