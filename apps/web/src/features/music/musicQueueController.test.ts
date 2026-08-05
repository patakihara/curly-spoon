import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from '../../state/playerStore.js';
import { useMusicQueueStore } from '../../state/musicQueueStore.js';
import type { LibraryItem, PlaybackSession } from '../../api/types.js';
import type { PlaybackSource } from '../player/playbackSource.js';
import { attachMusicQueueEndedHandler, beginMusicQueue } from './musicQueueController.js';
import type { QueueTrack } from './musicQueue.js';

const inertSource: PlaybackSource = {
  reportProgress: { onTick: () => undefined, onEnd: () => undefined },
  resolveTrackUrl: () => null,
};

function item(): LibraryItem {
  return {
    id: 'album-1',
    libraryId: '',
    coverPath: null,
    media: { kind: 'track', title: 'Album', author: 'Artist' },
    progress: null,
  };
}

function tracks(n: number, prefix = 't'): QueueTrack[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    title: `Track ${prefix}${i}`,
    durationSeconds: 100,
  }));
}

/** Loads a queue into `playerStore` exactly as `MusicAlbumPage.tsx`'s `playTrack` does:
 *  `beginMusicQueue` first (for the `AudioTrack[]`/`duration`/`startTrack`), then `load()`,
 *  then `attachMusicQueueEndedHandler()` — see `musicQueueController.ts`'s header for why
 *  that order matters. */
function loadQueue(loaded: QueueTrack[], total: number, startIndex: number, fetchMore = vi.fn()) {
  const { audioTracks, duration, startTrack } = beginMusicQueue(
    loaded,
    total,
    startIndex,
    fetchMore,
  );
  const session: PlaybackSession = {
    id: 'jellyfin-album-album-1',
    libraryItemId: 'album-1',
    episodeId: null,
    mediaType: 'book',
    displayTitle: startTrack?.title ?? 'Album',
    duration,
    currentTime: startTrack?.startOffset ?? 0,
    audioTracks,
    chapters: [],
  };
  usePlayerStore.getState().load(item(), session, inertSource);
  attachMusicQueueEndedHandler();
  usePlayerStore.getState().play();
  return { fetchMore };
}

/** Simulates the underlying `<audio>` element's native `ended` event — exactly what
 *  `useAudioElement.ts`'s `handleEnded` calls when `playerStore.onTrackEnded` is set. */
function fireEnded(): Promise<void> {
  const onTrackEnded = usePlayerStore.getState().onTrackEnded;
  if (!onTrackEnded) throw new Error('expected onTrackEnded to be attached');
  onTrackEnded();
  // `onTrackEnded`'s own handler is async (may need to fetch more of the queue) but the
  // store's `(() => void)` signature can't expose that — flush one microtask turn so callers
  // can assert on the settled result the way a real `await` on a promise would.
  return Promise.resolve().then(() => Promise.resolve());
}

beforeEach(() => {
  usePlayerStore.getState().close();
  useMusicQueueStore.setState({ queue: null, fetcher: null });
});

describe('beginMusicQueue', () => {
  it('materializes the starting page and reports the clicked track as startTrack', () => {
    const { audioTracks, duration, startTrack } = beginMusicQueue(tracks(3), 3, 1, vi.fn());
    expect(audioTracks).toHaveLength(3);
    expect(duration).toBe(300);
    expect(startTrack?.contentUrl).toBe('t1');
    expect(startTrack?.startOffset).toBe(100);
  });

  it('installs the queue and fetcher into musicQueueStore', () => {
    const fetchMore = vi.fn();
    beginMusicQueue(tracks(2), 2, 0, fetchMore);
    expect(useMusicQueueStore.getState().queue?.order).toHaveLength(2);
    expect(useMusicQueueStore.getState().fetcher).toBe(fetchMore);
  });
});

describe('handleTrackEnded (via playerStore.onTrackEnded)', () => {
  it('advances to the next loaded track without calling the fetcher', async () => {
    const { fetchMore } = loadQueue(tracks(3), 3, 0);
    await fireEnded();
    expect(fetchMore).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().currentTime).toBe(100); // t1's startOffset
    expect(useMusicQueueStore.getState().queue?.cursor).toBe(1);
  });

  it('fetches and appends the rest of the queue when advancing past what is loaded', async () => {
    const fetchMore = vi.fn().mockResolvedValue(tracks(2, 'page2-'));
    loadQueue(tracks(2), 4, 1, fetchMore); // 2 loaded of 4 total, starting at the last loaded one
    await fireEnded();
    expect(fetchMore).toHaveBeenCalledWith(2, 2);
    expect(useMusicQueueStore.getState().queue?.order).toHaveLength(4);
    expect(usePlayerStore.getState().tracks.map((t) => t.contentUrl)).toEqual([
      't0',
      't1',
      'page2-0',
      'page2-1',
    ]);
    expect(usePlayerStore.getState().currentTime).toBe(200); // page2-0's startOffset
  });

  it('pauses rather than looping when the fetcher rejects and repeat is off', async () => {
    const fetchMore = vi.fn().mockRejectedValue(new Error('network down'));
    loadQueue(tracks(1), 3, 0, fetchMore);
    await fireEnded();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('repeat "one" restarts the same track instead of advancing', async () => {
    const { fetchMore } = loadQueue(tracks(3), 3, 1);
    useMusicQueueStore.getState().setRepeat('one');
    usePlayerStore.getState().seek(150); // partway through t1
    await fireEnded();
    expect(fetchMore).not.toHaveBeenCalled();
    expect(useMusicQueueStore.getState().queue?.cursor).toBe(1); // unchanged
    expect(usePlayerStore.getState().currentTime).toBe(100); // back to t1's own start
  });

  it('repeat "all" wraps to the start once the whole queue has played', async () => {
    loadQueue(tracks(2), 2, 1); // already at the last (and only remaining) track
    useMusicQueueStore.getState().setRepeat('all');
    await fireEnded();
    expect(useMusicQueueStore.getState().queue?.cursor).toBe(0);
    expect(usePlayerStore.getState().currentTime).toBe(0);
  });

  it('pauses defensively if attached with no queue installed yet', async () => {
    // Shouldn't happen via the real call sites (`beginMusicQueue` always runs first — see
    // this file's own header on ordering), but `handleTrackEnded` must degrade rather than
    // throw if it ever is: `useMusicQueueStore`'s `queue`/`fetcher` are both still `null`.
    attachMusicQueueEndedHandler();
    usePlayerStore.getState().play();
    await fireEnded();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});
