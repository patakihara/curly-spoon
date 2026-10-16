import { describe, expect, it } from 'vitest';
import { answerFrom, createPageStore, pageKey, SignedOut } from './store';

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

  it('says a page’s request failed, until it is asked again', async () => {
    const store = createPageStore({ onSignedOut: () => undefined });
    let told = 0;
    store.subscribe(() => told++);
    expect(store.failed('search{}')).toBe(false);
    await store.load('search{}', async () => {
      throw new Error('answered 500');
    });
    expect(store.failed('search{}')).toBe(true);
    expect(told).toBe(1);
    let answer!: (found: string) => void;
    const again = store.load('search{}', () => new Promise((resolve) => (answer = resolve)));
    expect(store.failed('search{}')).toBe(false);
    expect(told).toBe(2);
    answer('found');
    await again;
    expect(store.peek('search{}')).toBe('found');
  });

  it('asks again, as it asked before, only for a page whose request failed', async () => {
    const store = createPageStore({ onSignedOut: () => undefined });
    let asked = 0;
    await store.load('search{"q":"ri"}', async () => {
      asked++;
      if (asked === 1) throw new Error('answered 500');
      return 'found';
    });
    expect(store.failed('search{"q":"ri"}')).toBe(true);
    await store.retry('search{"q":"ri"}');
    expect(asked).toBe(2);
    expect(store.failed('search{"q":"ri"}')).toBe(false);
    expect(store.peek('search{"q":"ri"}')).toBe('found');
    await store.retry('search{"q":"ri"}');
    await store.retry('search{"q":"never"}');
    expect(asked).toBe(2);
  });

  it('never says a request refused for want of a sign-in failed', async () => {
    const store = createPageStore({ onSignedOut: () => undefined });
    await store.load('search{}', async () => {
      throw new SignedOut();
    });
    expect(store.failed('search{}')).toBe(false);
  });
});

describe('a page’s answer', () => {
  it('is what was kept, whatever failed since; else that it failed; else nothing while it loads', () => {
    expect(answerFrom('kept', true)).toEqual({ data: 'kept' });
    expect(answerFrom(undefined, true)).toBe('failed');
    expect(answerFrom(undefined, false)).toBeUndefined();
  });

  it('is kept by the page and what it asked for, and by what plays for a page that follows it', () => {
    expect(pageKey('search', { suggest: 'ri' })).toBe('search{"suggest":"ri"}');
    expect(pageKey('queue', {}, 'p1')).toBe('queue{}p1');
  });
});
