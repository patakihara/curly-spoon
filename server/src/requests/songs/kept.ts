/**
 * Which songs from YouTube Music the household now holds as its own files. A kept song is the
 * Jellyfin track its keep named on arrival, for as long as the library index holds that track: a
 * play, a queue row, its art, Search and radio then all go by the track. Once the index no longer
 * holds it, the song streams again. A keep still under way leaves the song streaming, and a person
 * on it sees where it stands.
 */
import type { MediaRef, RequestRef } from '@auralis/schema';
import { indexedRow } from '../../libraryIndex/store.js';
import type { Db } from '../../store/connection.js';
import {
  arrivedRequests,
  liveRequest,
  peopleOn,
  type StoredRequest,
} from '../../store/requests.js';

/** A song's request as the requests store finds it: by its id alone. */
const songRef = (youtubeMusicId: string): RequestRef => ({
  medium: 'song',
  target: { title: youtubeMusicId, creator: null, ids: { youtubeMusicId } },
});

/** The Jellyfin track this song was kept as, while the index holds it; else null. */
export function keptTrack(db: Db, youtubeMusicId: string): MediaRef | null {
  for (const { result } of arrivedRequests(db, songRef(youtubeMusicId))) {
    if (result?.source === 'jellyfin' && indexedRow(db, 'jellyfin', result.id) !== undefined) {
      return result;
    }
  }
  return null;
}

/** The keep of this song under way that this person is on, if any. */
export function liveKeep(db: Db, userId: string, youtubeMusicId: string): StoredRequest | null {
  const live = liveRequest(db, songRef(youtubeMusicId));
  return live !== undefined && peopleOn(db, live.id).includes(userId) ? live : null;
}
