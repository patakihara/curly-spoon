/**
 * Spotify tracks an import read (`spotify_tracks`), kept 30 days: the Spotify reader's cache. A
 * row past its time is neither answered nor kept: a write drops every such row first.
 */
import { z } from 'zod';
import type { Clock } from '../adapters/musicbrainz/client.js';
import { SPOTIFY_TRACK_CACHE_MS, type SpotifyTrackCache } from '../adapters/spotify/client.js';
import type { SpotifyTrack } from '../adapters/spotify/schemas.js';
import type { Db } from './connection.js';

const rowSchema = z.object({
  title: z.string(),
  artists: z.string().transform((text) => z.array(z.string()).parse(JSON.parse(text))),
  album: z.string().nullable(),
  duration_ms: z.number().int(),
  isrc: z.string().nullable(),
});

export function spotifyTrackCache(db: Db, clock: Pick<Clock, 'now'>): SpotifyTrackCache {
  return {
    get(id: string): SpotifyTrack | undefined {
      const row = db
        .prepare('SELECT * FROM spotify_tracks WHERE id = ? AND at > ?')
        .get(id, clock.now() - SPOTIFY_TRACK_CACHE_MS);
      if (row === undefined) return undefined;
      const { duration_ms: durationMs, ...rest } = rowSchema.parse(row);
      return { ...rest, durationMs };
    },
    put(id: string, t: SpotifyTrack): void {
      const now = clock.now();
      db.transaction(() => {
        db.prepare('DELETE FROM spotify_tracks WHERE at <= ?').run(now - SPOTIFY_TRACK_CACHE_MS);
        db.prepare(
          `INSERT INTO spotify_tracks (id, title, artists, album, duration_ms, isrc, at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             title = excluded.title, artists = excluded.artists, album = excluded.album,
             duration_ms = excluded.duration_ms, isrc = excluded.isrc, at = excluded.at`,
        ).run(id, t.title, JSON.stringify(t.artists), t.album, t.durationMs, t.isrc, now);
      })();
    },
  };
}
