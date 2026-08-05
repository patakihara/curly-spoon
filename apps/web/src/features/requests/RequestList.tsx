/**
 * The request list itself — newest first, with the failure reason surfaced
 * verbatim when failed (that's the whole reason `statusDetail` exists) and a
 * progress bar while actively downloading. Approve/reject only render under the
 * `manual` policy (`RequestsPage` decides that and passes it down); retry and
 * delete are always available, per-status, regardless of policy.
 */
import { useState } from 'react';
import { Button, LinearProgress } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import type { BookRequest } from '../../api/types.js';
import {
  useApproveRequestMutation,
  useDeleteRequestMutation,
  useRejectRequestMutation,
  useRetryRequestMutation,
} from '../../api/queries.js';
import { REQUEST_STATUS_LABEL } from './statusLabels.js';

export interface RequestListProps {
  requests: BookRequest[];
  /** Whether approve/reject affordances should render at all — the `manual` approval policy. */
  allowApproval: boolean;
}

export function RequestList({ requests, allowApproval }: RequestListProps) {
  const approveMutation = useApproveRequestMutation();
  const rejectMutation = useRejectRequestMutation();
  const retryMutation = useRetryRequestMutation();
  const deleteMutation = useDeleteRequestMutation();
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
    return <p>No requests yet — ask for a book above.</p>;
  }

  const sorted = [...requests].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <ul
      data-testid="requests-list"
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
        <li key={request.id} data-testid={`request-${request.id}`}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong>{request.title}</strong>
            {request.author ? <span>by {request.author}</span> : null}
            <span role="status" data-testid={`request-${request.id}-status`}>
              {REQUEST_STATUS_LABEL[request.status]}
            </span>
          </div>

          {request.status === 'downloading' ? (
            <LinearProgress
              value={request.progress}
              aria-label={`Download progress for ${request.title}`}
            />
          ) : null}

          {request.status === 'failed' && request.statusDetail ? (
            <p role="alert" data-testid={`request-${request.id}-failure-reason`}>
              {request.statusDetail}
            </p>
          ) : null}

          {actionErrors[request.id] ? (
            <p role="alert" data-testid={`request-${request.id}-action-error`}>
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
                    void runAction(request.id, () => approveMutation.mutateAsync(request.id))
                  }
                  data-testid={`request-${request.id}-approve`}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  onClick={() =>
                    void runAction(request.id, () => rejectMutation.mutateAsync(request.id))
                  }
                  data-testid={`request-${request.id}-reject`}
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
                data-testid={`request-${request.id}-retry`}
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
              data-testid={`request-${request.id}-delete`}
            >
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
