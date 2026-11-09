/**
 * A kept song's tags: Vorbis comments under Picard's names, which Jellyfin's prober reads (checked
 * live). A MusicBrainz match writes its ids, place on the release and dates; a song MusicBrainz
 * does not know writes only YouTube Music's names. Every file carries `YOUTUBE_MUSIC_ID`, which is
 * how a file already placed is known to be this song's own.
 */
import { z } from 'zod';
import type { VorbisComment } from '../../music/opus/remux.js';
import type { SongMatch } from './match.js';

/** The comment a kept file is known by. */
export const YOUTUBE_MUSIC_ID = 'YOUTUBE_MUSIC_ID';

const artist = z.object({ name: z.string(), id: z.string() }).strict();

/** The match a release's details hold, as the search saved it. */
export const SongMatchSchema = z.discriminatedUnion('source', [
  z
    .object({
      source: z.literal('MusicBrainz'),
      by: z.enum(['release', 'recording']),
      title: z.string(),
      artist: z.string(),
      artists: z.array(artist),
      album: z.string(),
      albumArtist: z.string(),
      albumArtists: z.array(artist),
      trackNumber: z.number().int(),
      trackTotal: z.number().int(),
      discNumber: z.number().int(),
      discTotal: z.number().int(),
      date: z.string().nullable(),
      originalDate: z.string().nullable(),
      recordingId: z.string(),
      releaseTrackId: z.string(),
      releaseId: z.string(),
      releaseGroupId: z.string(),
      hasFrontCover: z.boolean(),
    })
    .strict(),
  z
    .object({
      source: z.literal('YouTube Music'),
      title: z.string(),
      artist: z.string(),
      artists: z.array(z.object({ name: z.string() }).strict()),
      album: z.string(),
    })
    .strict(),
]) satisfies z.ZodType<SongMatch>;

/** The comments a kept song's file is written with. */
export function songComments(youtubeMusicId: string, match: SongMatch): VorbisComment[] {
  const comments: VorbisComment[] = [];
  const add = (key: string, value: string | number | null) => {
    if (value !== null && value !== '') comments.push({ key, value: String(value) });
  };
  add('TITLE', match.title);
  add('ARTIST', match.artist);
  for (const { name } of match.artists) add('ARTISTS', name);
  add('ALBUM', match.album);
  if (match.source === 'MusicBrainz') {
    add('ALBUMARTIST', match.albumArtist);
    add('TRACKNUMBER', match.trackNumber);
    add('TRACKTOTAL', match.trackTotal);
    add('DISCNUMBER', match.discNumber);
    add('DISCTOTAL', match.discTotal);
    add('DATE', match.date);
    add('ORIGINALDATE', match.originalDate);
    add('MUSICBRAINZ_TRACKID', match.recordingId);
    add('MUSICBRAINZ_RELEASETRACKID', match.releaseTrackId);
    add('MUSICBRAINZ_ALBUMID', match.releaseId);
    add('MUSICBRAINZ_RELEASEGROUPID', match.releaseGroupId);
    for (const { id } of match.artists) add('MUSICBRAINZ_ARTISTID', id);
    for (const { id } of match.albumArtists) add('MUSICBRAINZ_ALBUMARTISTID', id);
  } else {
    add('ALBUMARTIST', match.artists[0]?.name ?? match.artist);
  }
  add(YOUTUBE_MUSIC_ID, youtubeMusicId);
  return comments;
}
