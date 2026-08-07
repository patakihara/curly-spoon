/**
 * The Search view's "available to request" group for books (docs/ROADMAP.md §12b).
 * Rendered by `SearchPage.tsx` only once `requestabilitySections()` says a book
 * request could actually be fulfilled — this component never re-checks that itself.
 *
 * Deliberately not a copy-paste of `AskForBookPanel.tsx`'s markup: this view has no
 * "Author" field or explicit submit button (the debounced unified search field is the
 * only input), but the *mutation* and the two outcomes it can settle into — a specific
 * release, or "request anyway" when the debounced term matched no release — are the
 * same ones that panel already exercises, reused via the same `useCreateRequestMutation`
 * / `shouldOfferRequestAnyway` rather than forked.
 *
 * Renders nothing while the search is loading or has not settled yet — the section
 * heading only appears once there is something to show, so a slow indexer never
 * flashes an empty "Available to request" heading above the library results it sits
 * beside.
 */
import { useState } from 'react';
import { Button, Chip, ListItem } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import type { Release } from '../../api/types.js';
import { useCreateRequestMutation, useRequestSearchQuery } from '../../api/queries.js';
import { formatBytes } from '../requests/format.js';
import { shouldOfferRequestAnyway } from '../requests/requestAnyway.js';

export function RequestableBooksSection({ term }: { term: string }) {
  const searchQuery = useRequestSearchQuery(term, '');
  const createMutation = useCreateRequestMutation();
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());
  const [titleRequested, setTitleRequested] = useState(false);
  const [titleRequestError, setTitleRequestError] = useState<string | null>(null);

  const releases = searchQuery.data?.releases ?? [];

  const handleRequest = async (release: Release) => {
    setCreateErrors((current) => {
      const { [release.guid]: _removed, ...rest } = current;
      return rest;
    });
    try {
      await createMutation.mutateAsync({ title: release.title, release });
      setRequested((current) => new Set(current).add(release.guid));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create this request.';
      setCreateErrors((current) => ({ ...current, [release.guid]: message }));
    }
  };

  const handleRequestAnyway = async () => {
    setTitleRequestError(null);
    try {
      await createMutation.mutateAsync({ title: term });
      setTitleRequested(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create this request.';
      setTitleRequestError(message);
    }
  };

  const offerRequestAnyway = shouldOfferRequestAnyway({
    submittedTerm: term,
    isLoading: searchQuery.isLoading,
    releaseCount: releases.length,
  });

  // Nothing settled yet (still loading, or the debounce hasn't produced a term):
  // no heading, no placeholder — see this file's header comment for why.
  if (searchQuery.isLoading || (releases.length === 0 && !offerRequestAnyway)) {
    return null;
  }

  return (
    <section data-testid="search-requestable-books" className="auralis-requestable-section">
      <h2>Available to request</h2>
      <p className="auralis-requestable-section__hint">
        Not in your library. Requesting starts a download.
      </p>

      {releases.length > 0 ? (
        // Per the spec's own words — "pressing a requestable item requests
        // it" — the whole row is the control: `ListItem` renders as a
        // `<button>` while unrequested (`onClick` fires the request), then
        // flips to a non-interactive row with a "Requested" chip once it
        // lands, rather than nesting a second `<button>` inside it.
        <div className="auralis-result-list">
          {releases.map((release) => {
            const isRequested = requested.has(release.guid);
            return (
              <ListItem
                key={release.guid}
                data-testid={`search-requestable-book-${release.guid}`}
                headline={release.title}
                supportingText={`${release.sourceName} · ${formatBytes(release.sizeBytes)} · ${release.seeders} seeders`}
                interactive={!isRequested && !createMutation.isPending}
                onClick={isRequested ? undefined : () => void handleRequest(release)}
                trailing={
                  isRequested ? (
                    <Chip
                      variant="assist"
                      data-testid={`search-requestable-book-${release.guid}-requested`}
                    >
                      Requested
                    </Chip>
                  ) : undefined
                }
              />
            );
          })}
          {releases
            .filter((release) => createErrors[release.guid])
            .map((release) => (
              <p
                key={`${release.guid}-error`}
                role="alert"
                data-testid={`search-requestable-book-${release.guid}-error`}
              >
                {createErrors[release.guid]}
              </p>
            ))}
        </div>
      ) : null}

      {offerRequestAnyway ? (
        <div data-testid="search-requestable-book-anyway">
          {titleRequested ? (
            <Chip variant="assist" data-testid="search-requestable-book-anyway-requested">
              Requested "{term}"
            </Chip>
          ) : (
            <Button
              size="sm"
              variant="filled"
              onClick={() => void handleRequestAnyway()}
              disabled={createMutation.isPending}
              data-testid="search-requestable-book-anyway-button"
            >
              Request "{term}"
            </Button>
          )}
          {titleRequestError ? (
            <p role="alert" data-testid="search-requestable-book-anyway-error">
              {titleRequestError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
