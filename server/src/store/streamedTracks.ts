/**
 * The songs that may stream: those search and radio have named. A client can name nothing else, so
 * no ref can reach an arbitrary video. Each row is what a queue, a label and a plan show of the song,
 * with no upstream call.
 */
import { z } from 'zod';
import type { Db } from './connection.js';

export interface StreamedTrack {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  /** Seconds. */
  duration: number;
  artUrl: string | null;
}

const rowSchema = z.object({
  id: z.string(),
  title: z.string(),
  artists: z.string().transform((text) => z.array(z.string()).parse(JSON.parse(text))),
  album: z.string().nullable(),
  duration: z.number(),
  art_url: z.string().nullable(),
});

export function streamedTrack(db: Db, id: string): StreamedTrack | undefined {
  const row = db.prepare('SELECT * FROM streamed_tracks WHERE id = ?').get(id);
  if (row === undefined) return undefined;
  const { art_url: artUrl, ...rest } = rowSchema.parse(row);
  return { ...rest, artUrl };
}

export function rememberTracks(db: Db, tracks: readonly StreamedTrack[], now: number): void {
  const write = db.prepare(
    `INSERT INTO streamed_tracks (id, title, artists, album, duration, art_url, seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       title = excluded.title, artists = excluded.artists, album = excluded.album,
       duration = excluded.duration, art_url = excluded.art_url, seen_at = excluded.seen_at`,
  );
  db.transaction(() => {
    for (const t of tracks) {
      write.run(t.id, t.title, JSON.stringify(t.artists), t.album, t.duration, t.artUrl, now);
    }
  })();
}
