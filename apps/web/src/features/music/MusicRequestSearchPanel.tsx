/**
 * "Search for music to request" — searches `GET /music-requests/search` (a real,
 * possibly-slow Soulseek search, `music/slskd.ts`'s `pollUntilComplete`) and turns a
 * candidate into a request. Mirrors `features/requests/AskForBookPanel.tsx` at every level
 * that carries over; three things deliberately do not:
 *
 * 1. **No "request anyway".** A book request can name a title with no release attached
 *    and let `grab()` search again later (`requestAnyway.ts`). Music has no equivalent —
 *    `createMusicRequestBodySchema`'s doc comment explains why: a `MusicCandidate` *is*
 *    one specific file held by one specific peer right now, so there is nothing to
 *    request without one in hand.
 * 2. **In-flight vs. settled-empty is the whole point here.** `musicSearchStatus.ts`'s
 *    doc comment has the detail: unlike a book search (fast, effectively synchronous
 *    against Prowlarr), a music search can take up to ~17s server-side with no separate
 *    "still working" signal — only the one HTTP response, whenever it lands. Rendering
 *    "no matches" before that response arrives would be a false negative, which is why
 *    `musicSearchViewState` exists as its own tested function rather than an inline
 *    ternary here.
 * 3. **Requesting a candidate can auto-start the download.** `createMusicRequest`'s
 *    response reports the fresh row's status (`approved` under the default auto-approval
 *    policy, `pending` under manual). An `approved` row is only useful once `grab()` has
 *    actually enqueued it with the provider — nothing else in this codebase does that on
 *    its own (see `MusicRequestList.tsx`'s header comment) — so this chains straight into
 *    `grab()` when creation lands on `approved`. Under manual approval the row stays
 *    `pending`; `MusicRequestList.tsx`'s own Approve action does the equivalent chaining
 *    for that path.
 *
 * A11y: the candidate list and the per-provider error notices are plain, static content —
 * they only change on an explicit search submit, and a screen reader user who just
 * triggered that submit does not need every resulting row announced individually (that is
 * the "spam" `docs/HANDOVER.md`'s brief warns against, and the reason the lyrics view has
 * no `aria-live` region at all). Instead, following `features/search/SearchPage.tsx`'s
 * own choice for the same "discrete, user-triggered state change" shape, a single
 * `role="status"` line summarises the current view state (searching / N results / no
 * matches) — one announcement per search, not one per row.
 */
import { useState } from 'react';
import { Button, Chip, SearchField } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import type { MusicCandidate } from '../../api/types.js';
import {
  useCreateMusicRequestMutation,
  useGrabMusicRequestMutation,
  useMusicRequestSearchQuery,
} from '../../api/queries.js';
import { formatBytes } from '../requests/format.js';
import { formatBitrate } from './musicRequestFormat.js';
import { musicSearchViewState } from './musicSearchStatus.js';

/**
 * `hasErrors` suppresses the `'empty'` case's text specifically — same reasoning as
 * `AskForBookPanel`'s `errors.length === 0 ? <p>No releases found...</p> : null`: when a
 * provider errored, the error notice already explains why nothing came back, and "No
 * matches" next to it reads as a second, slightly contradictory answer to the same
 * question rather than new information.
 */
function summaryLine(
  viewState: ReturnType<typeof musicSearchViewState>,
  term: string,
  candidateCount: number,
  hasErrors: boolean,
): string | null {
  switch (viewState) {
    case 'idle':
      return null;
    case 'searching':
      return 'Searching Soulseek…';
    case 'empty':
      return hasErrors
        ? null
        : `No matches for "${term}". Soulseek results depend on who is online right now — try again later.`;
    case 'results':
      return `${candidateCount} ${candidateCount === 1 ? 'result' : 'results'} for "${term}".`;
  }
}

export interface MusicRequestSearchPanelProps {
  /** Wave 15d-1-W: seeds both `term` (so the field shows what will be searched, and she
   * can edit it before re-submitting) and `submittedTerm` (so the search actually runs on
   * mount — `useMusicRequestSearchQuery`'s `enabled: term.trim().length > 0` fires it with
   * no extra click needed). A plain `useState` initializer, not a `useEffect`: this panel
   * remounts fresh on every navigation to `/music/requests?prefill=…` (TanStack Router
   * gives each route match a new component instance), so there is no stale-prop case to
   * guard against the way there would be if the same instance could see a changing prop. */
  initialTerm?: string;
}

