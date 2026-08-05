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
