/**
 * The pages' data, kept by key outside React: a page's route and what it depends on. A page opened
 * loads its data afresh, showing what was kept until the answer comes; the shell's back layer and
 * the page itself read the same key, so they share one request. A request refused for want of a
 * sign-in is handed on (`onSignedOut`); one that fails otherwise leaves what was kept.
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
  /** Loads `key` through `run`, unless it is loading already. */
  load(key: string, run: () => Promise<unknown>): Promise<void>;
}

export function createPageStore(options: { onSignedOut: () => void }): PageStore {
  const kept = new Map<string, unknown>();
  const loading = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    peek: (key) => kept.get(key),
    load(key, run) {
      const running = loading.get(key);
      if (running !== undefined) return running;
      const done = run()
        .then((data) => {
          kept.set(key, data);
          listeners.forEach((listener) => listener());
        })
        .catch((error: unknown) => {
          if (error instanceof SignedOut) options.onSignedOut();
        })
        .finally(() => loading.delete(key));
      loading.set(key, done);
      return done;
    },
  };
}
