/**
 * A kept song's search: which MusicBrainz track it is, from what search or radio said of it
 * (`streamed_tracks`). It always picks one release, the match's, or YouTube Music's own names when
 * MusicBrainz knows none; there is never a choice. The release's details carry the song's id and the
 * whole match, which the import tags the file from and M3.albums later replaces it by. MusicBrainz
 * unreachable throws `StepUnavailable` from its client, so the request is held, never kept untagged.
 */
import { z } from 'zod';
import type { JobLog } from '../../jobs/schedule.js';
import type { Db } from '../../store/connection.js';
import { releasesOf, type StoredRequest } from '../../store/requests.js';
import { streamedTrack } from '../../store/streamedTracks.js';
import type { Release, SearchOutcome } from '../steps.js';
import { type MatchDeps, matchSong, type SongMatch } from './match.js';

/** What a song's release holds: the song, and the match it is tagged from. */
export const SongDetails = z
  .object({
    youtubeMusicId: z.string().regex(/^[\w-]{1,64}$/),
    match: z
      .object({ source: z.enum(['MusicBrainz', 'YouTube Music']), album: z.string() })
      .passthrough(),
  })
  .strict();
export type SongDetails = z.infer<typeof SongDetails>;

export interface SongSearchDeps {
  db: Db;
  musicBrainz: MatchDeps['musicBrainz'];
  log?: JobLog;
}

/** The release groups songs already kept or being kept went with, so one album keeps one folder. */
function keptReleaseGroups(db: Db, log?: JobLog): Set<string> {
  const groups = releasesOf(db, 'song', log).flatMap(({ details }) => {
    const group = (details.match as Partial<Record<string, unknown>> | undefined)?.releaseGroupId;
    return typeof group === 'string' ? [group] : [];
  });
  return new Set(groups);
}

/** The release a match makes: MusicBrainz's release by its id, else the song's own. */
function releaseOf(youtubeMusicId: string, match: SongMatch): Release {
  const details: SongDetails = { youtubeMusicId, match: { ...match } };
  return {
    id: match.source === 'MusicBrainz' ? match.releaseId : youtubeMusicId,
    title: match.album,
    source: match.source,
    size: null,
    details,
  };
}

export function songSearch(deps: SongSearchDeps) {
  return async (request: StoredRequest): Promise<SearchOutcome> => {
    const id = request.target.ids.youtubeMusicId;
    const song = id === undefined ? undefined : streamedTrack(deps.db, id);
    if (id === undefined || song === undefined) return { kind: 'none', reason: 'noRelease' };
    const match = await matchSong(
      { musicBrainz: deps.musicBrainz, keptReleaseGroups: keptReleaseGroups(deps.db, deps.log) },
      {
        title: song.title,
        artists: song.artists,
        album: song.album,
        durationSeconds: song.duration,
      },
    );
    return { kind: 'picked', release: releaseOf(id, match), others: [] };
  };
}
