import { describe, expect, it } from 'vitest';
import { createPageStore, SignedOut } from './store';

describe('[M1.shell] the pages’ kept data', () => {
  it('keeps nothing for a page until its answer comes, then tells its readers', async () => {
    const store = createPageStore({ onSignedOut: () => undefined });
    let told = 0;
    store.subscribe(() => told++);
    const loading = store.load('books{}', async () => ['The Salt Road']);
    expect(store.peek('books{}')).toBeUndefined();
    await loading;
    expect(store.peek('books{}')).toEqual(['The Salt Road']);
    expect(told).toBe(1);
  });

  it('asks once for a page two readers open together, and again when it is opened afresh', async () => {
    const store = createPageStore({ onSignedOut: () => undefined });
    let asked = 0;
    const run = async () => ++asked;
    await Promise.all([store.load('book{}', run), store.load('book{}', run)]);
    expect(asked).toBe(1);
    await store.load('book{}', run);
    expect(asked).toBe(2);
    expect(store.peek('book{}')).toBe(2);
  });

  it('keeps what it had when a request fails, and hands on one refused for want of a sign-in', async () => {
    let signedOut = 0;
    const store = createPageStore({ onSignedOut: () => signedOut++ });
    await store.load('music{}', async () => 'kept');
    await store.load('music{}', async () => {
      throw new Error('answered 502');
    });
    expect(store.peek('music{}')).toBe('kept');
    expect(signedOut).toBe(0);
    await store.load('music{}', async () => {
      throw new SignedOut();
    });
    expect(store.peek('music{}')).toBe('kept');
    expect(signedOut).toBe(1);
  });
});
