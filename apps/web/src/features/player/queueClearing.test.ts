/**
 * Store-level coverage for `clearQueue()` across all three real queue stores — the piece of
 * this wave's "clear the queue, for every content type" requirement (docs/ROADMAP.md §12f)
 * that `e2e/app/queue-view.spec.ts` cannot exercise for podcasts specifically: no page in this
 * app calls `usePodcastQueueStore().setQueue` anywhere yet (see that spec file's own header),
 * so a podcast queue can never become non-empty through a real user flow today, and there is
 * nothing for a browser test to click "clear" on. This file exercises the real, production
 * `usePodcastQueueStore`/`useAudiobookQueueStore`/`useMusicQueueStore` instances directly
 * instead — not a reimplementation, the same singletons `QueueView.tsx` reads from — proving
 * `clearQueue()` actually empties each one and never touches the other two
 * (docs/ROADMAP.md §12f, requirement 1), which is what an e2e click would otherwise be
 * proving for podcasts too if a queueing UI existed for them.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useMusicQueueStore } from '../../state/musicQueueStore.js';
import { usePodcastQueueStore } from '../../state/podcastQueueStore.js';
import { useAudiobookQueueStore } from '../../state/audiobookQueueStore.js';
import type { MusicQueueState } from '../music/musicQueue.js';

const music: MusicQueueState = {
  order: [{ id: 't1', title: 'Song', durationSeconds: 200, artist: 'Someone' }],
  total: 1,
  positions: [0],
  cursor: 0,
  shuffled: false,
  repeat: 'off',
};

beforeEach(() => {
  useMusicQueueStore.setState({ queue: null, fetcher: null });
  usePodcastQueueStore.setState({ queue: null });
  useAudiobookQueueStore.setState({ queue: null });
});

describe('clearQueue, per store', () => {
  it('empties a populated podcast queue', () => {
    usePodcastQueueStore.setState({
      queue: {
        order: [{ itemId: 'pod-1', episodeId: 'ep-1', title: 'Episode', podcastTitle: 'Show' }],
        cursor: 0,
      },
    });

    usePodcastQueueStore.getState().clearQueue();

    expect(usePodcastQueueStore.getState().queue).toBeNull();
  });

  it('empties a populated audiobook queue', () => {
    useAudiobookQueueStore.setState({
      queue: { order: [{ kind: 'item', itemId: 'book-1', title: 'A Book' }], cursor: 0 },
    });

    useAudiobookQueueStore.getState().clearQueue();

    expect(useAudiobookQueueStore.getState().queue).toBeNull();
  });

  it('empties a populated music queue', () => {
    useMusicQueueStore.setState({ queue: music, fetcher: null });

    useMusicQueueStore.getState().clearQueue();

    expect(useMusicQueueStore.getState().queue).toBeNull();
  });

  it('clearing the podcast queue never touches the music or audiobook queues', () => {
    useMusicQueueStore.setState({ queue: music, fetcher: null });
    usePodcastQueueStore.setState({
      queue: {
        order: [{ itemId: 'pod-1', episodeId: 'ep-1', title: 'Episode', podcastTitle: 'Show' }],
        cursor: 0,
      },
    });
    useAudiobookQueueStore.setState({
      queue: { order: [{ kind: 'item', itemId: 'book-1', title: 'A Book' }], cursor: 0 },
    });

    usePodcastQueueStore.getState().clearQueue();

    expect(usePodcastQueueStore.getState().queue).toBeNull();
    expect(useMusicQueueStore.getState().queue).not.toBeNull();
    expect(useAudiobookQueueStore.getState().queue).not.toBeNull();
  });

  it('clearing the audiobook queue never touches the music or podcast queues', () => {
    useMusicQueueStore.setState({ queue: music, fetcher: null });
    usePodcastQueueStore.setState({
      queue: {
        order: [{ itemId: 'pod-1', episodeId: 'ep-1', title: 'Episode', podcastTitle: 'Show' }],
        cursor: 0,
      },
    });
    useAudiobookQueueStore.setState({
      queue: { order: [{ kind: 'item', itemId: 'book-1', title: 'A Book' }], cursor: 0 },
    });

    useAudiobookQueueStore.getState().clearQueue();

    expect(useAudiobookQueueStore.getState().queue).toBeNull();
    expect(useMusicQueueStore.getState().queue).not.toBeNull();
    expect(usePodcastQueueStore.getState().queue).not.toBeNull();
  });

  it('clearing the music queue never touches the podcast or audiobook queues', () => {
    useMusicQueueStore.setState({ queue: music, fetcher: null });
    usePodcastQueueStore.setState({
      queue: {
        order: [{ itemId: 'pod-1', episodeId: 'ep-1', title: 'Episode', podcastTitle: 'Show' }],
        cursor: 0,
      },
    });
    useAudiobookQueueStore.setState({
      queue: { order: [{ kind: 'item', itemId: 'book-1', title: 'A Book' }], cursor: 0 },
    });

    useMusicQueueStore.getState().clearQueue();

    expect(useMusicQueueStore.getState().queue).toBeNull();
    expect(usePodcastQueueStore.getState().queue).not.toBeNull();
    expect(useAudiobookQueueStore.getState().queue).not.toBeNull();
  });
});
