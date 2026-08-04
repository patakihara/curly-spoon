/**
 * Zod schemas for Jellyfin's *raw* wire shapes.
 *
 * Field names are verified against the real Jellyfin server source
 * (`jellyfin/jellyfin` on GitHub, `master` branch, fetched 2026-08-04), not
 * assumed from memory — see the doc comment on each schema for the specific
 * file it was checked against.
 *
 * `BaseItemDto` (`MediaBrowser.Model/Dto/BaseItemDto.cs`) is Jellyfin's one
 * DTO for every kind of library item — artists, albums, and tracks all come
 * back as the same shape, just with different fields populated depending on
 * `Type` and on which `Fields` the request asked for. That is the reason for
 * being unusually generous with `.optional()`/`.nullable()` here: a field
 * that is always present on a track (`RunTimeTicks`) is meaningless — and, in
 * practice, sometimes entirely absent from the payload — on an artist. Being
 * strict here would mean an artist whose scan hasn't populated `Overview` yet
 * fails the *entire* library browse with a schema-mismatch error. The
 * defaulting these gaps need lives in `normalize.ts`, not here, so it stays
 * visible and testable rather than scattered through `.optional()` fallbacks
 * a UI component would otherwise have to reinvent per-field.
 *
 * `.passthrough()` everywhere: Jellyfin's `BaseItemDto` alone carries 100+
 * fields, most of which this package never reads. Rejecting on unknown
 * fields would make the client brittle against upstream additions; ignoring
 * fields we don't use is right.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

/** `MediaBrowser.Model/Dto/NameGuidPair.cs` — `{ Name: string, Id: Guid }`.
 * Both kept optional here even though the C# type has no nullable
 * annotation: this is the shape used for `ArtistItems`/`AlbumArtists`
 * entries, and a name-only or id-only pair we can still make use of is
 * strictly better than losing the whole array to one malformed entry. */
export const rawNameGuidPairSchema = z
  .object({
    Id: z.string().optional(),
    Name: z.string().nullable().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Auth — `Jellyfin.Api/Controllers/UserController.cs` (`AuthenticateByName`),
// `MediaBrowser.Model/Dto/UserDto.cs`, `MediaBrowser.Controller.Authentication
// .AuthenticationResult`
// ---------------------------------------------------------------------------

export const rawUserDtoSchema = z
  .object({
    Id: z.string(),
    Name: z.string().nullable().optional(),
    ServerId: z.string().nullable().optional(),
    PrimaryImageTag: z.string().nullable().optional(),
  })
  .passthrough();

export const rawAuthenticationResultSchema = z
  .object({
    User: rawUserDtoSchema,
    AccessToken: z.string(),
    ServerId: z.string().nullable().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Library items — `Jellyfin.Api/Controllers/ItemsController.cs` (`GetItems`),
// `MediaBrowser.Model/Dto/BaseItemDto.cs`
// ---------------------------------------------------------------------------

/** Covers `MusicArtist`, `MusicAlbum` and `Audio` items alike — see the file
 * doc comment for why the fields beyond `Id` are all optional/nullable. */
export const rawBaseItemDtoSchema = z
  .object({
    Id: z.string(),
    Name: z.string().nullable().optional(),
    /** `BaseItemKind` enum, serialized as its string name (e.g. `"Audio"`,
     * `"MusicAlbum"`, `"MusicArtist"`) since `JsonDefaults` registers a
     * `JsonStringEnumConverter`. Left as a bare string, not a zod enum: this
     * schema is shared across item kinds we don't otherwise model, and
     * rejecting an unrecognised kind here would break browsing when Jellyfin
     * adds a new one. */
    Type: z.string().nullable().optional(),
    SortName: z.string().nullable().optional(),
    Overview: z.string().nullable().optional(),
    ProductionYear: z.number().nullable().optional(),
    /** .NET `TimeSpan` ticks (100ns each) — see `normalize.ts`'s
     * `TICKS_PER_SECOND` for the conversion and its own source citation. */
    RunTimeTicks: z.number().nullable().optional(),
    /** Track number within its album/disc. */
    IndexNumber: z.number().nullable().optional(),
    /** Disc number within its album. */
    ParentIndexNumber: z.number().nullable().optional(),
    Artists: z.array(z.string()).nullable().optional(),
    ArtistItems: z.array(rawNameGuidPairSchema).nullable().optional(),
    Album: z.string().nullable().optional(),
    AlbumId: z.string().nullable().optional(),
    AlbumArtist: z.string().nullable().optional(),
    AlbumArtists: z.array(rawNameGuidPairSchema).nullable().optional(),
    /** Keyed by `ImageType` string (`"Primary"`, `"Backdrop"`, ...); the
     * value is the cache-busting tag `buildImageUrl`'s `tag` option wants. */
    ImageTags: z.record(z.string(), z.string()).nullable().optional(),
    /** Best-effort child count (albums under an artist, tracks under an
     * album) — not reliably populated for `MusicArtist` since artists are a
     * virtual grouping rather than a real folder in Jellyfin's library tree.
     * Treated as advisory in `normalize.ts`, never load-bearing. */
    ChildCount: z.number().nullable().optional(),
    Genres: z.array(z.string()).nullable().optional(),
    CommunityRating: z.number().nullable().optional(),
  })
  .passthrough();

/** `QueryResult<BaseItemDto>` — the wrapper every `/Items`-shaped listing
 * returns, per `ItemsController.GetItems`'s
 * `new QueryResult<BaseItemDto>(startIndex, totalRecordCount, items)`. Both
 * `Items` and `TotalRecordCount` are defensively optional despite always
 * being set by that constructor: an empty result set is exactly the kind of
 * response worth tolerating rather than failing on, should a future
 * self-hosted fork ever omit one under some edge case we haven't seen. */
export const rawQueryResultSchema = z
  .object({
    Items: z.array(rawBaseItemDtoSchema).optional(),
    TotalRecordCount: z.number().optional(),
    StartIndex: z.number().optional(),
  })
  .passthrough();
