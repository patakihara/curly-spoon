/**
 * Which MusicBrainz track a YouTube Music song is, for the tags a kept song is saved with. YouTube
 * Music gives no ISRC, only a title, artists, an album and a length, so the match goes by those, in
 * at most `MATCH_MOST_CALLS` calls (about 5 s at MusicBrainz's one call a second):
 *
 * 1. A named album: the release search by album and first artist. Official releases of that title,
 *    a release group a kept song already used first (so one album's songs share a folder), then the
 *    earliest. The first two are looked up until one has a track of the song's title within 4 s.
 * 2. No album, or nothing found: the recording search by title, first artist and length (4 s either
 *    way). Of the recordings of that title within 4 s, their release of the album's title first,
 *    official, then the earliest; that release is looked up for the track's place.
 * 3. Neither: the song is kept anyway, on what YouTube Music says, with no ids.
 *
 * A recording search alone is poor (77 rows for one hit, compilations first), and a soundtrack's
 * release is by Various Artists, so neither path does alone (checked live, 8 Nov). Queries send the
 * title as written with its brackets dropped, as MusicBrainz matches words only as spelled; the
 * answers are compared by `titleKey`. MusicBrainz unreachable throws `StepUnavailable` from the
 * client, which holds the request instead of keeping the song untagged.
 */
import type { MusicBrainzClient } from '../../adapters/musicbrainz/client.js';
import type {
  ArtistCredit,
  RecordingHit,
  Release,
  ReleaseHit,
} from '../../adapters/musicbrainz/schemas.js';
import { plainTitle, titleKey } from '../../text/fold.js';

/** The most MusicBrainz calls one song's match makes. */
export const MATCH_MOST_CALLS = 4;
/** How far a track's length may be from the song's and still be it. */
export const MATCH_LENGTH_MS = 4_000;
/** How many of rule 1's releases are looked up. */
const RELEASES_LOOKED_UP = 2;

/** A song as YouTube Music names it (`streamed_tracks`). */
export interface SongToMatch {
  title: string;
  artists: readonly string[];
  album: string | null;
  durationSeconds: number;
}

export interface MatchDeps {
  /** Null when MusicBrainz is turned off: every song is rule 3. */
  musicBrainz: Pick<MusicBrainzClient, 'searchReleases' | 'searchRecordings' | 'release'> | null;
  /** The release groups kept songs already used. */
  keptReleaseGroups?: ReadonlySet<string>;
}

export interface MatchedArtist {
  name: string;
  id: string;
}

/** A song found on MusicBrainz: what its tags are written from. */
export interface MusicBrainzMatch {
  source: 'MusicBrainz';
  by: 'release' | 'recording';
  title: string;
  /** The track's credit as written, joins and all. */
  artist: string;
  artists: MatchedArtist[];
  album: string;
  albumArtist: string;
  albumArtists: MatchedArtist[];
  trackNumber: number;
  trackTotal: number;
  discNumber: number;
  discTotal: number;
  /** The release's date, and its group's first. */
  date: string | null;
  originalDate: string | null;
  recordingId: string;
  releaseTrackId: string;
  releaseId: string;
  releaseGroupId: string;
  hasFrontCover: boolean;
}

/** A song MusicBrainz does not know, kept on what YouTube Music says. */
export interface YouTubeMusicMatch {
  source: 'YouTube Music';
  title: string;
  artist: string;
  artists: { name: string }[];
  /** The album, or the song's own title for a single. */
  album: string;
}

export type SongMatch = MusicBrainzMatch | YouTubeMusicMatch;

const credited = (credit: ArtistCredit) => credit.map((a) => `${a.name}${a.joinPhrase}`).join('');
const artistsOf = (credit: ArtistCredit): MatchedArtist[] =>
  credit.map((a) => ({ name: a.name, id: a.artistId }));

const near = (lengthMs: number | null, song: SongToMatch) =>
  lengthMs !== null && Math.abs(lengthMs - song.durationSeconds * 1000) <= MATCH_LENGTH_MS;

/** Earliest first; a release with no date after every dated one. `1983` comes before `1983-06`. */
function byDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Rule 1's order: the official releases titled as the album, a release group already kept first,
 * then the earliest. Ties keep MusicBrainz's order.
 */
export function orderReleases(
  releases: readonly ReleaseHit[],
  album: string,
  keptGroups: ReadonlySet<string>,
): ReleaseHit[] {
  const key = titleKey(album);
  const kept = (r: ReleaseHit) => (keptGroups.has(r.releaseGroup.id) ? 0 : 1);
  return releases
    .filter((r) => r.status === 'Official' && titleKey(r.title) === key)
    .sort((a, b) => kept(a) - kept(b) || byDate(a.date, b.date));
}

