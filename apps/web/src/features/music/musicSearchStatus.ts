/**
 * What `MusicRequestSearchPanel` should render for the current search — pulled out as a
 * pure function because the domain has a real trap here, already hit once elsewhere in
 * this project (see `features/search/searchStatus.ts`'s file comment): `GET
 * /music-requests/search` runs a real, slow Soulseek search server-side
 * (`music/slskd.ts`'s `pollUntilComplete`, up to ~17s) and answers with one HTTP response
 * once it settles — there is no separate "still warming up" signal to poll for. So the
 * *only* thing standing between "in flight" and "genuinely nothing matched" is whether the
 * query has resolved yet. Rendering `'empty'` while `isLoading` is still true would show a
 * false negative — "no matches" for a search that hasn't actually run yet — exactly the
 * failure mode `docs/HANDOVER.md`'s music-request wave spec calls out by name.
 */
export type MusicSearchViewState = 'idle' | 'searching' | 'results' | 'empty';

export interface MusicSearchStatusInput {
  /** The term actually submitted (Enter / the Search button) — not the live input value,
   * which changes on every keystroke and would flicker this back to `'idle'` mid-type. */
  submittedTerm: string;
  /** `useMusicRequestSearchQuery(...).isLoading` — true only while this term's query has
   * no data yet, which is also true immediately after switching to a new term (a fresh
   * `submittedTerm` is a fresh query key, so there is no stale previous-term data to
   * mistake for this term's answer). */
  isLoading: boolean;
  candidateCount: number;
}

export function musicSearchViewState(input: MusicSearchStatusInput): MusicSearchViewState {
  if (input.submittedTerm.trim().length === 0) return 'idle';
  if (input.isLoading) return 'searching';
  return input.candidateCount > 0 ? 'results' : 'empty';
}
