import { describe, expect, it, vi } from 'vitest';
import type { AudioTrack } from '../../api/types.js';
import { audiobookshelfSource, noopProgressReporter } from './playbackSource.js';
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
