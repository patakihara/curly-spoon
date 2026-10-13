import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './api/client';
import { type MediaState, type PageLike, mediaInDocument, watchForUpdates } from './update-watch';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

/** A page whose health answer, audio and visibility the test sets, counting its reloads. */
function rig(options: { commit?: string | null; storage?: Map<string, string> | null } = {}) {
  let commit = options.commit === undefined ? A : options.commit;
  let playing = false;
  let reloads = 0;
  const mediaListeners = new Set<() => void>();
  const pageListeners = new Set<() => void>();
  const store = options.storage === undefined ? new Map<string, string>() : options.storage;
  const media: MediaState = {
    isPlaying: () => playing,
    subscribe(listener) {
      mediaListeners.add(listener);
      return () => mediaListeners.delete(listener);
    },
  };
  const page: PageLike = {
    visibilityState: 'visible',
    addEventListener: (_type, listener) => pageListeners.add(listener),
    removeEventListener: (_type, listener) => pageListeners.delete(listener),
  };
  const stop = watchForUpdates({
    api: createApiClient({
      baseUrl: 'http://auralis.test',
      fetch: async () => Response.json({ status: 'ok', commit, signOn: true }),
    }),
    reload: () => reloads++,
    media,
    page,
    storage:
      store === null
        ? null
        : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
  });
  return {
    stop,
    store,
    reloads: () => reloads,
    deploy: (next: string | null) => (commit = next),
    play: (on: boolean) => {
      playing = on;
      mediaListeners.forEach((listener) => listener());
    },
    /** Audio stops with no word of it, as when its element leaves the page while playing. */
    vanish: () => (playing = false),
    show: async () => {
      page.visibilityState = 'visible';
      pageListeners.forEach((listener) => listener());
      await vi.advanceTimersByTimeAsync(0);
    },
    hide: () => (page.visibilityState = 'hidden'),
  };
}

/** Lets `ms` of the page's time pass, fetches answered along the way. */
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('[M0.staging/c] the update watch', () => {
  it('[M0.staging/c] leaves the tab alone while the server reports the commit it started on', async () => {
    const page = rig();
    await wait(5 * 60_000);
    expect(page.reloads()).toBe(0);
  });

  it('[M0.staging/c] reloads within a minute and a bit once the server reports another commit', async () => {
    const page = rig();
    await wait(0);
    page.deploy(B);
    await wait(60_000);
    expect(page.reloads()).toBe(0);
    await wait(2_000);
    expect(page.reloads()).toBe(1);
  });

  it('[M0.staging/c] never reloads on a null commit, before or after', async () => {
    const page = rig({ commit: null });
    await wait(0);
    page.deploy(B);
    await wait(3 * 60_000);
    expect(page.reloads()).toBe(0);

    const other = rig();
    await wait(0);
    other.deploy(null);
    await wait(3 * 60_000);
    expect(other.reloads()).toBe(0);
  });

  it('[M0.staging/c] waits while audio plays, and reloads 2 s after it stops', async () => {
    const page = rig();
    await wait(0);
    page.play(true);
    page.deploy(B);
    await wait(10 * 60_000);
    expect(page.reloads()).toBe(0);
    page.play(false);
    await wait(1_999);
    expect(page.reloads()).toBe(0);
    await wait(1);
    expect(page.reloads()).toBe(1);
  });

  it('[M0.staging/c] reloads once no audio plays, even when nothing said it stopped', async () => {
    const page = rig();
    await wait(0);
    page.play(true);
    page.deploy(B);
    await wait(2 * 60_000);
    page.vanish();
    await wait(62_000);
    expect(page.reloads()).toBe(1);
  });

  it('[M0.staging/c] does not reload across a gapless hand-over from one file to the next', async () => {
    const page = rig();
    await wait(0);
    page.play(true);
    page.deploy(B);
    await wait(60_000);
    page.play(false);
    await wait(500);
    page.play(true);
    await wait(10_000);
    expect(page.reloads()).toBe(0);
  });

  it('[M0.staging/c] reloads at most once per commit, so a tab never loops', async () => {
    const store = new Map<string, string>();
    const first = rig({ storage: store });
    await wait(0);
    first.deploy(B);
    await wait(62_000);
    expect(first.reloads()).toBe(1);
    first.stop();

    // Staging rolled back: the reloaded tab starts on A again and sees B again.
    const again = rig({ storage: store });
    await wait(0);
    again.deploy(B);
    await wait(5 * 60_000);
    expect(again.reloads()).toBe(0);
    again.deploy(C);
    await wait(62_000);
    expect(again.reloads()).toBe(1);
  });

  it('[M0.staging/c] still reloads when the tab cannot remember what it reloaded for', async () => {
    const page = rig({ storage: null });
    await wait(0);
    page.deploy(B);
    await wait(62_000);
    expect(page.reloads()).toBe(1);
  });

  it('[M0.staging/c] checks again the moment the tab is shown', async () => {
    const page = rig();
    await wait(0);
    page.hide();
    page.deploy(B);
    await wait(10_000);
    await page.show();
    await wait(2_000);
    expect(page.reloads()).toBe(1);
  });

  it('[M0.staging/c] never reloads on a commit that is not a full commit id', async () => {
    const page = rig();
    await wait(0);
    page.deploy('zz');
    await wait(5 * 60_000);
    expect(page.reloads()).toBe(0);
  });

  it('[M0.staging/c] keeps watching through a failed check', async () => {
    let fail = true;
    let commit = A;
    let reloads = 0;
    watchForUpdates({
      api: createApiClient({
        baseUrl: 'http://auralis.test',
        fetch: async () =>
          fail
            ? new Response('down', { status: 502 })
            : Response.json({ status: 'ok', commit, signOn: true }),
      }),
      reload: () => reloads++,
      media: { isPlaying: () => false, subscribe: () => () => undefined },
      page: {
        visibilityState: 'visible',
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      storage: null,
    });
    await wait(60_000);
    fail = false;
    await wait(60_000);
    commit = B;
    await wait(62_000);
    expect(reloads).toBe(1);
  });

  it('[M0.staging/c] stops watching when stopped', async () => {
    const page = rig();
    await wait(0);
    page.stop();
    page.deploy(B);
    await wait(5 * 60_000);
    expect(page.reloads()).toBe(0);
  });
});

describe('[M0.staging/c] audio in the document', () => {
  /** A document holding the given media elements, firing media events at its capture listeners. */
  function documentWith(elements: { paused: boolean; ended: boolean }[]) {
    const listeners = new Map<string, Set<() => void>>();
    return {
      elements,
      fire: (type: string) => listeners.get(type)?.forEach((listener) => listener()),
      addEventListener(type: string, listener: () => void, capture?: boolean) {
        expect(capture).toBe(true);
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
      querySelectorAll: () => elements,
    };
  }

  it('[M0.staging/c] counts as playing while any audio or video element in it plays', () => {
    const doc = documentWith([
      { paused: true, ended: false },
      { paused: false, ended: true },
    ]);
    const media = mediaInDocument(doc);
    expect(media.isPlaying()).toBe(false);
    doc.elements[0]!.paused = false;
    expect(media.isPlaying()).toBe(true);
  });

  it('[M0.staging/c] tells its listener when an element starts, pauses or ends', () => {
    const doc = documentWith([]);
    const heard: string[] = [];
    const stop = mediaInDocument(doc).subscribe(() => heard.push('change'));
    ['play', 'playing', 'pause', 'ended', 'timeupdate'].forEach(doc.fire);
    expect(heard).toHaveLength(4);
    stop();
    doc.fire('pause');
    expect(heard).toHaveLength(4);
  });
});
