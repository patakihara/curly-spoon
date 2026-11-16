/**
 * A Spotify playlist's entries resolved, in order, each to a YouTube Music song or an unmatched
 * entry with its reason and place (`resolveEntries`).
 *
 * - A track is searched by its name and first artist (`nameQuery`); only when that finds no match
 *   and the track has an ISRC is the ISRC searched alone. No third query.
 * - A match's row is written to `streamed_tracks`, as search writes it, so it may stream.
 * - What a track resolved to is kept in `spotify_matches`: a match 30 days, no match 7 days. A
 *   kept track asks nothing.
 * - Searches go one at a time, each starting at least `IMPORT_SEARCH_GAP_MS` after the last ended
 *   (`pacedSearch`), apart from the search route's own.
 * - Unmatched reasons: `noMatch` (searched, nothing passed; the nearest row and the rule it failed
 *   are kept), `notASong` (an episode or a local file), `unavailable` (Spotify has no metadata) and
 *   `listFull` (past `LIST_ENTRIES_MAX`, never read or searched).
 */
import { LIST_ENTRIES_MAX } from '@auralis/schema';
import { z } from 'zod';
import type { Clock } from '../../adapters/musicbrainz/client.js';
import type { SpotifyEntry } from '../../adapters/spotify/client.js';
import type { SpotifyTrack } from '../../adapters/spotify/schemas.js';
import type { YtSong } from '../../adapters/ytmusic/client.js';
import type { Db } from '../../store/connection.js';
import { rememberTracks, streamedTrack } from '../../store/streamedTracks.js';
import { matchSpotifyTrack, nameQuery, type NearRow } from './match.js';

/** The least time from one import search's end to the next one's start. */
export const IMPORT_SEARCH_GAP_MS = 2_000;
/** How long a match is kept. */
export const MATCH_KEPT_MS = 30 * 24 * 60 * 60 * 1000;
/** How long a track that matched nothing is kept as such. */
export const NO_MATCH_KEPT_MS = 7 * 24 * 60 * 60 * 1000;

export type UnmatchedReason = 'noMatch' | 'notASong' | 'unavailable' | 'listFull';

export interface Unmatched {
  position: number;
  reason: UnmatchedReason;
  uri: string;
  /** What Spotify names; null where it was never read. */
  title: string | null;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  /** For `noMatch`: the row that got furthest, never added. */
  near: NearRow | null;
}

export type Resolved =
  | { position: number; uri: string; youtubeId: string; unmatched: null }
  | { position: number; uri: string; youtubeId: null; unmatched: Unmatched };

export interface ResolveDeps {
  db: Db;
  clock: Pick<Clock, 'now'>;
  /** YouTube Music's song search, paced (`pacedSearch`). */
  search: (query: string) => Promise<YtSong[]>;
  /** The track's Spotify metadata, or null when Spotify has none. */
  track: (id: string) => Promise<SpotifyTrack | null>;
}

/** `search`, one at a time, each at least `IMPORT_SEARCH_GAP_MS` after the last one ended. */
export function pacedSearch(
  search: (query: string) => Promise<YtSong[]>,
  clock: Clock,
): (query: string) => Promise<YtSong[]> {
  let tail: Promise<unknown> = Promise.resolve();
  let lastEnded = Number.NEGATIVE_INFINITY;
  return (query) => {
    const run = async () => {
      const wait = lastEnded + IMPORT_SEARCH_GAP_MS - clock.now();
      if (wait > 0) await clock.sleep(wait);
      try {
        return await search(query);
      } finally {
        lastEnded = clock.now();
      }
    };
    const turn = tail.then(run, run);
    tail = turn.catch(() => undefined);
    return turn;
  };
}

const nearSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    artists: z.array(z.string()),
    album: z.string().nullable(),
    duration: z.number(),
    failed: z.enum(['title', 'artist', 'length']),
  })
  .nullable();

const keptSchema = z.object({
  youtube_id: z.string().nullable(),
  near: z.string().transform((text) => nearSchema.parse(JSON.parse(text))),
});

