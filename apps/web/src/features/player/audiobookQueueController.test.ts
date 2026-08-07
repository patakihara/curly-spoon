import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from '../../state/playerStore.js';
import { useAudiobookQueueStore } from '../../state/audiobookQueueStore.js';
import type { LibraryItem, PlaybackSession } from '../../api/types.js';
import type { PlaybackSource } from './playbackSource.js';
import {
  attachAudiobookQueueEndedHandler,
  handleAudiobookQueueEnded,
  setAudiobookLoader,
} from './audiobookQueueController.js';
import type { AudiobookQueueEntry } from './queueEntries.js';

const inertSource: PlaybackSource = {
  reportProgress: { onTick: () => undefined, onEnd: () => undefined },
  resolveTrackUrl: () => null,
};

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
    displayTitle: 'Book',
    duration: 3600,
    currentTime: 0,
    audioTracks: [],
    chapters: [],
  };
}

function itemEntry(itemId: string, title = 'Book'): AudiobookQueueEntry {
  return { kind: 'item', itemId, title };
}

function chapterEntry(itemId: string, start: number, chapterId = 'ch-1'): AudiobookQueueEntry {
  return {
    kind: 'chapter',
    itemId,
    chapterId,
    title: `Chapter ${chapterId}`,
    bookTitle: 'Book',
    start,
  };
}

beforeEach(() => {
  usePlayerStore.getState().close();
  useAudiobookQueueStore.setState({ queue: null });
  setAudiobookLoader(null);
});

describe('handleAudiobookQueueEnded', () => {
  it('pauses without throwing when no queue is installed', async () => {
    usePlayerStore.getState().play();
    await handleAudiobookQueueEnded();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('loads the next book via the injected loader for a "item" entry', async () => {
    useAudiobookQueueStore.setState({
      queue: { order: [itemEntry('book-1'), itemEntry('book-2')], cursor: 0 },
    });
    const loader = vi.fn().mockResolvedValue({
      item: bookItem('book-2'),
      session: session('book-2'),
      source: inertSource,
    });
    setAudiobookLoader(loader);

    await handleAudiobookQueueEnded();

    expect(loader).toHaveBeenCalledWith('book-2');
    expect(usePlayerStore.getState().currentItem?.id).toBe('book-2');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('a chapter entry whose book is already loaded seeks instead of calling load', async () => {
    usePlayerStore.getState().load(bookItem('book-1'), session('book-1'), inertSource);
    const loadSpy = vi.spyOn(usePlayerStore.getState(), 'load');
    useAudiobookQueueStore.setState({
      queue: { order: [itemEntry('book-1'), chapterEntry('book-1', 900)], cursor: 0 },
    });
    setAudiobookLoader(vi.fn());

    await handleAudiobookQueueEnded();

    expect(loadSpy).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().currentTime).toBe(900);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('a chapter entry for a different book loads first, then seeks to the chapter start', async () => {
    usePlayerStore.getState().load(bookItem('book-1'), session('book-1'), inertSource);
    useAudiobookQueueStore.setState({
      queue: { order: [itemEntry('book-1'), chapterEntry('book-2', 450)], cursor: 0 },
    });
    const loader = vi.fn().mockResolvedValue({
      item: bookItem('book-2'),
      session: session('book-2'),
      source: inertSource,
    });
    setAudiobookLoader(loader);

    await handleAudiobookQueueEnded();

    expect(loader).toHaveBeenCalledWith('book-2');
    expect(usePlayerStore.getState().currentItem?.id).toBe('book-2');
    expect(usePlayerStore.getState().currentTime).toBe(450);
  });

  it('pauses rather than throwing when the loader rejects', async () => {
    useAudiobookQueueStore.setState({
      queue: { order: [itemEntry('book-1'), itemEntry('book-2')], cursor: 0 },
    });
    setAudiobookLoader(vi.fn().mockRejectedValue(new Error('network down')));
    usePlayerStore.getState().play();

    await handleAudiobookQueueEnded();

    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('pauses when the queue is already at its last entry', async () => {
    useAudiobookQueueStore.setState({
      queue: { order: [itemEntry('book-1'), itemEntry('book-2')], cursor: 1 },
    });
    setAudiobookLoader(vi.fn());
    usePlayerStore.getState().play();

    await handleAudiobookQueueEnded();

    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});

describe('attachAudiobookQueueEndedHandler', () => {
  it('installs a handler that drives handleAudiobookQueueEnded when onTrackEnded fires', async () => {
    useAudiobookQueueStore.setState({
      queue: { order: [itemEntry('book-1'), itemEntry('book-2')], cursor: 0 },
    });
    const loader = vi.fn().mockResolvedValue({
      item: bookItem('book-2'),
      session: session('book-2'),
      source: inertSource,
    });
    setAudiobookLoader(loader);

    usePlayerStore.getState().load(bookItem('book-1'), session('book-1'), inertSource);
    attachAudiobookQueueEndedHandler();
    usePlayerStore.getState().play();

    const onTrackEnded = usePlayerStore.getState().onTrackEnded;
    expect(onTrackEnded).not.toBeNull();
    onTrackEnded?.();
    await Promise.resolve().then(() => Promise.resolve());

    expect(loader).toHaveBeenCalled();
    expect(usePlayerStore.getState().currentItem?.id).toBe('book-2');
  });
});
