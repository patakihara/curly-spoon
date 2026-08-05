import { beforeEach, describe, expect, it } from 'vitest';
import { usePlayerStore } from './playerStore.js';
import type { AudioTrack, LibraryItem, PlaybackSession } from '../api/types.js';
import type { PlaybackSource } from '../features/player/playbackSource.js';

const inertSource: PlaybackSource = {
  reportProgress: { onTick: () => undefined, onEnd: () => undefined },
  resolveTrackUrl: () => null,
};

function bookItem(): LibraryItem {
  return {
    id: 'item-dune',
    libraryId: 'lib-1',
    coverPath: null,
    media: { kind: 'book', title: 'Dune' },
    progress: null,
  };
}

function bookSession(): PlaybackSession {
  const track: AudioTrack = {
    index: 0,
    startOffset: 0,
    duration: 1260,
    title: null,
    contentUrl: '/api/items/item-dune/file/f1',
    mimeType: null,
  };
  return {
    id: 'session-1',
    libraryItemId: 'item-dune',
    episodeId: null,
    mediaType: 'book',
    displayTitle: 'Dune',
    duration: 1260,
    currentTime: 0,
    audioTracks: [track],
    chapters: [],
  };
}

beforeEach(() => {
  usePlayerStore.getState().close();
});

describe('onTrackEnded (Phase 9 queue wave — audiobook regression pin)', () => {
  it('is null after close(), matching every session before this wave existed', () => {
    expect(usePlayerStore.getState().onTrackEnded).toBeNull();
  });

  it('load() always resets onTrackEnded to null, even if a prior music queue had set it', () => {
    usePlayerStore.getState().setOnTrackEnded(() => undefined);
    expect(usePlayerStore.getState().onTrackEnded).not.toBeNull();

    usePlayerStore.getState().load(bookItem(), bookSession(), inertSource);

    // A book load must never inherit a stale music queue's `ended` override —
    // `useAudioElement.ts`'s built-in "next AudioTrack, or pause" logic is what runs for it.
    expect(usePlayerStore.getState().onTrackEnded).toBeNull();
  });
});

describe('setTracks (Phase 9 queue wave)', () => {
  it('replaces tracks/duration without touching currentTime, isPlaying, or anything else', () => {
    usePlayerStore.getState().load(bookItem(), bookSession(), inertSource);
    usePlayerStore.getState().play();
    usePlayerStore.getState().seek(42);
    usePlayerStore.getState().addBookmark(10, 'Mark');

    const newTrack: AudioTrack = {
      index: 0,
      startOffset: 0,
      duration: 500,
      title: 'New',
      contentUrl: 'new-id',
      mimeType: null,
    };
    usePlayerStore.getState().setTracks([newTrack], 500);

    const state = usePlayerStore.getState();
    expect(state.tracks).toEqual([newTrack]);
    expect(state.duration).toBe(500);
    expect(state.isPlaying).toBe(true);
    expect(state.currentTime).toBe(42);
    expect(state.bookmarks).toHaveLength(1);
  });
});
