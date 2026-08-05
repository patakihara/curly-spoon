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
// Favourites — `Jellyfin.Api/Controllers/UserLibraryController.cs`
// (`MarkFavoriteItem`/`UnmarkFavoriteItem`), `MediaBrowser.Model/Dto/UserItemDataDto.cs`.
// Verified directly against `jellyfin/jellyfin` `master` (raw source, not recollection),
// 2026-08-05: the *current* (non-`[Obsolete]`) routes are `POST /UserFavoriteItems/{itemId}`
// and `DELETE /UserFavoriteItems/{itemId}`, each taking an *optional* `userId` query
// parameter resolved via `RequestHelpers.GetUserId(User, userId)` — when omitted, it falls
// back to the id embedded in the caller's own auth token
// (`Jellyfin.Api/Helpers/RequestHelpers.cs`'s `GetUserId`). So no explicit Jellyfin user id
// needs to be threaded through this client at all; the token alone is enough, exactly like
// every other authenticated call this client makes. The `Users/{userId}/FavoriteItems/
// {itemId}` route a first-draft version of this spec assumed exists too, but only as an
// `[Obsolete("Kept for backwards compatibility")]` alias of the same handler — the
// non-legacy path is used here.
//
// Both routes return a `UserItemDataDto` (`MarkFavorite`'s private helper calls
// `_userDataRepository.GetUserDataDto(item, user)` after flipping `IsFavorite`), whose
// `IsFavorite` is a non-nullable C# `bool` — always serialized, in principle. Kept
// `.optional()` here anyway, deliberately more lenient than the field's C# nullability
// would strictly require (contrast `rawLyricDtoSchema`'s required fields, which mirror
// their non-nullable C# types exactly): a malformed/omitted field on this response should
// degrade to "not favourited" rather than fail the whole toggle with a schema-mismatch
// error, and `normalize.ts` is where that default is made visible either way.
// ---------------------------------------------------------------------------

/** `MediaBrowser.Model/Dto/UserItemDataDto.cs` — the body of both
 * `POST /UserFavoriteItems/{itemId}` and `DELETE /UserFavoriteItems/{itemId}`. Only
 * `IsFavorite` is modeled; the DTO's other fields (`Rating`, `PlaybackPositionTicks`,
 * `PlayCount`, ...) are progress/rating data this package doesn't otherwise track. */
