/**
 * The music request list — newest first, mirroring `features/requests/RequestList.tsx`
 * at the DOM/test-id level so the two features feel like one app. Two real differences
 * from the book list, both forced by the music pipeline's own shape
 * (`musicRequestService.ts`'s file comment):
 *
 * 1. **No progress bar while `downloading`.** The book list's `LinearProgress` reflects
 *    `requestService.ts`'s `pollDownloads`, which polls the torrent client and writes
 *    `progress` as it moves. The music pipeline has no such poller — `progress` is
 *    whatever `grab()` last wrote (0, and frozen there) — so a bar here would just sit at
 *    0% forever, which reads as broken, not as "working". A plain note is the honest
 *    version: it says the download is in progress and that Jellyfin needs a manual
 *    rescan to pick it up once it lands, without claiming to track it.
 * 2. **Approve auto-grabs.** The book list's "Approve" button only calls `POST
 *    .../approve`, which leaves a request sitting at `approved` forever — nothing else
 *    in this codebase calls `grab()` for it (confirmed: `useGrabRequestMutation` exists
 *    in `api/queries.ts` but nothing renders a button for it). That gap is tolerable for
 *    books, where the request may still need an indexer search to resolve to a release.
 *    It is not tolerable for music: a music request already names one specific file held
 *    by one specific peer (`MusicCandidate`'s doc comment) — there is nothing left to
 *    decide, so leaving it at `approved` would mean every manually-approved request
 *    silently goes nowhere unless someone thinks to call `/grab` by hand. So `Approve`
 *    here chains straight into `grab()`, same as the search panel does for an
 *    auto-approved request (`MusicRequestSearchPanel.tsx`) and same as
 *    `routes/musicRequests.ts`'s own `/retry` already does server-side for a failed one.
 */
import { useState } from 'react';
import { Button } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import type { MusicRequest, RequestStatus } from '../../api/types.js';
import {
  useApproveMusicRequestMutation,
  useDeleteMusicRequestMutation,
  useGrabMusicRequestMutation,
  useRejectMusicRequestMutation,
  useRetryMusicRequestMutation,
} from '../../api/queries.js';

// Exhaustive against the shared `RequestStatus` type, but `importing`/`completed` are
// unreachable for a music row today — `musicRequestService.ts`'s `grab()` never moves a
// request past `downloading`, and nothing else in this pipeline advances it further. Kept
// in the map anyway so this stays a total function if that ever changes, rather than a
// silent `undefined` in the UI.
const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  searching: 'Searching',
  downloading: 'Downloading',
  importing: 'Importing',
  completed: 'Completed',
  failed: 'Failed',
};

export interface MusicRequestListProps {
  requests: MusicRequest[];
  /** Whether approve/reject affordances should render — the same `manual` approval
   * policy `RequestsPage` already reads for books (`getApprovalPolicy` is one shared
   * setting, not a per-media-type one). */
  allowApproval: boolean;
}

export function MusicRequestList({ requests, allowApproval }: MusicRequestListProps) {
  const approveMutation = useApproveMusicRequestMutation();
  const rejectMutation = useRejectMusicRequestMutation();
  const retryMutation = useRetryMusicRequestMutation();
  const grabMutation = useGrabMusicRequestMutation();
  const deleteMutation = useDeleteMusicRequestMutation();
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setActionErrors((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
    try {
      await action();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'That action could not be completed.';
      setActionErrors((current) => ({ ...current, [id]: message }));
    }
  };

  if (requests.length === 0) {
    return <p>No music requests yet — search above.</p>;
  }

  const sorted = [...requests].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <ul
      data-testid="music-requests-list"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {sorted.map((request) => (
        <li key={request.id} data-testid={`music-request-${request.id}`}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong>{request.title}</strong>
            {request.author ? <span>by {request.author}</span> : null}
            <span role="status" data-testid={`music-request-${request.id}-status`}>
              {STATUS_LABEL[request.status]}
            </span>
          </div>

          {request.status === 'downloading' ? (
            <p data-testid={`music-request-${request.id}-downloading-note`}>
              Downloading via Soulseek. Auralis doesn't track transfer progress for music yet, and
              Jellyfin needs a manual library rescan once the file lands before it shows up.
            </p>
          ) : null}

          {request.status === 'failed' && request.statusDetail ? (
            <p role="alert" data-testid={`music-request-${request.id}-failure-reason`}>
              {request.statusDetail}
            </p>
          ) : null}

          {actionErrors[request.id] ? (
            <p role="alert" data-testid={`music-request-${request.id}-action-error`}>
              {actionErrors[request.id]}
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            {allowApproval && request.status === 'pending' ? (
              <>
                <Button
                  size="sm"
                  variant="filled"
                  onClick={() =>
                    void runAction(request.id, async () => {
                      await approveMutation.mutateAsync(request.id);
                      // See this file's header comment: approving alone leaves the
                      // request sitting at `approved` forever, so this drives it the rest
                      // of the way rather than leaving that to a button that doesn't exist.
                      await grabMutation.mutateAsync(request.id);
                    })
                  }
                  data-testid={`music-request-${request.id}-approve`}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  onClick={() =>
                    void runAction(request.id, () => rejectMutation.mutateAsync(request.id))
                  }
                  data-testid={`music-request-${request.id}-reject`}
                >
                  Reject
                </Button>
              </>
            ) : null}
            {request.status === 'failed' ? (
              <Button
                size="sm"
                variant="outlined"
                onClick={() =>
                  void runAction(request.id, () => retryMutation.mutateAsync(request.id))
                }
                data-testid={`music-request-${request.id}-retry`}
              >
                Retry
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="text"
              onClick={() =>
                void runAction(request.id, () => deleteMutation.mutateAsync(request.id))
              }
              aria-label={`Delete the request for ${request.title}`}
              data-testid={`music-request-${request.id}-delete`}
            >
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
