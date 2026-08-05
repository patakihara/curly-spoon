/**
 * Regression coverage for `useProgressSync`'s own wiring — not for a reporter.
 *
 * Every other test around progress sync (`progressSync.test.ts`,
 * `playbackSource.test.ts`) hands a hand-built `state`/body straight to a
 * `PlaybackProgressReporter` and checks what the reporter does with it. None of
 * that exercises the hook itself: the code that reads `usePlayerStore` and
 * decides *what to pass* the reporter. A one-line regression — reading this
 * hook's own top-level `isPlaying` subscription (closed over once, when the
 * interval effect last ran) instead of `usePlayerStore.getState().isPlaying`
 * (read fresh inside `tick()`) — has the same type, typechecks cleanly, and
 * would pass every reporter-level test unchanged, because those tests never
 * construct the hook at all. This file exists to catch exactly that class of
 * bug: it calls `useProgressSync` itself and asserts what it hands the
 * reporter across a play → pause transition.
 *
 * The root Vitest config runs `apps/web/src/**` in a plain `node` environment
 * (see `vitest.config.ts`): no DOM, no React renderer. So this test does not
 * render a component — it calls `useProgressSync()` as a plain function, with
 * `react` mocked so `useRef`/`useCallback`/`useEffect` behave like their real
 * counterparts for a *single* invocation (`useEffect`'s callback runs
 * synchronously and its cleanup is captured for later use; `useRef` returns a
 * fresh mutable cell; `useCallback` returns the function itself, since a
 * single call never needs identity stability across renders). `usePlayerStore`
 * is mocked too, with a minimal stand-in exposing the same three entry points
 * the hook actually uses (`usePlayerStore(selector)`, `.getState()`,
 * `.subscribe()`), so the store can be driven directly from the test without
 * a real Zustand/React binding.
 *
 * One deliberate harness limitation: the hook body runs exactly once, so the
 * *first* `useEffect` (which tracks `playingSinceRef` off the top-level
 * `isPlaying` subscription) never re-runs when the test flips `isPlaying` in
 * the store directly — a real re-render would re-run it, this harness doesn't
 * simulate one. That's fine here: this file only asserts the *second*
 * argument to `onTick` (`PlaybackTickState`), which is exactly the value the
 * bug this file guards against gets wrong, and the accumulated
 * `timeListened` in the body is deliberately left unasserted since the
 * harness's one-render limitation makes its exact value a harness artifact,
 * not a fact about production behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackProgressReporter, PlaybackSource } from './playbackSource.js';

// `useProgressSync.ts` calls `window.addEventListener`/`removeEventListener`
// for the `pagehide` listener. The `node` test environment has no `window` at
// all, so without this the hook throws before ever reaching the assertions
// this file cares about.
const pageHideListeners = new Set<() => void>();

beforeEach(() => {
  pageHideListeners.clear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: (event: string, listener: () => void) => {
        if (event === 'pagehide') pageHideListeners.add(listener);
      },
      removeEventListener: (event: string, listener: () => void) => {
        if (event === 'pagehide') pageHideListeners.delete(listener);
      },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  vi.resetModules();
});

// A minimal Zustand-shaped stand-in: `usePlayerStore(selector)` reads the
// current state synchronously (this harness never re-renders, so there is
// nothing to subscribe the top-level selector calls to), while `.getState()`
// and `.subscribe()` mirror the real store closely enough for the hook's own
// `getState()` reads and its position-tracking `subscribe()` call to work
// exactly as they do in production.
interface FakeState {
  sessionId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  source: PlaybackSource | null;
}

const listeners = new Set<(state: FakeState) => void>();
let storeState: FakeState;

function resetStore(overrides: Partial<FakeState>): void {
  storeState = {
    sessionId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    source: null,
    ...overrides,
  };
  listeners.clear();
}

function setStoreState(partial: Partial<FakeState>): void {
  storeState = { ...storeState, ...partial };
  listeners.forEach((listener) => listener(storeState));
}

function usePlayerStore<T>(selector: (state: FakeState) => T): T {
  return selector(storeState);
}
usePlayerStore.getState = (): FakeState => storeState;
usePlayerStore.subscribe = (listener: (state: FakeState) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

vi.mock('../../state/playerStore.js', () => ({ usePlayerStore }));

// `useRef`/`useCallback`/`useEffect`, reduced to what a *single* invocation of
// a hook needs: a persistent mutable cell, a stable function reference, and an
// effect that runs its callback immediately and remembers the cleanup for the
// test to call later (simulating unmount). This intentionally does not model
// re-renders or dependency-array comparison — see this file's header comment
// for why a single invocation is sufficient to catch the regression in hand.
const effectCleanups: Array<() => void> = [];

vi.mock('react', () => ({
  useRef: <T>(initial: T) => ({ current: initial }),
  useCallback: <T>(fn: T) => fn,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) effectCleanups.push(cleanup);
  },
}));

function runCleanups(): void {
  while (effectCleanups.length > 0) effectCleanups.pop()?.();
}

function fakeReporter(): PlaybackProgressReporter {
  return { onTick: vi.fn(), onEnd: vi.fn() };
}

describe('useProgressSync', () => {
  it('reports the live play/pause state on each tick, not the state from when the interval was set up', async () => {
    vi.useFakeTimers();
    const reporter = fakeReporter();
    const source: PlaybackSource = { reportProgress: reporter, resolveTrackUrl: () => null };
    // `duration` must be positive from the start: `progressSyncPayload`
    // withholds the body entirely otherwise, and `tick()` skips calling the
    // reporter when there's no body — a `duration: 0` fixture would fail this
    // test for a reason that has nothing to do with the regression in hand.
    resetStore({
      sessionId: 'session-1',
      isPlaying: true,
      currentTime: 10,
      duration: 3600,
      source,
    });

    const { useProgressSync } = await import('./useProgressSync.js');
    useProgressSync();

    // Still playing: the interval tick must report `isPlaying: true`.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(reporter.onTick).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ isPlaying: true }),
    );

    // Paused *without* re-invoking the hook — exactly the scenario the fix
    // targets: `sessionId` hasn't changed, so the real interval effect
    // (deps `[collect, sessionId]`) would not re-run on a real re-render
    // either. The only way `tick()` can see the new value is by reading
    // `usePlayerStore.getState()` fresh, which is precisely what this
    // assertion is checking.
    setStoreState({ isPlaying: false });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(reporter.onTick).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ isPlaying: false }),
    );

    runCleanups();
    vi.useRealTimers();
  });
});
