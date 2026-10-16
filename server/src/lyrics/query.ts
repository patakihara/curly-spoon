/**
 * What LRCLIB is asked for one indexed Jellyfin track: its first artist (else its album's first
 * album artist), its title, its album's title and its length in whole seconds. LRCLIB's matcher
 * found both "A feat. B" and the bare "A" alike, and forgives a second or two of length (checked
 * live). Record mode builds its LRCLIB requests with this same function, so a replayed request
 * equals its recording.
 */
import { type LrclibQuery } from '../adapters/lrclib/client.js';
import { type IndexRow } from '../libraryIndex/rows.js';

/** The query for `track` on `album`, or null when the track has no length or no artist. */
export function lyricsQuery(track: IndexRow, album: IndexRow): LrclibQuery | null {
  const artist =
    track.creators.find((c) => c.role === 'artist' && c.name !== '')?.name ??
    album.creators.find((c) => c.role === 'album-artist' && c.name !== '')?.name;
  if (track.duration === null || artist === undefined) return null;
  return {
    artistName: artist,
    trackName: track.title,
    albumName: album.title,
    duration: Math.round(track.duration),
  };
}
