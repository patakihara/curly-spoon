/**
 * The Search view's "available to request" group for music (docs/ROADMAP.md §12b).
 * Rendered by `SearchPage.tsx` only once `requestabilitySections()` says a music
 * request could actually be fulfilled — this component never re-checks that itself.
 *
 * Mirrors `RequestableBooksSection.tsx` at every level that carries over, and
 * `MusicRequestSearchPanel.tsx` for the parts specific to music requests — reusing
 * `useCreateMusicRequestMutation`/`useGrabMusicRequestMutation` rather than forking
 * them. Two things that panel documents and this one inherits unchanged:
 *
 * - **No "request anyway".** A `MusicCandidate` is one specific file held by one
 *   specific peer right now — there is nothing to request without one in hand, so
 *   this section (unlike the books one) never offers a title-only fallback.
 * - **Requesting a candidate can auto-start the download.** A fresh row that lands
 *   `approved` (the default auto-approval policy) is only useful once `grab()` has
 *   actually enqueued it, so creation chains straight into that on success.
 *
 * Renders nothing while the search is loading or has produced no candidates — same
 * "no flash of an empty heading" reasoning as the books section.
 */
import { useState } from 'react';
import { Chip, ListItem } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import type { MusicCandidate } from '../../api/types.js';
import {
  useCreateMusicRequestMutation,
  useGrabMusicRequestMutation,
  useMusicRequestSearchQuery,
} from '../../api/queries.js';
import { formatBytes } from '../requests/format.js';
import { formatBitrate } from '../music/musicRequestFormat.js';

export function RequestableMusicSection({ term }: { term: string }) {
  const searchQuery = useMusicRequestSearchQuery(term);
  const createMutation = useCreateMusicRequestMutation();
  const grabMutation = useGrabMusicRequestMutation();
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());

  const candidates = searchQuery.data?.candidates ?? [];

  const handleRequest = async (candidate: MusicCandidate) => {
    setRowErrors((current) => {
      const { [candidate.guid]: _removed, ...rest } = current;
      return rest;
    });
    try {
      const { request: created } = await createMutation.mutateAsync(candidate);
      setRequested((current) => new Set(current).add(candidate.guid));
      if (created.status === 'approved') {
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

  if (searchQuery.isLoading || candidates.length === 0) {
    return null;
  }

  return (
    <section data-testid="search-requestable-music" className="auralis-requestable-section">
      <h2>Available to request</h2>
      <p className="auralis-requestable-section__hint">
        Found on Soulseek, not in your library. Requesting starts a download.
      </p>

      <div className="auralis-result-list">
        {candidates.map((candidate) => {
          const isRequested = requested.has(candidate.guid);
          const bitrate = formatBitrate(candidate.bitrateKbps);
          const details = [
            candidate.artist,
            candidate.album,
            candidate.sourceName,
            formatBytes(candidate.sizeBytes),
            bitrate,
            candidate.format,
          ]
            .filter((part): part is string => Boolean(part))
            .join(' · ');

          return (
            <ListItem
              key={candidate.guid}
              data-testid={`search-requestable-music-${candidate.guid}`}
              headline={candidate.title}
              supportingText={details}
              interactive={!isRequested && !createMutation.isPending}
              onClick={isRequested ? undefined : () => void handleRequest(candidate)}
              trailing={
                isRequested ? (
                  <Chip
                    variant="assist"
                    data-testid={`search-requestable-music-${candidate.guid}-requested`}
                  >
                    Requested
                  </Chip>
                ) : undefined
              }
            />
          );
        })}
        {candidates
          .filter((candidate) => rowErrors[candidate.guid])
          .map((candidate) => (
            <p
              key={`${candidate.guid}-error`}
              role="alert"
              data-testid={`search-requestable-music-${candidate.guid}-error`}
            >
              {rowErrors[candidate.guid]}
            </p>
          ))}
      </div>
    </section>
  );
}
