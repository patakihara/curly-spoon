/**
 * Playing Jellyfin music, as the signed-in person with their own token, so Jellyfin answers only
 * what they can see. A track plans as one track; an album as one plan of its tracks in disc and
 * track order, back to back, so the players run it gapless like a multi-file book. Each track's
 * URL names the track itself, `/api/media/jellyfin:<track>/tracks/0`, and streams its own file
 * through the range proxy, never transcoded: a format the clients do not play is refused.
 */
import { type PlaybackPlan, type PlaybackTrack } from '@auralis/schema';
import { type JellyfinClient } from '../adapters/jellyfin/client.js';
import { type PlayableItem } from '../adapters/jellyfin/schemas.js';
import type { SUPPORTED_MIME_TYPES } from '../adapters/audiobookshelf/schemas.js';
import { Refusal } from '../route.js';

type Mime = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Jellyfin's container names for the formats the clients play: the mime type each plays as, and
 * the audio codecs (Jellyfin's names) the clients play inside it. ALAC in an m4a, say, is not.
 */
const FORMAT_OF_CONTAINER: Readonly<Record<string, { mime: Mime; codecs: readonly string[] }>> = {
  flac: { mime: 'audio/flac', codecs: ['flac'] },
  mp3: { mime: 'audio/mpeg', codecs: ['mp3'] },
  m4a: { mime: 'audio/mp4', codecs: ['aac'] },
  m4b: { mime: 'audio/mp4', codecs: ['aac'] },
  mp4: { mime: 'audio/mp4', codecs: ['aac'] },
  mov: { mime: 'audio/mp4', codecs: ['aac'] },
  aac: { mime: 'audio/aac', codecs: ['aac'] },
  ogg: { mime: 'audio/ogg', codecs: ['vorbis', 'opus'] },
  oga: { mime: 'audio/ogg', codecs: ['vorbis', 'opus'] },
  opus: { mime: 'audio/ogg', codecs: ['opus'] },
  webm: { mime: 'audio/webm', codecs: ['opus', 'vorbis'] },
  webma: { mime: 'audio/webm', codecs: ['opus', 'vorbis'] },
};

/**
 * The mime type a track's file plays as, or null when the clients do not play it: its container
 * and its audio stream's codec must both be ones they play. An unnamed codec is not played.
 */
function mimeOf(item: Pick<PlayableItem, 'Container' | 'MediaStreams'>): Mime | null {
  const codec = item.MediaStreams?.find((s) => s.Type === 'Audio')?.Codec?.toLowerCase();
  if (codec === undefined) return null;
  for (const name of (item.Container ?? '').toLowerCase().split(',')) {
    const format = FORMAT_OF_CONTAINER[name.trim()];
    if (format?.codecs.includes(codec)) return format.mime;
  }
  return null;
}

/** The URL a Jellyfin track plays from, whichever plan it is in. */
export const jellyfinTrackUrl = (trackId: string) => `/api/media/jellyfin:${trackId}/tracks/0`;

/** Tracks in disc, then track order; a missing disc is the first, a missing number goes last. */
function inAlbumOrder(tracks: PlayableItem[]): PlayableItem[] {
  const disc = (t: PlayableItem) => t.ParentIndexNumber ?? 1;
  const number = (t: PlayableItem) => t.IndexNumber ?? Number.POSITIVE_INFINITY;
  return [...tracks].sort((a, b) => disc(a) - disc(b) || number(a) - number(b));
}

/**
 * How to play a track or an album, short of the play it reports to, or a refusal: 404 for what is
 * not music or an album with no tracks, 422 `unsupported_format` for a file the clients do not play.
 */
export async function planJellyfin(
  jellyfin: JellyfinClient,
  item: PlayableItem,
): Promise<Omit<PlaybackPlan, 'progressTarget'>> {
  if (item.Type !== 'Audio' && item.Type !== 'MusicAlbum') throw new Refusal(404, 'not_found');
  const files =
    item.Type === 'Audio' ? [item] : inAlbumOrder(await jellyfin.getAlbumPlayables(item.Id));

  const tracks: PlaybackTrack[] = [];
  let offset = 0;
  for (const file of files) {
    const ticks = file.RunTimeTicks;
    if (file.Type !== 'Audio' || ticks === null || ticks === undefined) {
      throw new Refusal(502, 'upstream_failed');
    }
    const mime = mimeOf(file);
    if (mime === null) throw new Refusal(422, 'unsupported_format');
    const duration = ticks / 1e7;
    tracks.push({ url: jellyfinTrackUrl(file.Id), mime, duration, offset });
    offset += duration;
  }
  if (tracks.length === 0) throw new Refusal(404, 'not_found');
  return { tracks, chapters: [], startAt: 0 };
}
