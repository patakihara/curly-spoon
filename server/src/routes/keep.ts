/**
 * Keeping a song from YouTube Music: `POST /keep {ref}`. A client names the song only by the ref
 * search or radio gave it; the target is built here from `streamed_tracks`, so nothing a client
 * says reaches a request but which of those songs it means. Any other ref answers 404, as one
 * never named does. The rest is a request like any other (joined, retried, or found in the
 * library), and the job is woken so the keep starts at once rather than at its next turn.
 */
import { keepSong, RequestRef } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import type { Wake } from '../requests/job.js';
import { Refusal, serve } from '../route.js';
import type { StoredRequest } from '../store/requests.js';
import { streamedTrack } from '../store/streamedTracks.js';
import { signedIn } from './auth.js';
import { requestDoor, type RequestDoorDeps } from './requests.js';

/** The longest title or artist a request's target holds. */
const TARGET_LENGTH = 300;

/** Keeps a song search or radio named for a person, waking the job; 404 for any other. */
export function songKeeper(
  deps: RequestDoorDeps & { wake: Wake },
): (userId: string, youtubeMusicId: string) => Promise<StoredRequest> {
  const { askFor } = requestDoor(deps);
  return async (userId, youtubeMusicId) => {
    const song = streamedTrack(deps.db, youtubeMusicId);
    if (song === undefined) throw new Refusal(404, 'not_found');
    // Parsed, so a name past a target's length is cut rather than stored unreadable.
    const asked = RequestRef.parse({
      medium: 'song',
      target: {
        title: song.title.slice(0, TARGET_LENGTH),
        creator: song.artists[0]?.slice(0, TARGET_LENGTH) ?? null,
        ids: { youtubeMusicId },
      },
    });
    const kept = await askFor(userId, asked);
    deps.wake.now();
    return kept;
  };
}

export function keepRoutes(app: FastifyInstance, deps: RequestDoorDeps & { wake: Wake }): void {
  const { viewOf } = requestDoor(deps);
  const keep = songKeeper(deps);

  serve(app, keepSong, async (request, _reply, { ref }) => {
    if (ref.source !== 'ytmusic') throw new Refusal(404, 'not_found');
    return viewOf(await keep(signedIn(request).id, ref.id));
  });
}
