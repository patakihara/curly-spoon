/**
 * A kept song's tags: the shared track tags (`music/tags.ts`) as Vorbis comments. A MusicBrainz
 * match writes its ids, place on the release and dates; a song MusicBrainz does not know writes only
 * YouTube Music's names. Every file carries `YOUTUBE_MUSIC_ID`, which is how a file already placed
 * is known to be this song's own.
 */
import { z } from 'zod';
import { type TrackTags, trackComments } from '../../music/tags.js';
import type { VorbisComment } from '../../music/vorbis.js';
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

/** The comments a kept song's file is written with: the track's own, then `YOUTUBE_MUSIC_ID`. */
export function songComments(youtubeMusicId: string, match: SongMatch): VorbisComment[] {
  const tags: TrackTags =
    match.source === 'MusicBrainz'
      ? {
          title: match.title,
          artist: match.artist,
          artists: match.artists,
          album: match.album,
          albumArtist: match.albumArtist,
          albumArtists: match.albumArtists,
          trackNumber: match.trackNumber,
          trackTotal: match.trackTotal,
          discNumber: match.discNumber,
          discTotal: match.discTotal,
          date: match.date,
          originalDate: match.originalDate,
          recordingId: match.recordingId,
          releaseTrackId: match.releaseTrackId,
          releaseId: match.releaseId,
          releaseGroupId: match.releaseGroupId,
        }
      : {
          title: match.title,
          artist: match.artist,
          artists: match.artists,
          album: match.album,
          albumArtist: match.artists[0]?.name ?? match.artist,
        };
  return [...trackComments(tags), { key: YOUTUBE_MUSIC_ID, value: youtubeMusicId }];
}
