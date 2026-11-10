/**
 * A track's tags as Auralis writes them, under Picard's names, which Jellyfin's prober reads
 * (checked live). One set for every file Auralis tags: a kept song's Opus and an album's FLAC as
 * Vorbis comments, an album's MP3 as ID3v2.4 frames (`music/id3/frames.ts`). A tag left out (null,
 * empty) is not written.
 */
import type { VorbisComment } from './vorbis.js';

export interface TrackArtist {
  readonly name: string;
  /** The MusicBrainz artist id, when MusicBrainz named the artist. */
  readonly id?: string;
}

export interface TrackTags {
  readonly title: string;
  /** The artist credit as written. */
  readonly artist: string;
  readonly artists: readonly TrackArtist[];
  readonly album: string;
  readonly albumArtist: string;
  readonly albumArtists?: readonly TrackArtist[];
  readonly trackNumber?: number | null;
  readonly trackTotal?: number | null;
  readonly discNumber?: number | null;
  readonly discTotal?: number | null;
  readonly date?: string | null;
  readonly originalDate?: string | null;
  /** MusicBrainz's ids: the recording, the track on the release, the release and its group. */
  readonly recordingId?: string | null;
  readonly releaseTrackId?: string | null;
  readonly releaseId?: string | null;
  readonly releaseGroupId?: string | null;
}

/** The tags of a file Auralis cannot write: it is left as it was. */
export class TagsRefused extends Error {
  override readonly name = 'TagsRefused';
}

/** The comments `tags` is written as, in Picard's order. */
export function trackComments(tags: TrackTags): VorbisComment[] {
  const comments: VorbisComment[] = [];
  const add = (key: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') {
      comments.push({ key, value: String(value) });
    }
  };
  add('TITLE', tags.title);
  add('ARTIST', tags.artist);
  for (const { name } of tags.artists) add('ARTISTS', name);
  add('ALBUM', tags.album);
  add('ALBUMARTIST', tags.albumArtist);
  add('TRACKNUMBER', tags.trackNumber);
  add('TRACKTOTAL', tags.trackTotal);
  add('DISCNUMBER', tags.discNumber);
  add('DISCTOTAL', tags.discTotal);
  add('DATE', tags.date);
  add('ORIGINALDATE', tags.originalDate);
  add('MUSICBRAINZ_TRACKID', tags.recordingId);
  add('MUSICBRAINZ_RELEASETRACKID', tags.releaseTrackId);
  add('MUSICBRAINZ_ALBUMID', tags.releaseId);
  add('MUSICBRAINZ_RELEASEGROUPID', tags.releaseGroupId);
  for (const { id } of tags.artists) add('MUSICBRAINZ_ARTISTID', id);
  for (const { id } of tags.albumArtists ?? []) add('MUSICBRAINZ_ALBUMARTISTID', id);
  return comments;
}

/** The keys Auralis's tags replace, with the other names rippers write the same things under. */
const OWNED = new Set([
  'TITLE',
  'ARTIST',
  'ARTISTS',
  'ALBUM',
  'ALBUMARTIST',
  'ALBUM ARTIST',
  'ALBUM_ARTIST',
  'TRACKNUMBER',
  'TRACKTOTAL',
  'TOTALTRACKS',
  'DISCNUMBER',
  'DISCTOTAL',
  'TOTALDISCS',
  'DATE',
  'YEAR',
  'ORIGINALDATE',
  'ORIGINALYEAR',
]);

/** Whether a file's own comment under `key` gives way to Auralis's tags: any MusicBrainz key does. */
export function replacedComment(key: string): boolean {
  const upper = key.toUpperCase();
  return OWNED.has(upper) || upper.startsWith('MUSICBRAINZ_');
}
