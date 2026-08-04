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
  rawNameGuidPairSchema,
  rawUserDtoSchema,
} from './schemas/raw.js';
import type { Album, Artist, LoginResult, Track, UserProfile } from './domain.js';

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

export function normalizeArtist(raw: RawItem): Artist {
  return {
    id: raw.Id,
    name: raw.Name ?? '(unknown artist)',
    overview: raw.Overview ?? null,
    imageTag: primaryImageTag(raw),
    albumCount: raw.ChildCount ?? null,
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
