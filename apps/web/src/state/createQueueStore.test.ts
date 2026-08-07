import { describe, expect, it } from 'vitest';
import { createQueueStore } from './createQueueStore.js';

interface Entry {
  id: string;
}

function entry(id: string): Entry {
  return { id };
}

describe('createQueueStore', () => {
  it('enqueueNext on an empty queue creates a one-entry queue at cursor 0', () => {
    const useQueue = createQueueStore<Entry>();
    useQueue.getState().enqueueNext(entry('a'));
    expect(useQueue.getState().queue).toEqual({ order: [entry('a')], cursor: 0 });
  });

  it('enqueueNext inserts immediately after the cursor, not at the end, and does not move the cursor', () => {
    const useQueue = createQueueStore<Entry>();
    useQueue.setState({ queue: { order: [entry('a'), entry('b'), entry('c')], cursor: 1 } });
    useQueue.getState().enqueueNext(entry('x'));
    expect(useQueue.getState().queue).toEqual({
      order: [entry('a'), entry('b'), entry('x'), entry('c')],
      cursor: 1,
    });
  });

  it('enqueueLast appends at the end even when the cursor is mid-queue', () => {
    const useQueue = createQueueStore<Entry>();
    useQueue.setState({ queue: { order: [entry('a'), entry('b'), entry('c')], cursor: 1 } });
    useQueue.getState().enqueueLast(entry('x'));
    expect(useQueue.getState().queue).toEqual({
      order: [entry('a'), entry('b'), entry('c'), entry('x')],
      cursor: 1,
    });
  });

  it('enqueueLast on an empty queue also creates a one-entry queue at cursor 0', () => {
    const useQueue = createQueueStore<Entry>();
    useQueue.getState().enqueueLast(entry('a'));
    expect(useQueue.getState().queue).toEqual({ order: [entry('a')], cursor: 0 });
  });

  it('advance moves the cursor forward and returns the new current entry', () => {
    const useQueue = createQueueStore<Entry>();
    useQueue.setState({ queue: { order: [entry('a'), entry('b')], cursor: 0 } });
    const next = useQueue.getState().advance();
    expect(next).toEqual(entry('b'));
    expect(useQueue.getState().queue?.cursor).toBe(1);
  });

  it('advance past the last entry returns null, does not wrap, and does not clear the queue', () => {
    const useQueue = createQueueStore<Entry>();
    useQueue.setState({ queue: { order: [entry('a'), entry('b')], cursor: 1 } });
    const next = useQueue.getState().advance();
    expect(next).toBeNull();
    expect(useQueue.getState().queue).toEqual({ order: [entry('a'), entry('b')], cursor: 1 });
  });

  it('advance on an empty (null) queue returns null without throwing', () => {
    const useQueue = createQueueStore<Entry>();
    expect(useQueue.getState().advance()).toBeNull();
    expect(useQueue.getState().queue).toBeNull();
  });

  it('clearQueue sets the queue to null', () => {
    const useQueue = createQueueStore<Entry>();
    useQueue.setState({ queue: { order: [entry('a')], cursor: 0 } });
    useQueue.getState().clearQueue();
    expect(useQueue.getState().queue).toBeNull();
  });

  it('setQueue replaces the whole queue outright', () => {
    const useQueue = createQueueStore<Entry>();
    useQueue.getState().setQueue({ order: [entry('a'), entry('b')], cursor: 1 });
    expect(useQueue.getState().queue).toEqual({ order: [entry('a'), entry('b')], cursor: 1 });
  });
});