export const rawUserItemDataDtoSchema = z
  .object({
    IsFavorite: z.boolean().nullable().optional(),
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
    /** `MediaBrowser.Model/Dto/BaseItemDto.cs`'s `UserData` property — per-user playback/
     * favourite state for this item. Populated by `DtoService.AttachUserData` (source name
     * inferred from the batch-fetch call sites; the field itself is confirmed directly)
     * whenever the request resolves to an authenticated user *and* `DtoOptions.EnableUserData`
     * is true — true by default (`DtoOptions`'s parameterless constructor delegates to
     * `DtoOptions(true)`, which sets it), overridable only by an explicit `enableUserData`
     * query flag this client never sends. Every request this client makes carries a token,
     * so `user` always resolves (`RequestHelpers.GetUserId` falls back to the token's own
     * user id — see the favourites section above) and this field is expected to be present
     * on ordinary `/Items` responses. Still optional/nullable here, matching this schema's
     * general leniency: some server-side paths (a minified shelf/personalized response, an
     * older server version) are not guaranteed to populate it, and `normalize.ts` is what
     * turns its absence into a definite `false` rather than an `undefined` a consumer would
     * have to special-case. */
    UserData: rawUserItemDataDtoSchema.nullable().optional(),
    /** `MediaBrowser.Model/Dto/BaseItemDto.cs`'s `PlaylistItemId` — verified directly against
     * that file, 2026-08-05: `public string PlaylistItemId { get; set; }`, and the file opens
     * with `#nullable disable`, so it carries no compiler-enforced non-null guarantee despite
     * the bare `string` type. Populated only on a `/Playlists/{id}/Items` response
     * (`Jellyfin.Api/Controllers/PlaylistsController.cs`'s `GetPlaylistItems` sets
     * `dtos[index].PlaylistItemId = items[index].Item1.ItemId?.ToString("N", ...)` after
     * fetching — never on a plain `/Items` listing), and is a **playlist-entry id, distinct
     * from the item's own `Id`**: `Item1` is the `LinkedChild` row backing this occurrence of
     * the track *in this playlist*, not the track itself, which is exactly what lets the same
     * track appear twice in one playlist and be removed once — see `client.ts`'s
     * `removeFromPlaylist` doc comment. */
    PlaylistItemId: z.string().nullable().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Playlists — `Jellyfin.Api/Controllers/PlaylistsController.cs`. Verified directly against
// that controller (not memory), 2026-08-05:
//
// - **No dedicated "list my playlists" route exists.** Playlists are library items like any
//   other (`Jellyfin.Data/Enums/BaseItemKind.cs` has a `Playlist` member), so they're listed
//   through the exact same `GET /Items?includeItemTypes=Playlist&recursive=true` every other
//   item kind in this client already uses — `client.ts`'s `getPlaylists` reuses `queryItems`
//   rather than adding a bespoke method.
// - **Create**: `POST /Playlists`, body `CreatePlaylistDto` (`Jellyfin.Api/Models/
//   PlaylistDtos/CreatePlaylistDto.cs`) — `Name` (required), `Ids` (item ids to seed the
//   playlist with), `MediaType`, `UserId` (resolved from the caller's token when omitted,
//   same `RequestHelpers.GetUserId` pattern as favourites). The controller also accepts a
//   `[FromQuery, ParameterObsolete]` form of the same fields for backwards compatibility —
//   not used here; the body is the current, non-obsolete path. Returns
//   `PlaylistCreationResult` (`MediaBrowser.Model/Playlists/PlaylistCreationResult.cs`),
//   just `{ Id: string }`.
// - **Get items, in playlist order**: `GET /Playlists/{playlistId}/Items`, returning the same
//   `QueryResult<BaseItemDto>` wrapper as `/Items` (`rawQueryResultSchema` covers it). Order
//   is genuinely playlist order, not re-sorted: the handler builds the response from
//   `playlist.GetManageableItems()`, which is `MediaBrowser.Controller/Playlists/Playlist.cs`'s
//   `GetLinkedChildrenInfos()` — the playlist's own stored, ordered `LinkedChildren` list —
//   never routed through `ItemsController`'s `sortBy`/`sortOrder` machinery the way a library
//   browse is. This is the field `normalize.ts`'s `normalizePlaylistItem` trusts as given.
// - **Add items**: `POST /Playlists/{playlistId}/Items?ids=<comma-delimited-guids>`, no body,
//   204 on success — item ids, not entry ids (adding doesn't need to disambiguate an
//   occurrence that doesn't exist yet).
// - **Remove items**: `DELETE /Playlists/{playlistId}/Items?entryIds=<comma-delimited>`, 204
//   on success. `entryIds` takes the **`PlaylistItemId` values from a prior
//   `GET .../Items` response, not track ids** — confirmed directly in
//   `RemoveItemFromPlaylist`'s signature (`string[] entryIds`, forwarded verbatim to
//   `IPlaylistManager.RemoveItemFromPlaylistAsync(string playlistId, IEnumerable<string>
//   entryIds)`) and in `GetPlaylistItems`'s field name for the same value. This is the
//   surprise the wave spec called out: removal keys on the per-entry id, not the item id, so
//   a track duplicated in one playlist can be removed once without touching its other
//   occurrence.
// - **No `[Obsolete]` alias found on any of the routes this client uses** — unlike
//   favourites' `Users/{userId}/FavoriteItems/{itemId}`, `PlaylistsController.cs` has no
//   commented-out or `[Obsolete]`-marked sibling for `POST /Playlists`, `GET .../Items`,
//   `POST .../Items` or `DELETE .../Items`. The only `[ParameterObsolete]` markers are on
//   `CreatePlaylist`'s query-parameter overload, avoided here by using the body instead.
// ---------------------------------------------------------------------------

/** `MediaBrowser.Model/Playlists/PlaylistCreationResult.cs` — the body of `POST /Playlists`.
 * `Id` is a non-nullable `string` constructor parameter in the C# model (no `#nullable
 * disable` on this file), so required here too, matching this package's convention of
 * requiring fields the source itself guarantees. */
export const rawPlaylistCreationResultSchema = z
  .object({
    Id: z.string(),
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

// ---------------------------------------------------------------------------
// Lyrics — `Jellyfin.Api/Controllers/LyricsController.cs` (`GetLyrics`),
// `MediaBrowser.Model/Lyrics/{LyricDto,LyricLine,LyricMetadata}.cs`. Re-verified
// 2026-08-05 against `jellyfin/jellyfin` `master` directly (raw source files, not
// recollection) for this wave — see `client.ts`'s `getLyrics` doc comment for the
// controller-behaviour findings (404 semantics, which parser sets `Start`, why
// `IsSynced` can't be trusted) this pass turned up.
// ---------------------------------------------------------------------------

/** `MediaBrowser.Model/Lyrics/LyricMetadata.cs` — the standard LRC header
 * fields. Every field is nullable in the C# model itself (not just
 * optionally serialized), so all are optional here too. `Length`/`Offset`
 * are ticks, per that file's own doc comments ("length of the song in
 * ticks", "lyric offset compared to audio in ticks") — the same unit as
 * `BaseItemDto.RunTimeTicks`, converted to seconds in `normalize.ts`. */
export const rawLyricMetadataSchema = z
  .object({
    Artist: z.string().nullable().optional(),
    Album: z.string().nullable().optional(),
    Title: z.string().nullable().optional(),
    Author: z.string().nullable().optional(),
    /** Who the LRC file itself was created by — distinct from `Author`
     * (the lyric data's author) and `Creator` (the *software* used). */
    By: z.string().nullable().optional(),
    Length: z.number().nullable().optional(),
    Offset: z.number().nullable().optional(),
    Creator: z.string().nullable().optional(),
    Version: z.string().nullable().optional(),
    /** Present in the C# model, but confirmed **never populated** by the code
     * path behind `GET /Audio/{id}/Lyrics`: `LyricManager.GetLyricsAsync`
     * returns whatever `ILyricParser.ParseLyrics` produces directly, and
     * neither shipped parser (`LrcLyricParser`/`TxtLyricParser`) ever sets
     * `Metadata.IsSynced` — it is only ever assigned on the separate remote
     * lyric-*search* path (`LyricManager.InternalSearchProviderAsync`, not
     * this endpoint). So this field is always `null`/absent here; do not use
     * it as a sync signal — see `normalize.ts`'s `normalizeLyrics` for the
     * signal actually used (whether every line carries a `Start`). */
    IsSynced: z.boolean().nullable().optional(),
  })
  .passthrough();

/** `MediaBrowser.Model/Lyrics/LyricLine.cs`. `Text` is a required constructor
 * parameter (`LyricLine(string text, long? start = null, ...)`) with a
 * non-nullable `string` getter — unlike `rawBaseItemDtoSchema`'s fields, this
 * is **not** optional/nullable here; both real parsers that can produce a
 * `GET /Audio/{id}/Lyrics` response (`MediaBrowser.Providers/Lyric/
 * {LrcLyricParser,TxtLyricParser}.cs`) always pass a string (possibly empty
 * after `.Trim()`), never null. Corrected from an earlier, never-verified
 * draft that had this as `.nullable().optional()`.
 *
 * `Start` is ticks ("start time in ticks" per that file's own doc comment);
 * `null`/absent for a plain unsynced line — confirmed directly:
 * `TxtLyricParser.ParseLyrics` constructs every `LyricLine` with no `start`
 * argument at all (stays `null`), while `LrcLyricParser.ParseLyrics` always
 * passes a computed `lyricStartTicks` for every line and pre-sorts its output
 * by that same start time (`sortedLyricData = lyricData.Lyrics.OrderBy(x =>
 * x.StartTime)`). The two parsers are mutually exclusive per response — a
 * `LyricDto` is never a mix of synced and unsynced lines — which is why
 * `normalize.ts`'s `normalizeLyrics` derives "synced" from whether every line
 * has a `Start`, not from `LyricMetadata.IsSynced` (see that schema's own
 * comment for why the metadata field can't be trusted).
 *
 * `Cues` (`LyricLineCue[]`, word/phrase-level alignment) is deliberately not
 * modeled beyond `.passthrough()`: nothing in this codebase reads word-level
 * timing yet, and passthrough keeps the raw field intact on the parsed object
 * for a future caller without this schema having to guess at
 * `LyricLineCue`'s exact shape. */
export const rawLyricLineSchema = z
  .object({
    Text: z.string(),
    Start: z.number().nullable().optional(),
  })
  .passthrough();

/** `MediaBrowser.Model/Lyrics/LyricDto.cs` — the body of
 * `GET /Audio/{itemId}/Lyrics`. Both fields are non-nullable in the C#
 * model (default-initialized to `new()`/`[]`), so — unlike
 * `rawBaseItemDtoSchema`'s deliberate leniency — they're required here:
 * this is a dedicated, single-purpose response shape, not `BaseItemDto`'s
 * shared-across-every-item-kind case that motivates optionality elsewhere
 * in this file. Same reasoning as `rawAuthenticationResultSchema` requiring
 * `AccessToken`. A 404 (no lyrics for this track) never reaches this schema
 * at all — the client's `getLyrics` short-circuits on that status before
 * any body is parsed; see `client.ts`. */
export const rawLyricDtoSchema = z
  .object({
    Metadata: rawLyricMetadataSchema,
    Lyrics: z.array(rawLyricLineSchema),
  })
  .passthrough();
