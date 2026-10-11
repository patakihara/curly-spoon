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

/** Jellyfin's container names for the formats the clients play, by the mime type they play. */
const MIME_OF_CONTAINER: Readonly<Record<string, (typeof SUPPORTED_MIME_TYPES)[number]>> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  mp4: 'audio/mp4',
  mov: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  webma: 'audio/webm',
};

/** The mime type a track's file plays as, or null when the clients do not play it. */
export function mimeOf(container: string | null | undefined): string | null {
  for (const name of (container ?? '').toLowerCase().split(',')) {
    const mime = MIME_OF_CONTAINER[name.trim()];
    if (mime !== undefined) return mime;
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

/** How to play a track or an album, or a refusal: not music, or a format nothing plays. */
export async function planJellyfin(
  jellyfin: JellyfinClient,
  item: PlayableItem,
): Promise<PlaybackPlan> {
  if (item.Type !== 'Audio' && item.Type !== 'MusicAlbum') throw new Refusal(404, 'not_found');
  const files =
    item.Type === 'Audio' ? [item] : inAlbumOrder(await jellyfin.getAlbumPlayables(item.Id));

  const tracks: PlaybackTrack[] = [];
  let offset = 0;
  for (const file of files) {
    const mime = mimeOf(file.Container);
    const ticks = file.RunTimeTicks;
    if (file.Type !== 'Audio' || mime === null || ticks === null || ticks === undefined) {
      throw new Refusal(502, 'unplayable');
    }
    const duration = ticks / 1e7;
    tracks.push({ url: jellyfinTrackUrl(file.Id), mime, duration, offset });
    offset += duration;
  }
  if (tracks.length === 0) throw new Refusal(502, 'unplayable');
  return { tracks, chapters: [], startAt: 0 };
}
