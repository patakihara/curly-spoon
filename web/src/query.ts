/**
 * The search draft: what a search field holds while it is typed into, per tab and in memory, and
 * running the search it holds. A generated page's `<Query />` binds a field's `onChange` to
 * `type` and its `onSubmit` to `submit`, as its `<Play>` binds `usePlay()` (`./player`). Either
 * is undefined while nothing holds the draft, so the field draws disabled rather than seeming to
 * work, until the search screen serves it (M2.search).
 */
export interface Query {
  /** Sets the draft to the text typed. */
  type: ((text: string) => void) | undefined;
  /** Runs the search for `text`: opens Search at `?q=text` and clears the draft. */
  submit: ((text: string) => void) | undefined;
}

const NONE: Query = { type: undefined, submit: undefined };

/** The tab's search draft. */
export function useQuery(): Query {
  return NONE;
}
