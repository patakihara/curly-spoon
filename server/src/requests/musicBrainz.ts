/**
 * The server's one MusicBrainz client, which kept songs and albums share. MusicBrainz asks for
 * about one call a second, and the client spaces only its own calls, so a client each would let
 * songs and albums together go over.
 */
import type { FetchLike } from '../adapters/http/fetch.js';
import {
  type Clock,
  MusicBrainzClient,
  MUSICBRAINZ_USER_AGENT,
} from '../adapters/musicbrainz/client.js';
import type { AppConfig } from '../config.js';

/** The client, or null with MusicBrainz switched off. */
export function musicBrainzOf(
  config: AppConfig,
  fetch: FetchLike,
  clock?: Clock,
): MusicBrainzClient | null {
  const baseUrl = config.songs.musicBrainzUrl;
  if (baseUrl === null) return null;
  return new MusicBrainzClient({
    baseUrl,
    fetch,
    userAgent: MUSICBRAINZ_USER_AGENT,
    ...(clock === undefined ? {} : { clock }),
  });
}
