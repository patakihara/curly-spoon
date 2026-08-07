import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from '../../state/playerStore.js';
import { useMusicQueueStore } from '../../state/musicQueueStore.js';
import { usePodcastQueueStore } from '../../state/podcastQueueStore.js';
import { useAudiobookQueueStore } from '../../state/audiobookQueueStore.js';
import type { LibraryItem, PlaybackSession } from '../../api/types.js';
import type { PlaybackSource } from './playbackSource.js';
import {
  attachQueueForCurrentItem,
  installQueueRouter,
  queueContentTypeOf,
  resetQueueRouterForTests,
} from './queueRouter.js';
import { setPodcastEpisodeLoader } from '../podcasts/podcastQueueController.js';
import { setAudiobookLoader } from './audiobookQueueController.js';
import type { PodcastQueueEntry } from './queueEntries.js';

const inertSource: PlaybackSource = {
  reportProgress: { onTick: () => undefined, onEnd: () => undefined },
  resolveTrackUrl: () => null,
};

function musicItem(id: string): LibraryItem {
  return {
    id,
    libraryId: '',
    coverPath: null,
    media: { kind: 'track', title: 'Album' },
    progress: null,
  };
}

function podcastItem(id: string): LibraryItem {
  return {
    id,
    libraryId: '',
    coverPath: null,
    media: { kind: 'podcast', title: 'Podcast' },
    progress: null,
  };
}

function bookItem(id: string): LibraryItem {
  return {
    id,
    libraryId: '',
    coverPath: null,
    media: { kind: 'book', title: 'Book' },
    progress: null,
  };
}

function session(id: string): PlaybackSession {
  return {
    id: `session-${id}`,
    libraryItemId: id,
    episodeId: null,
    mediaType: 'book',
    displayTitle: 'Now Playing',
    duration: 300,
    currentTime: 0,
    audioTracks: [],
    chapters: [],
  };
}

function podcastEntry(n: number): PodcastQueueEntry {
  return { itemId: `pod-${n}`, episodeId: `ep-${n}`, title: `Episode ${n}`, podcastTitle: 'Show' };
}

beforeEach(() => {
  usePlayerStore.getState().close();
  useMusicQueueStore.setState({ queue: null, fetcher: null });
  usePodcastQueueStore.setState({ queue: null });
  useAudiobookQueueStore.setState({ queue: null });
  setPodcastEpisodeLoader(null);
  setAudiobookLoader(null);
  resetQueueRouterForTests();
});

describe('queueContentTypeOf', () => {
  it('maps media.kind onto the queue content type, and null onto null', () => {
    expect(queueContentTypeOf(musicItem('a'))).toBe('music');
    expect(queueContentTypeOf(podcastItem('a'))).toBe('podcast');
    expect(queueContentTypeOf(bookItem('a'))).toBe('audiobook');
    expect(queueContentTypeOf(null)).toBeNull();
  });
});

describe('clearing one content type leaves the other two untouched', () => {
  it('clearing music leaves podcast and audiobook queues intact', () => {
    useMusicQueueStore.setState({
      queue: { order: [], total: 0, positions: [], cursor: 0, shuffled: false, repeat: 'off' },
      fetcher: null,
    });
    usePodcastQueueStore.setState({ queue: { order: [podcastEntry(1)], cursor: 0 } });
    useAudiobookQueueStore.setState({
      queue: { order: [{ kind: 'item', itemId: 'book-1', title: 'Book' }], cursor: 0 },
    });

    useMusicQueueStore.getState().clearQueue();

    expect(useMusicQueueStore.getState().queue).toBeNull();
    expect(usePodcastQueueStore.getState().queue?.order).toHaveLength(1);
    expect(useAudiobookQueueStore.getState().queue?.order).toHaveLength(1);
  });

  it('clearing podcast leaves music and audiobook queues intact', () => {
    useMusicQueueStore.setState({
      queue: { order: [], total: 0, positions: [], cursor: 0, shuffled: false, repeat: 'off' },
      fetcher: null,
    });
    usePodcastQueueStore.setState({ queue: { order: [podcastEntry(1)], cursor: 0 } });
    useAudiobookQueueStore.setState({
      queue: { order: [{ kind: 'item', itemId: 'book-1', title: 'Book' }], cursor: 0 },
    });

    usePodcastQueueStore.getState().clearQueue();

    expect(usePodcastQueueStore.getState().queue).toBeNull();
    expect(useMusicQueueStore.getState().queue).not.toBeNull();
    expect(useAudiobookQueueStore.getState().queue?.order).toHaveLength(1);
  });

  it('clearing audiobook leaves music and podcast queues intact', () => {
    useMusicQueueStore.setState({
      queue: { order: [], total: 0, positions: [], cursor: 0, shuffled: false, repeat: 'off' },
      fetcher: null,
    });
    usePodcastQueueStore.setState({ queue: { order: [podcastEntry(1)], cursor: 0 } });
    useAudiobookQueueStore.setState({
      queue: { order: [{ kind: 'item', itemId: 'book-1', title: 'Book' }], cursor: 0 },
    });

    useAudiobookQueueStore.getState().clearQueue();

    expect(useAudiobookQueueStore.getState().queue).toBeNull();
    expect(useMusicQueueStore.getState().queue).not.toBeNull();
    expect(usePodcastQueueStore.getState().queue?.order).toHaveLength(1);
  });
});

