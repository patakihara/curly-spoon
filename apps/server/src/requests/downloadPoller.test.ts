/**
 * `createDownloadPoller` is the only thing that calls `RequestService.pollDownloads`
 * and `MusicRequestService.pollDownloads` in production — see app.ts. These tests
 * drive it with fake timers so they run instantly and never depend on wall-clock
 * time; no test here sleeps.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDownloadPoller } from './downloadPoller.js';

describe('createDownloadPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks both the book and music pollers on the configured interval', async () => {
    const requests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const musicRequests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const poller = createDownloadPoller({ requests, musicRequests, intervalMs: 1000 });

    poller.start();
    expect(requests.pollDownloads).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(1);
    expect(musicRequests.pollDownloads).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(2);
    expect(musicRequests.pollDownloads).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it('does not start a second tick while a slow one is still in flight', async () => {
    let releaseFirstTick: (() => void) | undefined;
    const firstTickGate = new Promise<void>((resolve) => {
      releaseFirstTick = resolve;
    });
    const requests = {
      pollDownloads: vi
        .fn()
        .mockImplementationOnce(() => firstTickGate)
        .mockResolvedValue(undefined),
    };
    const musicRequests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const poller = createDownloadPoller({ requests, musicRequests, intervalMs: 1000 });

    poller.start();
    await vi.advanceTimersByTimeAsync(1000); // fires the first tick, which now hangs
    expect(requests.pollDownloads).toHaveBeenCalledTimes(1);

    // Two more interval boundaries pass while the first tick is still unresolved —
    // a poller without a reentrancy guard would fire two more ticks here.
    await vi.advanceTimersByTimeAsync(2000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(1);

    releaseFirstTick?.();
    // Flush the microtask queue so the rest of the (now-unblocked) first tick — the
    // book poller's `await` resolving, then the music poller running in the same
    // tick — completes before the next assertion, without advancing wall-clock time.
    await vi.advanceTimersByTimeAsync(0);
    expect(musicRequests.pollDownloads).toHaveBeenCalledTimes(1);

    // Now that the first tick has finished, the next interval boundary ticks again.
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it('keeps ticking after one tick throws, and logs rather than propagating', async () => {
    const requests = {
      pollDownloads: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined),
    };
    const musicRequests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const error = vi.fn();
    const poller = createDownloadPoller({
      requests,
      musicRequests,
      intervalMs: 1000,
      logger: { error },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(1);
    // The book poller failing must not skip the music poller in the same tick.
    expect(musicRequests.pollDownloads).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(2);
    expect(musicRequests.pollDownloads).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it('never logs a credential — only the error object and a static message', async () => {
    const secretError = Object.assign(new Error('upstream said no'), {
      token: 'super-secret-token',
    });
    const requests = { pollDownloads: vi.fn().mockRejectedValue(secretError) };
    const musicRequests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const error = vi.fn();
    const poller = createDownloadPoller({
      requests,
      musicRequests,
      intervalMs: 1000,
      logger: { error },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(1000);

    // The only thing logged is the error itself (which callers/log redaction own
    // downstream, same as every other `logger.warn({ err }, ...)` call in this
    // codebase) — no bespoke string interpolation that could smuggle a secret in
    // separately from the error object.
    expect(error).toHaveBeenCalledWith({ err: secretError, kind: 'book' }, expect.any(String));

    poller.stop();
  });

  it('stops ticking once stopped, and leaves no timer behind', async () => {
    const requests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const musicRequests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const poller = createDownloadPoller({ requests, musicRequests, intervalMs: 1000 });

    poller.start();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(1);

    poller.stop();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: starting twice does not double the interval, stopping twice does not throw', async () => {
    const requests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const musicRequests = { pollDownloads: vi.fn().mockResolvedValue(undefined) };
    const poller = createDownloadPoller({ requests, musicRequests, intervalMs: 1000 });

    poller.start();
    poller.start();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.pollDownloads).toHaveBeenCalledTimes(1);

    poller.stop();
    expect(() => poller.stop()).not.toThrow();
  });
});
