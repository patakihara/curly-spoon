import { QUERY_MAX } from '@auralis/schema';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAccessOf } from './data/access';
import { useDeps } from './data/deps';
import { pageKey } from './data/store';

/**
 * The search draft: what a search field holds while it is typed into, per tab and in memory, and
 * running the search it holds. A generated page's `<Query />` binds a field's `onChange` to
 * `type` and its `onSubmit` to `submit`, as its `<Play>` binds `usePlay()` (`./player`). Both are
 * undefined on the canvas, where the page draws its placeholder whatever is typed, so the field
 * draws disabled rather than seeming to work.
 *
 * A draft is typed over the search the page shows (its `?q=`, '' for none), and holds only there:
 * opening another search, as a suggestion does, leaves it behind. It settles `SETTLE_MS` after the
 * last keystroke, so what is asked for as it is typed (suggestions) waits for a pause in typing.
 * Submitted, it stays over the search it was typed on until another is shown, so the page never
 * draws that search again in between, and is dropped then; submitting the search already shown
 * opens nothing and settles the field on it. What is asked for is `searchText`: at most what the
 * server takes.
 */
export interface Query {
  /** Sets the draft to the text typed. */
  type: ((text: string) => void) | undefined;
  /** Runs the search for `text`: opens Search at `?q=text` and clears the draft; for the search
   * shown, asks it again if it failed. */
  submit: ((text: string) => void) | undefined;
}

/** How long typing pauses before the draft settles, in milliseconds. */
export const SETTLE_MS = 100;

/** What is typed, the search it is typed over, what of it has settled (null until it has), and
 * whether it was submitted. */
export interface Draft {
  text: string;
  over: string;
  settled: string | null;
  submitted: boolean;
}

/** The text a search asks for: trimmed, then at most `QUERY_MAX` letters, an emoji never split. */
export const searchText = (text: string): string =>
  [...text.trim()].slice(0, QUERY_MAX).join('').trimEnd();

export interface DraftStore {
  subscribe(listener: () => void): () => void;
  /** The draft, null while none is typed. */
  get(): Draft | null;
  /** Sets the draft to `text`, typed over the search `over`; it settles after a pause. */
  type(text: string, over: string): void;
  /** Drops the draft. */
  clear(): void;
  /** Marks the draft submitted: it settles no more, and goes once another search is shown. */
  submit(): void;
  /** Drops a submitted draft typed over a search other than `shown`. */
  dropSubmitted(shown: string): void;
}

export function createDraftStore(): DraftStore {
  let draft: Draft | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const set = (to: Draft | null) => {
    draft = to;
    listeners.forEach((listener) => listener());
  };
  const cancel = () => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => draft,
    type(text, over) {
      cancel();
      const settled = draft !== null && draft.over === over ? draft.settled : null;
      set({ text, over, settled, submitted: false });
      pending = setTimeout(() => {
        pending = null;
        if (draft !== null) set({ ...draft, settled: draft.text });
      }, SETTLE_MS);
    },
    clear() {
      cancel();
      if (draft !== null) set(null);
    },
    submit() {
      cancel();
      if (draft !== null) set({ ...draft, submitted: true });
    },
    dropSubmitted(shown) {
      if (draft?.submitted === true && draft.over !== shown) set(null);
    },
  };
}

/** The tab's one draft. */
export const drafts = createDraftStore();

const NONE: Query = { type: undefined, submit: undefined };

/**
 * Runs the search for `text` from the search `shown`: opens it, the draft submitted rather than
 * dropped first, or for the search already shown, settles the field on it, opens nothing, and asks
 * it again (`askAgain`), which tries anew a search that failed and leaves any other as it is.
 */
export function submitSearch(
  text: string,
  shown: string,
  navigate: (to: string) => void,
  store: DraftStore = drafts,
  askAgain: (q: string) => void = () => undefined,
): void {
  const q = searchText(text);
  if (q === shown) {
    store.clear();
    return askAgain(q);
  }
  store.submit();
  navigate(q === '' ? '/search' : `/search?${new URLSearchParams({ q })}`);
}

/** The search the page shows: its `?q=`, '' for none. */
const useShownSearch = (): string => useSearchParams()[0].get('q') ?? '';

/** The tab's search draft. */
export function useQuery(): Query {
  const navigate = useNavigate();
  const over = useShownSearch();
  const { access, pages } = useDeps();
  const canvas = useAccessOf(access) === 'canvas';
  useEffect(() => drafts.dropSubmitted(over), [over]);
  return useMemo(
    () =>
      canvas
        ? NONE
        : {
            type: (text: string) => drafts.type(text, over),
            submit: (text: string) =>
              submitSearch(
                text,
                over,
                (to) => void navigate(to),
                drafts,
                // The key Search keeps a search's results by (data/index.tsx).
                (q) => void pages.retry(pageKey('search', { q })),
              ),
          },
    [canvas, navigate, over, pages],
  );
}

const noDraft = (): null => null;

/** The tab's draft, for a page that `follows` it; null, and no redraw as it is typed, for others. */
export function useTabDraft(follows: boolean): Draft | null {
  const get = follows ? drafts.get : noDraft;
  return useSyncExternalStore(drafts.subscribe, get, get);
}
