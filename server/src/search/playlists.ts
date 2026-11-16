/**
 * Search's playlist row: a query that is a Spotify playlist link answers that playlist's name, how
 * many entries it holds, its cover and the link `POST /lists/import` takes. It costs two Spotify
 * calls (the embed page and the first page of the order), kept 10 minutes by playlist, so a second
 * search of it asks nothing. It waits for Spotify only up to `PLAYLIST_LIMIT_MS`; whatever goes
 * wrong there, the search answers with no row. A failure is not kept: the next search asks again.
 */
import type { SearchPlaylist } from '@auralis/schema';
import type { SpotifyCover } from '../adapters/spotify/client.js';
import { within } from '../requests/albums/catalogue.js';
import { spotifyArtUrl } from '../routes/art.js';

/** How long a playlist's row is kept. */
export const PLAYLIST_KEPT_MS = 10 * 60_000;
/** The longest a search waits for Spotify; a Spotify call waits 1 s behind the one before. */
const PLAYLIST_LIMIT_MS = 5_000;

/** What Search asks Spotify: a playlist's summary, and a cover by its image id. */
export interface SpotifyPlaylistSource {
  playlistSummary(id: string): Promise<{ name: string; cover: string | null; length: number }>;
  cover(imageId: string, signal?: AbortSignal): Promise<SpotifyCover | null>;
}

export interface PlaylistRows {
  /** The playlist's row, or none when Spotify does not answer in time. */
  row(id: string, gone: AbortSignal): Promise<SearchPlaylist[]>;
}

export function playlistRows(deps: {
  spotify: SpotifyPlaylistSource;
  now: () => number;
  log: { warn(details: object, message: string): void };
  limitMs?: number;
}): PlaylistRows {
  const { spotify, now, log } = deps;
  const kept = new Map<string, { at: number; found: Promise<SearchPlaylist> }>();

  const ask = (id: string) => {
    const found = spotify.playlistSummary(id).then((summary): SearchPlaylist => ({
      from: `https://open.spotify.com/playlist/${id}`,
      name: summary.name,
      count: summary.length,
      art: spotifyArtUrl(summary.cover),
    }));
    found.catch(() => kept.delete(id));
    kept.set(id, { at: now(), found });
    return found;
  };

  return {
    async row(id, gone) {
      for (const [key, entry] of kept) {
        if (now() - entry.at >= PLAYLIST_KEPT_MS) kept.delete(key);
      }
      const found = kept.get(id)?.found ?? ask(id);
      try {
        const row = await within<SearchPlaylist | null>(
          found,
          deps.limitMs ?? PLAYLIST_LIMIT_MS,
          gone,
          null,
        );
        return row === null ? [] : [row];
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'no playlist row');
        return [];
      }
    },
  };
}
