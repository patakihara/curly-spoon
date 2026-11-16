/**
 * Which YouTube Music song a Spotify track is, from the rows of a search. YouTube Music names no
 * ISRC, so a row is the track when all three rules hold:
 *
 * 1. **title**: the row's `titleKey` is the track's, or, failing that, a bracket's other name in the
 *    track's title (`Bang a Gong (Get It On)`, listed as `Get It On`);
 * 2. **artist**: one of the row's artists folds (`foldName`, a leading `The` dropped) to one of the
 *    track's, or, for names in
 *    another script (`米津玄師`, `Kenshi Yonezu`), the album's `titleKey` is the track's and the
 *    length is within 2 s;
 * 3. **length**: within `MATCH_LENGTH_MS` (4 s, M3.keep's tolerance); or, when the row's first
 *    artist folds to the track's first artist and its title names no other take (`Live`,
 *    `Classic Version`, `Extended Mix`) than the track's, within `REMASTER_LENGTH_MS` (15 s) or
 *    `REMASTER_LENGTH_SHARE` (8%) of the track, whichever is larger: a remaster or an edit.
 *
 * Of the rows that pass, the best is one within 4 s, then the one on the track's album, then an album's track (`ATV`)
 * over an official video (`OMV`), then the nearer length, then YouTube Music's order. Only the
 * first `MATCH_ROWS` rows of an answer are weighed. No row passing, the nearest is the one that got
 * furthest through the rules, and it says which rule it failed; it is never added.
 */
import type { YtSong } from '../../adapters/ytmusic/client.js';
import type { SpotifyTrack } from '../../adapters/spotify/schemas.js';
import { MATCH_LENGTH_MS } from '../../requests/songs/match.js';
import { foldName, plainTitle, searchFold, titleKey } from '../../text/fold.js';

/** How far a row on the track's album, with no artist in common, may be from its length. */
export const SAME_ALBUM_LENGTH_MS = 2_000;
/** How far a remaster by the same first artist may be from the track's length, at least. */
export const REMASTER_LENGTH_MS = 15_000;
/** How far, as a share of the track's length, when that is more. */
export const REMASTER_LENGTH_SHARE = 0.08;
/** Words in a title that name another take of the song than its remaster. */
const TAKE =
  /\b(?:live|version|mix|remix|edit|acoustic|demo|instrumental|re-?recorded|unplugged)\b/g;
/** Words in a bracket that make it a note on the take, not another name of the song. */
const NOTE =
  /\b(?:feat|ft|with|from|remaster(?:ed)?|live|version|mix|remix|edit|acoustic|demo|instrumental|mono|stereo|pts?|parts?|soundtrack)\b|\d{4}/;
/** A bracket's words: "(Get It On)". */
const BRACKET = /[([{]([^)\]}]*)[)\]}]/g;
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

/** An artist's name for comparing: folded, a leading "The" dropped. */
const artistKey = (name: string) => foldName(name).replace(/^the\s+/, '');

/** The track's title, then each bracket in it that names the song another way. */
function titleKeys(title: string): string[] {
  const others = [...title.matchAll(BRACKET)]
    .map((m) => m[1]!.trim())
    .filter((inside) => inside !== '' && !NOTE.test(searchFold(inside)));
  return [titleKey(title), ...others.map(titleKey)];
}

const lengthGap = (track: SpotifyTrack, row: YtSong) =>
  Math.abs(row.duration * 1000 - track.durationMs);

/** The row is within `MATCH_LENGTH_MS` of the track: no remaster's tolerance needed. */
export const withinLength = (track: SpotifyTrack, row: YtSong) =>
  lengthGap(track, row) <= MATCH_LENGTH_MS;

const sameAlbum = (track: SpotifyTrack, row: YtSong) =>
  track.album !== null && row.album !== null && titleKey(track.album) === titleKey(row.album);

const takes = (title: string) => new Set(searchFold(title).match(TAKE) ?? []);

/** A remaster: the same first artist, and no take named in the row's title but the track's own. */
function looseLength(track: SpotifyTrack, row: YtSong): boolean {
  const [ours, theirs] = [track.artists[0], row.artists[0]];
  if (ours === undefined || theirs === undefined || artistKey(ours) !== artistKey(theirs))
    return false;
  const named = takes(track.title);
  if ([...takes(row.title)].some((take) => !named.has(take))) return false;
  return (
    lengthGap(track, row) <= Math.max(REMASTER_LENGTH_MS, REMASTER_LENGTH_SHARE * track.durationMs)
  );
}

/** The first rule the row fails, or null when it is the track. */
export function failedRule(track: SpotifyTrack, row: YtSong): MatchRule | null {
  if (!titleKeys(track.title).includes(titleKey(row.title))) return 'title';
  const ours = new Set(track.artists.map(artistKey));
  const artist =
    row.artists.some((name) => ours.has(artistKey(name))) ||
    (sameAlbum(track, row) && lengthGap(track, row) <= SAME_ALBUM_LENGTH_MS);
  if (!artist) return 'artist';
  if (lengthGap(track, row) > MATCH_LENGTH_MS && !looseLength(track, row)) return 'length';
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
      withinLength(track, w.row) ? 0 : 1,
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