describe('a podcast queue survives an unrelated music item playing (docs/ROADMAP.md §12f req. 1)', () => {
  it('is unchanged, cursor included, after a music item loads and plays and the podcast reloads', () => {
    usePodcastQueueStore.setState({
      queue: { order: [podcastEntry(1), podcastEntry(2), podcastEntry(3)], cursor: 1 },
    });
    const podcastQueueBefore = usePodcastQueueStore.getState().queue;

    usePlayerStore.getState().load(musicItem('album-1'), session('album-1'), inertSource);
    usePlayerStore.getState().play();

    expect(usePodcastQueueStore.getState().queue).toEqual(podcastQueueBefore);

    usePlayerStore.getState().load(podcastItem('pod-1'), session('pod-1'), inertSource);

    expect(usePodcastQueueStore.getState().queue).toEqual(podcastQueueBefore);
  });
});

describe('attachQueueForCurrentItem', () => {
  it('attaches the handler for whichever content type is loaded, and returns that type', () => {
    usePlayerStore.getState().load(musicItem('album-1'), session('album-1'), inertSource);
    expect(attachQueueForCurrentItem()).toBe('music');

    usePlayerStore.getState().load(podcastItem('pod-1'), session('pod-1'), inertSource);
    expect(attachQueueForCurrentItem()).toBe('podcast');

    usePlayerStore.getState().load(bookItem('book-1'), session('book-1'), inertSource);
    expect(attachQueueForCurrentItem()).toBe('audiobook');
  });

  it('returns null when nothing is loaded', () => {
    expect(attachQueueForCurrentItem()).toBeNull();
  });
});

describe('installQueueRouter (via playerStore.load, per-content-type isolation)', () => {
  it("re-attaches the right handler on every load and only advances that type's queue on ended", async () => {
    installQueueRouter();

    useMusicQueueStore.setState({
      queue: {
        order: [
          { id: 't0', title: 'T0', durationSeconds: 100 },
          { id: 't1', title: 'T1', durationSeconds: 100 },
        ],
        total: 2,
        positions: [0, 1],
        cursor: 0,
        shuffled: false,
        repeat: 'off',
      },
      fetcher: vi.fn(),
    });
    usePodcastQueueStore.setState({
      queue: { order: [podcastEntry(1), podcastEntry(2)], cursor: 0 },
    });
    useAudiobookQueueStore.setState({
      queue: {
        order: [
          { kind: 'item', itemId: 'book-a', title: 'A' },
          { kind: 'item', itemId: 'book-b', title: 'B' },
        ],
        cursor: 0,
      },
    });

    usePlayerStore.getState().load(musicItem('album-1'), session('album-1'), inertSource);
    usePlayerStore.getState().play();

    const onTrackEnded = usePlayerStore.getState().onTrackEnded;
    expect(onTrackEnded).not.toBeNull();
    onTrackEnded?.();
    await Promise.resolve().then(() => Promise.resolve());

    expect(useMusicQueueStore.getState().queue?.cursor).toBe(1);
    expect(usePodcastQueueStore.getState().queue?.cursor).toBe(0);
    expect(useAudiobookQueueStore.getState().queue?.cursor).toBe(0);
  });

  it('regression: a music queue still auto-advances after a podcast has been loaded and the music item re-loaded', async () => {
    installQueueRouter();

    useMusicQueueStore.setState({
      queue: {
        order: [
          { id: 't0', title: 'T0', durationSeconds: 100 },
          { id: 't1', title: 'T1', durationSeconds: 100 },
        ],
        total: 2,
        positions: [0, 1],
        cursor: 0,
        shuffled: false,
        repeat: 'off',
      },
      fetcher: vi.fn(),
    });

    // Start the music queue, then switch away to a podcast (this is what used to permanently
    // clear `onTrackEnded` for the album — see this file's own header).
    usePlayerStore.getState().load(musicItem('album-1'), session('album-1'), inertSource);
    usePlayerStore.getState().play();
    usePlayerStore.getState().load(podcastItem('pod-1'), session('pod-1'), inertSource);

    // Come back to the same album.
    usePlayerStore.getState().load(musicItem('album-1'), session('album-1'), inertSource);
    usePlayerStore.getState().play();

    const onTrackEnded = usePlayerStore.getState().onTrackEnded;
    expect(onTrackEnded).not.toBeNull();
    onTrackEnded?.();
    await Promise.resolve().then(() => Promise.resolve());

    expect(useMusicQueueStore.getState().queue?.cursor).toBe(1);
  });
});
