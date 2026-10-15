/**
 * The pages' data, kept by key outside React: a page's route and what it depends on. A page opened
 * loads its data afresh, showing what was kept until the answer comes; the shell's back layer and
 * the page itself read the same key, so they share one request. A request refused for want of a
 * sign-in is handed on (`onSignedOut`); one that fails otherwise leaves what was kept, and is
 * said to have failed until the page is asked for again.
 */

/** A request the server refused for want of a sign-in (401). */
export class SignedOut extends Error {
  constructor() {
    super('signed out');
  }
}

export interface PageStore {
  subscribe(listener: () => void): () => void;
  /** What is kept for `key`; undefined until its first answer. */
  peek(key: string): unknown;
  /** Whether the last request for `key` failed, other than for want of a sign-in. */
  failed(key: string): boolean;
  /** Loads `key` through `run`, unless it is loading already. */
  load(key: string, run: () => Promise<unknown>): Promise<void>;
}

/** The answer a page has: what was kept, else that its request failed; undefined while it loads. */
export type Answer<T> = { data: T } | 'failed' | undefined;

export const answerFrom = <T>(kept: T | undefined, failed: boolean): Answer<T> =>
  kept !== undefined ? { data: kept } : failed ? 'failed' : undefined;

/** The key a page's data is kept by: the page, what it asks for, and what plays if it follows that. */
export const pageKey = (name: string, asks: object, playing = ''): string =>
  `${name}${JSON.stringify(asks)}${playing}`;

export function createPageStore(options: { onSignedOut: () => void }): PageStore {
  const kept = new Map<string, unknown>();
  const loading = new Map<string, Promise<void>>();
  const failed = new Set<string>();
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((listener) => listener());
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    peek: (key) => kept.get(key),
    failed: (key) => failed.has(key),
    load(key, run) {
      const running = loading.get(key);
      if (running !== undefined) return running;
      if (failed.delete(key)) tell();
      const done = run()
        .then((data) => {
          kept.set(key, data);
          tell();
        })
        .catch((error: unknown) => {
          if (error instanceof SignedOut) options.onSignedOut();
          else {
            failed.add(key);
            tell();
          }
        })
        .finally(() => loading.delete(key));
      loading.set(key, done);
      return done;
    },
  };
}
