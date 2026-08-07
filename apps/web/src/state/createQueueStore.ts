/**
 * A shared zustand store factory for the two *simple* per-content-type queues — podcasts and
 * audiobooks (`podcastQueueStore.ts`, `audiobookQueueStore.ts`). Deliberately simpler than
 * `musicQueueStore.ts`: no shuffle, no repeat, no cross-page fetch-more concept. Each entry is
 * already a fully-described "thing to play next" (an episode, or a book/chapter reference) —
 * unlike a Jellyfin queue, there is no upstream page boundary to grow `order` past, so this
 * store never needs `musicQueue.ts`'s `total`/`positions`/`needsFetch` machinery at all.
 *
 * Music is left on its own store (`musicQueueStore.ts`) rather than folded into this factory:
 * it already existed, its shuffle/repeat semantics don't generalize to the other two content
 * types, and touching it here would risk the exact drift `musicQueueStore.ts`'s own header
 * warns against. `musicQueueStore.ts` only gains a `clearQueue()` action from this wave, added
 * by hand to match this factory's shape rather than by sharing code with it.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand';

export interface SimpleQueueState<T> {
  /** Canonical, insertion-order entry list. `enqueueNext` splices into it (immediately after
   *  `cursor`); `enqueueLast` appends. Never reordered outside of those two calls. */
  order: T[];
  /** Index into `order` of the entry currently playing. */
  cursor: number;
}

export interface SimpleQueueStore<T> {
  queue: SimpleQueueState<T> | null;
  /** Replaces the whole queue outright — used to seed a fresh queue (e.g. "queue this whole
   *  podcast's episodes starting here"). `null` clears it, same as `clearQueue()`. */
  setQueue: (queue: SimpleQueueState<T> | null) => void;
  /** Inserts `entry` immediately after the current cursor — "play this next" — without moving
   *  the cursor itself. Creates a one-entry queue at `cursor: 0` if nothing is queued yet,
   *  rather than no-op'ing: an empty queue has no "after the cursor" position to insert at, so
   *  starting one is the only sense in which "next" is meaningful. */
  enqueueNext: (entry: T) => void;
  /** Appends `entry` to the end of the queue — "add to queue" — regardless of where the cursor
   *  currently sits. Same empty-queue bootstrap as `enqueueNext`. */
  enqueueLast: (entry: T) => void;
  /** Moves the cursor to the next entry and returns it, or returns `null` and leaves the
   *  cursor (and the queue) untouched at the end — no wrap, no clear. A caller that wants "stop
   *  playing" on `null` decides that itself; this store has no opinion about playback. */
  advance: () => T | null;
  /** Clears this queue only — the other two content types' queues are separate store instances
   *  and are never touched by this call. See `docs/ROADMAP.md` §12f, requirement 1: switching
   *  content types must never clear an unrelated queue. */
  clearQueue: () => void;
}

export function createQueueStore<T>(): UseBoundStore<StoreApi<SimpleQueueStore<T>>> {
  return create<SimpleQueueStore<T>>((set, get) => ({
    queue: null,

    setQueue: (queue) => set({ queue }),

    enqueueNext: (entry) => {
      const { queue } = get();
      if (!queue) {
        set({ queue: { order: [entry], cursor: 0 } });
        return;
      }
      const order = [...queue.order];
      order.splice(queue.cursor + 1, 0, entry);
      set({ queue: { ...queue, order } });
    },

    enqueueLast: (entry) => {
      const { queue } = get();
      if (!queue) {
        set({ queue: { order: [entry], cursor: 0 } });
        return;
      }
      set({ queue: { ...queue, order: [...queue.order, entry] } });
    },

    advance: () => {
      const { queue } = get();
      if (!queue) return null;
      const nextCursor = queue.cursor + 1;
      if (nextCursor >= queue.order.length) return null;
      const next = queue.order[nextCursor];
      if (next === undefined) return null; // unreachable given the bounds check above; keeps this total.
      set({ queue: { ...queue, cursor: nextCursor } });
      return next;
    },

    clearQueue: () => set({ queue: null }),
  }));
}
