import { describe, expect, it, vi } from 'vitest';
import type { AudioTrack } from '../../api/types.js';
import { audiobookshelfSource, jellyfinSource, noopProgressReporter } from './playbackSource.js';
import type { ProgressSyncBody } from './progressSync.js';

const BODY: ProgressSyncBody = { currentTime: 120, timeListened: 15, duration: 3_600 };

function fakeApi() {
  return {
    syncSession: vi.fn().mockResolvedValue({ ok: true as const }),
    closeSession: vi.fn().mockResolvedValue({ ok: true as const }),
    audioTrackUrl: vi.fn(
      (itemId: string, fileId: string) => `/api/media/${itemId}/track/${fileId}`,
    ),
  };
}

function track(overrides: Partial<AudioTrack> = {}): AudioTrack {
  return {
    index: 0,
    startOffset: 0,
    duration: 3_600,
    title: null,
    contentUrl: '/api/items/item-dune/file/file-dune-1',
    mimeType: 'audio/mpeg',
    ...overrides,
  };
}

describe('audiobookshelfSource', () => {
  describe('reportProgress.onTick', () => {
    it('syncs the session and never closes it', async () => {
      const api = fakeApi();
      const source = audiobookshelfSource(api, 'item-dune', 'session-1');

      source.reportProgress.onTick(BODY);
      await Promise.resolve();

      expect(api.syncSession).toHaveBeenCalledWith('session-1', BODY);
      expect(api.closeSession).not.toHaveBeenCalled();
    });
  });

  describe('reportProgress.onEnd', () => {
    it('syncs before closing, given a body', async () => {
      const api = fakeApi();
      const source = audiobookshelfSource(api, 'item-dune', 'session-1');
      const calls: string[] = [];
      api.syncSession.mockImplementation(async () => {
        calls.push('sync');
        return { ok: true as const };
      });
      api.closeSession.mockImplementation(async () => {
        calls.push('close');
        return { ok: true as const };
      });

      source.reportProgress.onEnd(BODY);
      await Promise.resolve();

      expect(calls).toEqual(['sync', 'close']);
      expect(api.syncSession).toHaveBeenCalledWith('session-1', BODY);
    });

    it('closes without syncing when no body was ever produced', async () => {
      // A session opened and torn down before `duration` was learned still needs
      // closing upstream — there is just nothing yet worth syncing into it.
      const api = fakeApi();
      const source = audiobookshelfSource(api, 'item-dune', 'session-1');

      source.reportProgress.onEnd(null);
      await Promise.resolve();

      expect(api.syncSession).not.toHaveBeenCalled();
      expect(api.closeSession).toHaveBeenCalledWith('session-1');
    });

    it('never throws synchronously, even if the underlying calls reject', () => {
      const api = fakeApi();
      api.syncSession.mockRejectedValue(new Error('network down'));
      api.closeSession.mockRejectedValue(new Error('network down'));
      const source = audiobookshelfSource(api, 'item-dune', 'session-1');

      expect(() => source.reportProgress.onEnd(BODY)).not.toThrow();
    });
  });

  describe('resolveTrackUrl', () => {
    it('resolves a valid track to the proxied media URL', () => {
      const api = fakeApi();
      const source = audiobookshelfSource(api, 'item-dune', 'session-1');

      expect(source.resolveTrackUrl(track())).toBe('/api/media/item-dune/track/file-dune-1');
      expect(api.audioTrackUrl).toHaveBeenCalledWith('item-dune', 'file-dune-1');
    });

    it('degrades to null for a track with no usable contentUrl, rather than throwing', () => {
      const api = fakeApi();
      const source = audiobookshelfSource(api, 'item-dune', 'session-1');

      expect(source.resolveTrackUrl(track({ contentUrl: null }))).toBeNull();
      expect(source.resolveTrackUrl(track({ contentUrl: '' }))).toBeNull();
      expect(api.audioTrackUrl).not.toHaveBeenCalled();
    });
  });
});

describe('noopProgressReporter', () => {
  it('does nothing and never throws, for a source with no progress API wired up yet', () => {
    expect(() => noopProgressReporter.onTick(BODY)).not.toThrow();
    expect(() => noopProgressReporter.onEnd(BODY)).not.toThrow();
    expect(() => noopProgressReporter.onEnd(null)).not.toThrow();
  });
});

function fakeJellyfinApi() {
  return {
    jellyfinTrackStreamUrl: vi.fn((itemId: string) => `/jellyfin/tracks/${itemId}/stream`),
    reportJellyfinPlaybackStart: vi.fn().mockResolvedValue(undefined),
    reportJellyfinPlaybackProgress: vi.fn().mockResolvedValue(undefined),
    reportJellyfinPlaybackStopped: vi.fn().mockResolvedValue(undefined),
  };
}

/** A three-track album queue laid out end to end on one cumulative timeline, exactly as
 * `queue.ts`'s `albumQueue` builds one — track B (index 1) starts at 100s and runs 150s,
 * so time 130 lands 30s into track B, not 130s into anything. */
const ALBUM_QUEUE: AudioTrack[] = [
  track({ index: 0, startOffset: 0, duration: 100, contentUrl: 'jf-track-a' }),
  track({ index: 1, startOffset: 100, duration: 150, contentUrl: 'jf-track-b' }),
  track({ index: 2, startOffset: 250, duration: 80, contentUrl: 'jf-track-c' }),
];

