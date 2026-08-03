import { describe, expect, it } from 'vitest';
import { listenedSeconds, progressSyncPayload, PROGRESS_SYNC_INTERVAL_MS } from './progressSync.js';

describe('listenedSeconds', () => {
  it('converts wall-clock milliseconds spent playing into whole seconds', () => {
    expect(listenedSeconds(15_000)).toBe(15);
    expect(listenedSeconds(15_400)).toBe(15);
    expect(listenedSeconds(15_600)).toBe(16);
  });

  it('reports nothing listened for a stretch that never started', () => {
    expect(listenedSeconds(0)).toBe(0);
  });

  it('never reports a negative duration, however the clock behaved', () => {
    // A system clock stepped backwards mid-stretch would otherwise send a
    // negative `timeListened`, which Audiobookshelf would fold into the user's
    // listening statistics.
    expect(listenedSeconds(-5_000)).toBe(0);
  });

  it('degrades to zero rather than propagating a non-finite value upstream', () => {
    expect(listenedSeconds(Number.NaN)).toBe(0);
    expect(listenedSeconds(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('progressSyncPayload', () => {
  it('reports position and listening time together, as the BFF requires', () => {
    expect(progressSyncPayload({ currentTime: 120, duration: 3600, playingMs: 15_000 })).toEqual({
      currentTime: 120,
      timeListened: 15,
      duration: 3600,
    });
  });

  it('derives listening time from time spent playing, not from how far the position moved', () => {
    // The distinction is the whole point: skipping forward half an hour is not
    // half an hour of listening, and counting it as such would corrupt the
    // user's stats on the real server.
    const afterASkip = progressSyncPayload({
      currentTime: 1_800,
      duration: 3_600,
      playingMs: 900,
    });

    expect(afterASkip?.currentTime).toBe(1_800);
    expect(afterASkip?.timeListened).toBe(1);
  });

  it('withholds a sync while the duration is still unknown', () => {
    // `duration` is 0 until a session is loaded. The BFF's `syncBodySchema`
    // requires all three fields, so sending early would 400 rather than degrade.
    expect(progressSyncPayload({ currentTime: 0, duration: 0, playingMs: 15_000 })).toBeNull();
  });

  it('withholds a sync when the duration is not a usable number', () => {
    expect(progressSyncPayload({ currentTime: 10, duration: Number.NaN, playingMs: 1_000 })).toBe(
      null,
    );
    expect(
      progressSyncPayload({
        currentTime: 10,
        duration: Number.POSITIVE_INFINITY,
        playingMs: 1_000,
      }),
    ).toBeNull();
    expect(progressSyncPayload({ currentTime: 10, duration: -60, playingMs: 1_000 })).toBeNull();
  });

  it('keeps the reported position inside the item, whatever the caller held', () => {
    expect(
      progressSyncPayload({ currentTime: 5_000, duration: 3_600, playingMs: 0 })?.currentTime,
    ).toBe(3_600);
    expect(
      progressSyncPayload({ currentTime: -10, duration: 3_600, playingMs: 0 })?.currentTime,
    ).toBe(0);
  });

  it('still reports a position when no listening happened, so a paused seek is not lost', () => {
    expect(progressSyncPayload({ currentTime: 42, duration: 3_600, playingMs: 0 })).toEqual({
      currentTime: 42,
      timeListened: 0,
      duration: 3_600,
    });
  });

  it('degrades a non-finite position to the start rather than sending NaN', () => {
    expect(
      progressSyncPayload({ currentTime: Number.NaN, duration: 3_600, playingMs: 0 })?.currentTime,
    ).toBe(0);
  });
});

describe('PROGRESS_SYNC_INTERVAL_MS', () => {
  it('matches the cadence Audiobookshelf’s own clients use', () => {
    expect(PROGRESS_SYNC_INTERVAL_MS).toBe(15_000);
  });
});
