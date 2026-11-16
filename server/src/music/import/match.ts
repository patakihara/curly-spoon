/**
 * Which YouTube Music song a Spotify track is, from the rows of a search. YouTube Music names no
 * ISRC, so a row is the track when all three rules hold:
 *
 * 1. **title**: the row's `titleKey` is the track's;
 * 2. **artist**: one of the row's artists folds (`foldName`) to one of the track's, or, for names in
 *    another script (`米津玄師`, `Kenshi Yonezu`), the album's `titleKey` is the track's and the
 *    length is within 2 s;
 * 3. **length**: within `MATCH_LENGTH_MS` (4 s, M3.keep's tolerance).
 *
 * Of the rows that pass, the best is the one on the track's album, then an album's track (`ATV`)
 * over an official video (`OMV`), then the nearer length, then YouTube Music's order. Only the
 * first `MATCH_ROWS` rows of an answer are weighed. No row passing, the nearest is the one that got
 * furthest through the rules, and it says which rule it failed; it is never added.
 */
import type { YtSong } from '../../adapters/ytmusic/client.js';
import type { SpotifyTrack } from '../../adapters/spotify/schemas.js';
import { MATCH_LENGTH_MS } from '../../requests/songs/match.js';
import { foldName, plainTitle, titleKey } from '../../text/fold.js';

/** How far a row on the track's album, with no artist in common, may be from its length. */
export const SAME_ALBUM_LENGTH_MS = 2_000;
/** How many rows of one search answer are weighed (rows 2 to 4 were the alternatives, live). */
export const MATCH_ROWS = 5;

export type MatchRule = 'title' | 'artist' | 'length';

/** A row seen and not taken, as an unmatched track's report names it. */
export interface NearRow {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  /** Seconds. */
  duration: number;
  failed: MatchRule;
}

export type TrackMatch = { match: YtSong } | { match: null; near: NearRow | null };

/** The first query: the title as written, its brackets and edition dropped, and the first artist. */
export function nameQuery(track: Pick<SpotifyTrack, 'title' | 'artists'>): string {
  return [plainTitle(track.title), track.artists[0] ?? ''].join(' ').trim();
}

const lengthGap = (track: SpotifyTrack, row: YtSong) =>
  Math.abs(row.duration * 1000 - track.durationMs);

const sameAlbum = (track: SpotifyTrack, row: YtSong) =>
  track.album !== null && row.album !== null && titleKey(track.album) === titleKey(row.album);

/** The first rule the row fails, or null when it is the track. */
export function failedRule(track: SpotifyTrack, row: YtSong): MatchRule | null {
  if (titleKey(row.title) !== titleKey(track.title)) return 'title';
  const ours = new Set(track.artists.map(foldName));
  const artist =
    row.artists.some((name) => ours.has(foldName(name))) ||
    (sameAlbum(track, row) && lengthGap(track, row) <= SAME_ALBUM_LENGTH_MS);
  if (!artist) return 'artist';
  if (lengthGap(track, row) > MATCH_LENGTH_MS) return 'length';
  return null;
}

const RULE_ORDER: readonly MatchRule[] = ['title', 'artist', 'length'];

export function matchSpotifyTrack(track: SpotifyTrack, rows: readonly YtSong[]): TrackMatch {
  const weighed = rows.slice(0, MATCH_ROWS).map((row, place) => ({
    row,
    place,
    failed: failedRule(track, row),
  }));
  const passing = weighed.filter((w) => w.failed === null);
  if (passing.length > 0) {
    const rank = (w: (typeof passing)[number]) => [
      sameAlbum(track, w.row) ? 0 : 1,
      w.row.type === 'ATV' ? 0 : 1,
      lengthGap(track, w.row),
      w.place,
    ];
    const best = passing.reduce((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      for (let n = 0; n < ra.length; n += 1) {
        if (ra[n]! !== rb[n]!) return ra[n]! < rb[n]! ? a : b;
      }
      return a;
    });
    return { match: best.row };
  }
  const furthest = weighed.reduce<(typeof weighed)[number] | null>((best, w) => {
    if (best === null) return w;
    const depth = (x: typeof w) => RULE_ORDER.indexOf(x.failed!);
    return depth(w) > depth(best) ? w : best;
  }, null);
  if (furthest === null) return { match: null, near: null };
  const { id, title, artists, album, duration } = furthest.row;
  return { match: null, near: { id, title, artists, album, duration, failed: furthest.failed! } };
}
