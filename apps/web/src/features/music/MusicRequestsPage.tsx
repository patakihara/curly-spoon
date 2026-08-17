/**
 * Music requests (`/music/requests`): search Soulseek for a specific file and ask for it,
 * then track it through to `downloading` — see `MusicRequestList.tsx`'s header comment for
 * why that is where tracking stops. Mirrors `features/requests/RequestsPage.tsx` (books),
 * reached instead from `MusicHomePage.tsx`'s own nav row (alongside Playlists/Favourites)
 * rather than the global nav destinations `components/destinations.ts` computes — this
 * page has no library-existence precondition the way Books/Podcasts do, and no
 * indexer-plus-download-client precondition the way the book Requests destination does
 * (`GET /music-requests/search` degrades to an empty candidate list with a per-provider
 * error when slskd isn't configured, same as an unreachable book indexer), so it doesn't
 * need a visibility gate of its own — it is simply another `/music/*` page a user reaches
 * by navigating in, same as `/music/playlists` and `/music/favorites`.
 *
 * `?prefill=` (wave 15d-1-W, `routeTree.ts`'s `validateSearch`) seeds
 * `MusicRequestSearchPanel` and lets it auto-run the search — the hand-off an external
 * (not-owned) card on `/music`'s recommended shelf uses instead of navigating to the dead
 * album page it used to.
 */
import { useSearch } from '@tanstack/react-router';
import { useMusicRequestsQuery, useRequestSettingsQuery } from '../../api/queries.js';
import { MusicRequestList } from './MusicRequestList.js';
import { MusicRequestSearchPanel } from './MusicRequestSearchPanel.js';

export function MusicRequestsPage() {
  const { prefill } = useSearch({ from: '/music/requests' });
  const requestsQuery = useMusicRequestsQuery();
  // Same shared setting the book `RequestsPage` reads — `getApprovalPolicy` is one
  // installation-wide policy, not split per media type (`appSettingsRepo.ts`).
  const settingsQuery = useRequestSettingsQuery();
  const allowApproval = settingsQuery.data?.approvalPolicy === 'manual';

  return (
    <div className="auralis-page" data-testid="music-requests-page">
      <h1>Music requests</h1>

      <MusicRequestSearchPanel initialTerm={prefill} />

      <section>
        <h2>Your music requests</h2>
        {requestsQuery.isLoading ? (
          <p>Loading requests…</p>
        ) : requestsQuery.isError ? (
          <p role="alert">Couldn't load requests: {requestsQuery.error.message}</p>
        ) : (
          <MusicRequestList
            requests={requestsQuery.data?.requests ?? []}
            allowApproval={allowApproval}
          />
        )}
      </section>
    </div>
  );
}
