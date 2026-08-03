/**
 * Book requests: search for a release and ask for it, then track its progress
 * through to import. Only reachable at all once `destinations.ts` decides an
 * indexer and a download client both exist — see that module's doc comment.
 */
import { useRequestSettingsQuery, useRequestsQuery } from '../../api/queries.js';
import { AskForBookPanel } from './AskForBookPanel.js';
import { RequestList } from './RequestList.js';

export function RequestsPage() {
  const requestsQuery = useRequestsQuery();
  const settingsQuery = useRequestSettingsQuery();
  const allowApproval = settingsQuery.data?.approvalPolicy === 'manual';

  return (
    <div className="auralis-page" data-testid="requests-page">
      <h1>Requests</h1>

      <AskForBookPanel />

      <section>
        <h2>Your requests</h2>
        {requestsQuery.isLoading ? (
          <p>Loading requests…</p>
        ) : requestsQuery.isError ? (
          <p role="alert">Couldn't load requests: {requestsQuery.error.message}</p>
        ) : (
          <RequestList
            requests={requestsQuery.data?.requests ?? []}
            allowApproval={allowApproval}
          />
        )}
      </section>
    </div>
  );
}
