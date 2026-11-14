/**
 * Which Spotify playlist a pasted link names. Taken: `https://open.spotify.com/playlist/<id>`, with
 * an `intl-xx` segment and any query or fragment, and `spotify:playlist:<id>`; the id is 22 base62
 * characters. Anything else names none. Only the id is ever sent to Spotify.
 */

/** What a route answers, with 400, for a link that names no Spotify playlist. */
export const NOT_A_SPOTIFY_PLAYLIST = 'not_a_spotify_playlist';

const ID = '([0-9A-Za-z]{22})';
const WEB = new RegExp(
  `^https?://open\\.spotify\\.com/(?:intl-[a-z]{2}(?:-[a-z]{2})?/)?playlist/${ID}/?(?:[?#].*)?$`,
  'i',
);
const URI = new RegExp(`^spotify:playlist:${ID}$`);

/** The playlist's id, or null when `text` is not a Spotify playlist link. */
export function spotifyPlaylistId(text: string): string | null {
  const trimmed = text.trim();
  const found = URI.exec(trimmed) ?? WEB.exec(trimmed);
  return found?.[1] ?? null;
}
