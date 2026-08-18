/**
 * "Ask for a book" — searches `GET /requests/search` and turns a release into a
 * request. Search only runs on explicit submit (Enter, or the Search button),
 * not on every keystroke: unlike the in-memory library filter, this fans out to
 * real indexers, and hammering Prowlarr/AudiobookBay on each character typed
 * would be both slow and rude to the upstream.
 *
 * `errors` renders alongside whatever `releases` came back, never in place of
 * them. Hiding a broken indexer's error would make "AudiobookBay found three
 * things, Prowlarr is unreachable" look identical to "nothing exists in your
 * indexers" — the single most confusing failure mode this feature has, per the
 * spec. So a partial-failure search still shows both the hits and the notice.
 *
 * When a search comes up with zero releases — whether nothing matched or every
 * indexer errored — "Request anyway" queues the typed title with no release
 * attached (`POST /requests` with `release` omitted; the service's `grab`
 * searches again at grab time). This is the only way to reach that server
 * capability from the UI: the per-release "Request" button below always has a
 * release to attach. It matters most exactly when an indexer is down, which is
 * why it is offered in both empty cases rather than only the "nothing matched"
 * one — see `requestAnyway.ts` for the enabling rule, unit-tested on its own.
 *
 * `initialTitle`/`initialAuthor` (wave 15d-1-books-W): seed the two fields from
 * `RequestsPage.tsx`'s `?prefillTitle=`/`?prefillAuthor=`, so an external recommended-shelf
 * card lands here with the title (and author, when known) already typed in. Deliberately
 * *not* threaded into `submittedTerm`/`submittedAuthor` — unlike `/music/requests`'
 * `?prefill=`, this does not auto-run a search; the user still presses Search (or Enter),
 * the same explicit-submit contract every other search here already has (see this file's own
 * header comment on why search never fires per keystroke).
 */
import { useState } from 'react';
import { Button, Chip, SearchField } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import type { Release } from '../../api/types.js';
import { useCreateRequestMutation, useRequestSearchQuery } from '../../api/queries.js';
import { formatBytes } from './format.js';
import { shouldOfferRequestAnyway } from './requestAnyway.js';

export interface AskForBookPanelProps {
  initialTitle?: string;
  initialAuthor?: string;
}

export function AskForBookPanel({ initialTitle, initialAuthor }: AskForBookPanelProps = {}) {
  const [term, setTerm] = useState(initialTitle ?? '');
  const [author, setAuthor] = useState(initialAuthor ?? '');
  const [submittedTerm, setSubmittedTerm] = useState('');
  // Separate from the live `author` state for the same reason `submittedTerm` is
  // separate from `term`: the query key must only change on explicit submit, or
  // every keystroke in the author field would re-fan-out to the indexers too —
  // exactly the "hammering the upstream" this file's header warns against.
  const [submittedAuthor, setSubmittedAuthor] = useState('');
  const searchQuery = useRequestSearchQuery(submittedTerm, submittedAuthor);
  const createMutation = useCreateRequestMutation();
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());
  const [titleRequested, setTitleRequested] = useState(false);
  const [titleRequestError, setTitleRequestError] = useState<string | null>(null);

  const submitSearch = () => {
    setSubmittedTerm(term.trim());
    setSubmittedAuthor(author.trim());
    // A fresh search invalidates any earlier "request anyway" outcome — it
    // belonged to the previous submitted term, not this one.
    setTitleRequested(false);
    setTitleRequestError(null);
  };

  const handleRequest = async (release: Release) => {
    setCreateErrors((current) => {
      const { [release.guid]: _removed, ...rest } = current;
      return rest;
    });
    try {
      await createMutation.mutateAsync({
        title: release.title,
        // The submitted author, not the live field — keeps the request
        // consistent with whatever search actually produced this release,
        // even if the user has since typed something else into the field.
        author: submittedAuthor || undefined,
        release,
      });
      setRequested((current) => new Set(current).add(release.guid));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create this request.';
      setCreateErrors((current) => ({ ...current, [release.guid]: message }));
    }
  };

  const releases = searchQuery.data?.releases ?? [];
  const errors = searchQuery.data?.errors ?? [];

  const handleRequestAnyway = async () => {
    setTitleRequestError(null);
    try {
      await createMutation.mutateAsync({
        title: submittedTerm,
        author: submittedAuthor || undefined,
      });
      setTitleRequested(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create this request.';
      setTitleRequestError(message);
    }
  };

  const offerRequestAnyway = shouldOfferRequestAnyway({
    submittedTerm,
    isLoading: searchQuery.isLoading,
    releaseCount: releases.length,
  });

  return (
    <section data-testid="ask-for-book">
      <h2>Ask for a book</h2>

      <div data-testid="request-search-field">
        <SearchField
          value={term}
          onChange={setTerm}
          onSubmit={submitSearch}
          placeholder="Book title"
          aria-label="Book title to request"
        />
      </div>

      <label className="auralis-field" htmlFor="request-search-author">
        <span className="auralis-field__label">Author (optional)</span>
        <input
          id="request-search-author"
          type="text"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          data-testid="request-search-author-input"
        />
      </label>

      <Button
        variant="outlined"
        size="sm"
        onClick={submitSearch}
        data-testid="request-search-submit"
      >
        Search
      </Button>

      {errors.length > 0 ? (
        <div role="status" data-testid="request-search-errors">
          {errors.map((error) => (
            <p key={error.indexerId}>{error.message}</p>
          ))}
        </div>
      ) : null}

      {searchQuery.isLoading ? (
        <p>Searching…</p>
      ) : submittedTerm.length === 0 ? null : offerRequestAnyway ? (
        <div data-testid="request-anyway-panel">
          {errors.length === 0 ? <p>No releases found for "{submittedTerm}".</p> : null}

          {titleRequested ? (
            <Chip variant="assist" data-testid="request-anyway-requested">
              Requested
            </Chip>
          ) : (
            <Button
              size="sm"
              variant="filled"
              onClick={() => void handleRequestAnyway()}
              disabled={createMutation.isPending}
              data-testid="request-anyway"
            >
              Request "{submittedTerm}" anyway
            </Button>
          )}

          {titleRequestError ? (
            <p role="alert" data-testid="request-anyway-error">
              {titleRequestError}
            </p>
          ) : null}
        </div>
      ) : (
        <ul
          data-testid="request-search-results"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {releases.map((release) => (
            <li key={release.guid} data-testid={`release-${release.guid}`}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <strong>{release.title}</strong>
                <Chip variant="assist">{release.sourceName}</Chip>
                <span>{formatBytes(release.sizeBytes)}</span>
                <span>{release.seeders} seeders</span>
                {release.format ? <span>{release.format}</span> : null}
              </div>

              {requested.has(release.guid) ? (
                <Chip variant="assist" data-testid={`release-${release.guid}-requested`}>
                  Requested
                </Chip>
              ) : (
                <Button
                  size="sm"
                  variant="filled"
                  onClick={() => void handleRequest(release)}
                  disabled={createMutation.isPending}
                  data-testid={`release-${release.guid}-request`}
                >
                  Request
                </Button>
              )}

              {createErrors[release.guid] ? (
                <p role="alert" data-testid={`release-${release.guid}-error`}>
                  {createErrors[release.guid]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
