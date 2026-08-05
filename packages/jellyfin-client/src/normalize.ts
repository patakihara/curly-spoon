/**
 * Mapping from Jellyfin's raw wire shapes (`schemas/raw.ts`) onto the domain
 * model (`domain.ts`). Every fallback a field needs lives here, not in
 * `schemas/raw.ts` or in a UI component — see `schemas/raw.ts`'s file doc
 * comment for why `BaseItemDto`'s optionality has to be handled at this
 * layer rather than assumed away.
 */

import type { z } from 'zod';
import type {
  rawAuthenticationResultSchema,
  rawBaseItemDtoSchema,
  rawLyricDtoSchema,
  rawNameGuidPairSchema,
  rawUserDtoSchema,
  rawUserItemDataDtoSchema,
} from './schemas/raw.js';
import type { Album, Artist, LoginResult, Lyrics, Track, UserProfile } from './domain.js';

type RawItem = z.infer<typeof rawBaseItemDtoSchema>;
type RawNameGuidPair = z.infer<typeof rawNameGuidPairSchema>;

/** .NET `TimeSpan` ticks: 100ns each, so 10,000,000 ticks = 1 second. This is
 * the standard .NET tick resolution Jellyfin's `RunTimeTicks`/
 * `StartTimeTicks` fields use throughout its API — note that one doc comment
 * in `AudioController.cs` ("1 tick = 10000 ms") appears to be a stale typo
 * against this well-established convention (10,000 ticks = 1 ms is the
 * correct figure, i.e. the reciprocal), so the standard .NET definition is
 * used here rather than that comment. */
const TICKS_PER_SECOND = 10_000_000;

function primaryImageTag(raw: Pick<RawItem, 'ImageTags'>): string | null {
  return raw.ImageTags?.Primary ?? null;
}

/**
 * Reads favourite state off a raw `UserData` fragment (present on a `BaseItemDto`, or the
 * whole body of a mark/unmark-favourite response) and defaults it to a definite `false`
 * when absent — never `undefined`. This is the one place that default is made, per this
 * file's own house rule (see the file doc comment): a `BaseItemDto` whose `UserData` never
 * populated (see `schemas/raw.ts`'s `UserData` field comment for when that can happen) is
 * indistinguishable, to every caller of this package, from an item that was checked and
 * found not-favourited — there is no third "unknown" state to preserve.
 */
export function normalizeFavoriteState(
  raw: z.infer<typeof rawUserItemDataDtoSchema> | null | undefined,
): boolean {
  return raw?.IsFavorite ?? false;
}

export function normalizeArtist(raw: RawItem): Artist {
  return {
    id: raw.Id,
    name: raw.Name ?? '(unknown artist)',
    overview: raw.Overview ?? null,
    imageTag: primaryImageTag(raw),
    albumCount: raw.ChildCount ?? null,
    favorite: normalizeFavoriteState(raw.UserData),
  };
}

/** Prefer `AlbumArtists` (Jellyfin's dedicated album-artist field) over the
 * generic `ArtistItems`, since a various-artists compilation can have
 * `ArtistItems` entries that don't match the album's credited artist. Some
 * libraries/scan states only populate `ArtistItems`, though, so fall back to
 * it rather than lose the artist link entirely. */
function primaryAlbumArtist(raw: RawItem): RawNameGuidPair | null {
  return raw.AlbumArtists?.[0] ?? raw.ArtistItems?.[0] ?? null;
}

export function normalizeAlbum(raw: RawItem): Album {
  const artist = primaryAlbumArtist(raw);
  return {
    id: raw.Id,
    name: raw.Name ?? '(unknown album)',
    sortName: raw.SortName ?? null,
    artistId: artist?.Id ?? null,
    artistName: artist?.Name ?? null,
    productionYear: raw.ProductionYear ?? null,
    overview: raw.Overview ?? null,
    genres: raw.Genres ?? [],
    imageTag: primaryImageTag(raw),
    trackCount: raw.ChildCount ?? null,
    favorite: normalizeFavoriteState(raw.UserData),
  };
}

export function normalizeTrack(raw: RawItem): Track {
  return {
    id: raw.Id,
    name: raw.Name ?? '(unknown track)',
    albumId: raw.AlbumId ?? null,
    albumName: raw.Album ?? null,
    artistNames: raw.Artists ?? [],
    trackNumber: raw.IndexNumber ?? null,
    discNumber: raw.ParentIndexNumber ?? null,
    durationSeconds: raw.RunTimeTicks != null ? raw.RunTimeTicks / TICKS_PER_SECOND : null,
    imageTag: primaryImageTag(raw),
    genres: raw.Genres ?? [],
    favorite: normalizeFavoriteState(raw.UserData),
  };
}

export function normalizeUser(raw: z.infer<typeof rawUserDtoSchema>): UserProfile {
  return {
    id: raw.Id,
    name: raw.Name ?? '(unknown user)',
    serverId: raw.ServerId ?? null,
  };
}

export function normalizeLogin(raw: z.infer<typeof rawAuthenticationResultSchema>): LoginResult {
  return {
    token: raw.AccessToken,
    serverId: raw.ServerId ?? raw.User.ServerId ?? null,
    user: normalizeUser(raw.User),
  };
}

/**
 * Maps a raw `LyricDto` (a *found* response — the 404 "no lyrics" case is handled one
 * layer up, in `client.ts`'s `getLyrics`, and never reaches this function) onto the
 * domain `Lyrics` type.
 *
 * `synced` is derived here, not read off `Metadata.IsSynced` — see `schemas/raw.ts`'s
 * `IsSynced` field comment for the source-verified reason that field is always empty on
 * this endpoint. The derivation instead uses the same signal the two real parsers behind
 * `GET /Audio/{id}/Lyrics` actually differ on: `LrcLyricParser` (synced) sets every
 * line's `Start`; `TxtLyricParser` (unsynced) sets none. A response is never a mix of the
 * two (one parser produces the whole `LyricDto`), so "every line has a start" and "the
 * first line has a start" are equivalent in practice; this checks every line so a
 * malformed or hand-edited upstream response degrades to unsynced (safe: plain text)
 * rather than mis-highlighting from a partial timestamp set.
 *
 * Line order is trusted as given, not re-sorted: `LrcLyricParser` already sorts its
 * output by `StartTime` before returning it, and `TxtLyricParser`'s lines have no
 * timestamp to sort by at all — their only meaningful order is the source file's own
 * line order, which re-sorting would have no correct way to preserve.
 */
export function normalizeLyrics(raw: z.infer<typeof rawLyricDtoSchema>): Lyrics {
  const lines = raw.Lyrics.map((line) => ({
    text: line.Text,
    startSeconds: line.Start != null ? line.Start / TICKS_PER_SECOND : null,
  }));
  return {
    lines,
    synced: lines.length > 0 && lines.every((line) => line.startSeconds != null),
  };
}