type Kept = { youtubeId: string } | { youtubeId: null; near: NearRow | null };

function kept(db: Db, now: number, id: string): Kept | undefined {
  const row = db
    .prepare(
      `SELECT youtube_id, near FROM spotify_matches WHERE spotify_track_id = ?
       AND at > CASE WHEN youtube_id IS NULL THEN ? ELSE ? END`,
    )
    .get(id, now - NO_MATCH_KEPT_MS, now - MATCH_KEPT_MS);
  if (row === undefined) return undefined;
  const { youtube_id: youtubeId, near } = keptSchema.parse(row);
  // A match whose song is no longer streamable is searched again.
  if (youtubeId !== null) return streamedTrack(db, youtubeId) ? { youtubeId } : undefined;
  return { youtubeId: null, near };
}

function keep(db: Db, now: number, id: string, found: Kept): void {
  db.transaction(() => {
    db.prepare(
      `DELETE FROM spotify_matches
       WHERE at <= CASE WHEN youtube_id IS NULL THEN ? ELSE ? END`,
    ).run(now - NO_MATCH_KEPT_MS, now - MATCH_KEPT_MS);
    db.prepare(
      `INSERT INTO spotify_matches (spotify_track_id, youtube_id, reason, near, at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (spotify_track_id) DO UPDATE SET
         youtube_id = excluded.youtube_id, reason = excluded.reason, near = excluded.near,
         at = excluded.at`,
    ).run(
      id,
      found.youtubeId,
      found.youtubeId === null ? 'noMatch' : 'matched',
      JSON.stringify(found.youtubeId === null ? found.near : null),
      now,
    );
  })();
}

/** One Spotify track resolved: kept, or searched by name, then by ISRC. */
export async function resolveTrack(deps: ResolveDeps, id: string, track: SpotifyTrack) {
  const { db, clock } = deps;
  const known = kept(db, clock.now(), id);
  if (known) return known;
  const queries = [nameQuery(track), ...(track.isrc === null ? [] : [track.isrc])];
  let near: NearRow | null = null;
  for (const [n, query] of queries.entries()) {
    const found = matchSpotifyTrack(track, await deps.search(query));
    if (found.match !== null) {
      rememberTracks(db, [found.match], clock.now());
      const result = { youtubeId: found.match.id };
      keep(db, clock.now(), id, result);
      return result;
    }
    // The name query's nearest row says more than the ISRC's, unless it found none.
    if (n === 0 || near === null) near = found.near;
  }
  const result = { youtubeId: null, near };
  keep(db, clock.now(), id, result);
  return result;
}

function unmatched(
  entry: SpotifyEntry,
  reason: UnmatchedReason,
  track: SpotifyTrack | null = null,
  near: NearRow | null = null,
): Resolved {
  return {
    position: entry.position,
    uri: entry.uri,
    youtubeId: null,
    unmatched: {
      position: entry.position,
      reason,
      uri: entry.uri,
      title: track?.title ?? null,
      artists: track?.artists ?? [],
      album: track?.album ?? null,
      durationMs: track?.durationMs ?? null,
      near,
    },
  };
}

/** Each entry resolved, in the playlist's order, as it resolves. */
export async function* resolveEntries(
  deps: ResolveDeps,
  entries: readonly SpotifyEntry[],
): AsyncGenerator<Resolved> {
  for (const entry of entries) {
    if (entry.position >= LIST_ENTRIES_MAX) yield unmatched(entry, 'listFull');
    else if (entry.kind === 'notASong') yield unmatched(entry, 'notASong');
    else {
      const track = await deps.track(entry.id);
      if (track === null) yield unmatched(entry, 'unavailable');
      else {
        const found = await resolveTrack(deps, entry.id, track);
        yield found.youtubeId === null
          ? unmatched(entry, 'noMatch', track, found.near)
          : {
              position: entry.position,
              uri: entry.uri,
              youtubeId: found.youtubeId,
              unmatched: null,
            };
      }
    }
  }
}