describe('jellyfinSource', () => {
  describe('resolveTrackUrl', () => {
    it('resolves a track to the proxied stream URL, keyed by the track’s own Jellyfin id', () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, ALBUM_QUEUE);

      expect(source.resolveTrackUrl(track({ contentUrl: 'jf-track-1' }))).toBe(
        '/jellyfin/tracks/jf-track-1/stream',
      );
      expect(api.jellyfinTrackStreamUrl).toHaveBeenCalledWith('jf-track-1');
    });

    it('degrades to null for a track with no usable id, rather than throwing', () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, ALBUM_QUEUE);

      expect(source.resolveTrackUrl(track({ contentUrl: null }))).toBeNull();
      expect(source.resolveTrackUrl(track({ contentUrl: '' }))).toBeNull();
      expect(api.jellyfinTrackStreamUrl).not.toHaveBeenCalled();
    });
  });

  describe('reportProgress.onTick', () => {
    it('maps a queue-timeline position into the second track of a three-track album, reporting that track’s id and a position relative to its own start', async () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, ALBUM_QUEUE);

      source.reportProgress.onTick({ currentTime: 130, timeListened: 15, duration: 330 });
      await Promise.resolve();

      expect(api.reportJellyfinPlaybackProgress).toHaveBeenCalledWith('jf-track-b', 30);
    });

    it('fires a lazy start report on the very first tick, before the progress report', async () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, ALBUM_QUEUE);

      source.reportProgress.onTick({ currentTime: 30, timeListened: 15, duration: 330 });
      await Promise.resolve();

      expect(api.reportJellyfinPlaybackStart).toHaveBeenCalledWith('jf-track-a', 30);
      expect(api.reportJellyfinPlaybackProgress).toHaveBeenCalledWith('jf-track-a', 30);
    });

    it('does not re-fire the start report on a later tick within the same track', async () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, ALBUM_QUEUE);

      source.reportProgress.onTick({ currentTime: 10, timeListened: 15, duration: 330 });
      await Promise.resolve();
      source.reportProgress.onTick({ currentTime: 50, timeListened: 15, duration: 330 });
      await Promise.resolve();

      expect(api.reportJellyfinPlaybackStart).toHaveBeenCalledTimes(1);
      expect(api.reportJellyfinPlaybackProgress).toHaveBeenCalledTimes(2);
    });

    it('fires a new start report when the queue advances past a track boundary', async () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, ALBUM_QUEUE);

      source.reportProgress.onTick({ currentTime: 90, timeListened: 15, duration: 330 });
      await Promise.resolve();
      source.reportProgress.onTick({ currentTime: 130, timeListened: 15, duration: 330 });
      await Promise.resolve();

      expect(api.reportJellyfinPlaybackStart).toHaveBeenNthCalledWith(1, 'jf-track-a', 90);
      expect(api.reportJellyfinPlaybackStart).toHaveBeenNthCalledWith(2, 'jf-track-b', 30);
      expect(api.reportJellyfinPlaybackStart).toHaveBeenCalledTimes(2);
    });

    it('reports nothing when the position resolves to no track at all', async () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, []);

      source.reportProgress.onTick(BODY);
      await Promise.resolve();

      expect(api.reportJellyfinPlaybackStart).not.toHaveBeenCalled();
      expect(api.reportJellyfinPlaybackProgress).not.toHaveBeenCalled();
    });

    it('never throws synchronously, even if the underlying reports reject', () => {
      const api = fakeJellyfinApi();
      api.reportJellyfinPlaybackStart.mockRejectedValue(new Error('network down'));
      api.reportJellyfinPlaybackProgress.mockRejectedValue(new Error('network down'));
      const source = jellyfinSource(api, ALBUM_QUEUE);

      expect(() =>
        source.reportProgress.onTick({ currentTime: 30, timeListened: 15, duration: 330 }),
      ).not.toThrow();
    });
  });

  describe('reportProgress.onEnd', () => {
    it('sends a stopped report mapped to the resolved track, given a body', async () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, ALBUM_QUEUE);

      source.reportProgress.onEnd({ currentTime: 130, timeListened: 15, duration: 330 });
      await Promise.resolve();

      expect(api.reportJellyfinPlaybackStopped).toHaveBeenCalledWith('jf-track-b', 30);
    });

    it('sends no stop report for a null body — no track was ever identified to stop', async () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, ALBUM_QUEUE);

      source.reportProgress.onEnd(null);
      await Promise.resolve();

      expect(api.reportJellyfinPlaybackStopped).not.toHaveBeenCalled();
      expect(api.reportJellyfinPlaybackStart).not.toHaveBeenCalled();
    });

    it('sends no stop report when a body exists but no track resolves from it', async () => {
      const api = fakeJellyfinApi();
      const source = jellyfinSource(api, []);

      source.reportProgress.onEnd(BODY);
      await Promise.resolve();

      expect(api.reportJellyfinPlaybackStopped).not.toHaveBeenCalled();
    });

    it('never throws synchronously, even if the underlying report rejects', () => {
      const api = fakeJellyfinApi();
      api.reportJellyfinPlaybackStopped.mockRejectedValue(new Error('network down'));
      const source = jellyfinSource(api, ALBUM_QUEUE);

      expect(() =>
        source.reportProgress.onEnd({ currentTime: 30, timeListened: 15, duration: 330 }),
      ).not.toThrow();
    });
  });
});