type Medium = Release['media'][number];
type Track = Medium['tracks'][number];

/**
 * The release's track that is the song: of its title, and within 4 s of its length; with
 * `recordings`, only one of those recordings. Null when none is.
 */
export function trackOn(
  release: Release,
  song: SongToMatch,
  recordings?: ReadonlySet<string>,
): { medium: Medium; track: Track } | null {
  const key = titleKey(song.title);
  for (const medium of release.media) {
    for (const track of medium.tracks) {
      const ours = recordings
        ? recordings.has(track.recording.id)
        : titleKey(track.title) === key || titleKey(track.recording.title) === key;
      if (ours && near(track.length ?? track.recording.length, song)) return { medium, track };
    }
  }
  return null;
}

function matched(
  by: MusicBrainzMatch['by'],
  release: Release,
  { medium, track }: { medium: Medium; track: Track },
): MusicBrainzMatch {
  return {
    source: 'MusicBrainz',
    by,
    title: track.title,
    artist: credited(track.artistCredit),
    artists: artistsOf(track.artistCredit),
    album: release.title,
    albumArtist: credited(release.artistCredit),
    albumArtists: artistsOf(release.artistCredit),
    trackNumber: track.position,
    trackTotal: medium.trackCount,
    discNumber: medium.position,
    discTotal: release.media.length,
    date: release.date,
    originalDate: release.releaseGroup.firstReleaseDate,
    recordingId: track.recording.id,
    releaseTrackId: track.id,
    releaseId: release.id,
    releaseGroupId: release.releaseGroup.id,
    hasFrontCover: release.hasFrontCover,
  };
}

/** Rule 2's order over the releases the matching recordings are on. */
function recordingReleases(recordings: readonly RecordingHit[], album: string | null) {
  const key = album === null ? null : titleKey(album);
  const releases = recordings.flatMap((r) => r.releases);
  const rank = (r: (typeof releases)[number]) =>
    (key !== null && titleKey(r.title) === key ? 0 : 2) + (r.status === 'Official' ? 0 : 1);
  return releases.sort((a, b) => rank(a) - rank(b) || byDate(a.date, b.date));
}

function fromYouTubeMusic(song: SongToMatch): YouTubeMusicMatch {
  return {
    source: 'YouTube Music',
    title: song.title,
    artist: song.artists.join(', '),
    artists: song.artists.map((name) => ({ name })),
    album: song.album ?? song.title,
  };
}

export async function matchSong(deps: MatchDeps, song: SongToMatch): Promise<SongMatch> {
  const mb = deps.musicBrainz;
  const artist = song.artists[0];
  if (mb === null || artist === undefined) return fromYouTubeMusic(song);
  let calls = 0;
  const lookedUp = new Map<string, Release | null>();
  const lookUp = async (id: string): Promise<Release | null | undefined> => {
    if (lookedUp.has(id)) return lookedUp.get(id);
    if (calls >= MATCH_MOST_CALLS) return undefined;
    calls += 1;
    const release = await mb.release(id);
    lookedUp.set(id, release);
    return release;
  };

  if (song.album !== null && plainTitle(song.album) !== '') {
    calls += 1;
    const found = await mb.searchReleases({ release: plainTitle(song.album), artist });
    const order = orderReleases(found.releases, song.album, deps.keptReleaseGroups ?? new Set());
    for (const hit of order.slice(0, RELEASES_LOOKED_UP)) {
      const release = await lookUp(hit.id);
      const on = release ? trackOn(release, song) : null;
      if (release && on) return matched('release', release, on);
    }
  }

  if (calls >= MATCH_MOST_CALLS) return fromYouTubeMusic(song);
  const ms = song.durationSeconds * 1000;
  calls += 1;
  const found = await mb.searchRecordings({
    title: plainTitle(song.title),
    artist,
    fromMs: ms - MATCH_LENGTH_MS,
    toMs: ms + MATCH_LENGTH_MS,
  });
  const key = titleKey(song.title);
  const recordings = found.recordings.filter(
    (r) => titleKey(r.title) === key && near(r.length, song),
  );
  const ids = new Set(recordings.map((r) => r.id));
  const best = recordingReleases(recordings, song.album)[0];
  if (best) {
    const release = await lookUp(best.id);
    const on = release ? trackOn(release, song, ids) : null;
    if (release && on) return matched('recording', release, on);
  }
  return fromYouTubeMusic(song);
}