export function MusicRequestSearchPanel({ initialTerm }: MusicRequestSearchPanelProps = {}) {
  const [term, setTerm] = useState(initialTerm ?? '');
  const [submittedTerm, setSubmittedTerm] = useState(initialTerm ?? '');
  const searchQuery = useMusicRequestSearchQuery(submittedTerm);
  const createMutation = useCreateMusicRequestMutation();
  const grabMutation = useGrabMusicRequestMutation();
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());

  const submitSearch = () => setSubmittedTerm(term.trim());

  const candidates = searchQuery.data?.candidates ?? [];
  const errors = searchQuery.data?.errors ?? [];
  const viewState = musicSearchViewState({
    submittedTerm,
    isLoading: searchQuery.isLoading,
    candidateCount: candidates.length,
  });

  const handleRequest = async (candidate: MusicCandidate) => {
    setRowErrors((current) => {
      const { [candidate.guid]: _removed, ...rest } = current;
      return rest;
    });
    try {
      const { request: created } = await createMutation.mutateAsync(candidate);
      setRequested((current) => new Set(current).add(candidate.guid));
      if (created.status === 'approved') {
        // See this file's header comment — an approved-but-never-grabbed request would
        // otherwise sit inert. A failure here still leaves the request created and visible
        // in "Your music requests" below (with its own retry action), so this only needs
        // to surface the message, not undo the "Requested" state above.
        try {
          await grabMutation.mutateAsync(created.id);
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : 'Requested, but the download could not be started.';
          setRowErrors((current) => ({ ...current, [candidate.guid]: message }));
        }
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create this request.';
      setRowErrors((current) => ({ ...current, [candidate.guid]: message }));
    }
  };

  const summary = summaryLine(viewState, submittedTerm, candidates.length, errors.length > 0);

  return (
    <section data-testid="ask-for-music">
      <h2>Search for music to request</h2>

      <div data-testid="music-request-search-field">
        <SearchField
          value={term}
          onChange={setTerm}
          onSubmit={submitSearch}
          placeholder="Track, album or artist"
          aria-label="Music to search for"
        />
      </div>

      <Button
        variant="outlined"
        size="sm"
        onClick={submitSearch}
        data-testid="music-request-search-submit"
      >
        Search
      </Button>

      {summary ? (
        <p role="status" data-testid="music-request-search-summary">
          {summary}
        </p>
      ) : null}

      {errors.length > 0 ? (
        <div role="status" data-testid="music-request-search-errors">
          {errors.map((error) => (
            <p key={error.providerId}>{error.message}</p>
          ))}
        </div>
      ) : null}

      {viewState === 'results' ? (
        <ul
          data-testid="music-request-search-results"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {candidates.map((candidate) => {
            const bitrate = formatBitrate(candidate.bitrateKbps);
            return (
              <li key={candidate.guid} data-testid={`music-candidate-${candidate.guid}`}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{candidate.title}</strong>
                  {candidate.artist ? <span>{candidate.artist}</span> : null}
                  {candidate.album ? <span>{candidate.album}</span> : null}
                  <Chip variant="assist">{candidate.sourceName}</Chip>
                  <span>{formatBytes(candidate.sizeBytes)}</span>
                  {bitrate ? <span>{bitrate}</span> : null}
                  {candidate.format ? <span>{candidate.format}</span> : null}
                </div>

                {requested.has(candidate.guid) ? (
                  <Chip
                    variant="assist"
                    data-testid={`music-candidate-${candidate.guid}-requested`}
                  >
                    Requested
                  </Chip>
                ) : (
                  <Button
                    size="sm"
                    variant="filled"
                    onClick={() => void handleRequest(candidate)}
                    disabled={createMutation.isPending}
                    data-testid={`music-candidate-${candidate.guid}-request`}
                  >
                    Request
                  </Button>
                )}

                {rowErrors[candidate.guid] ? (
                  <p role="alert" data-testid={`music-candidate-${candidate.guid}-error`}>
                    {rowErrors[candidate.guid]}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
