/**
 * Zod schemas for the Jellyfin calls Auralis makes, cut to what these calls parse. Field names are PascalCase: requests send a bare
 * `Accept: application/json`, whose serializer (`Jellyfin.Extensions/Json/JsonDefaults.cs`) sets
 * no naming policy; camelCase comes only with `profile="CamelCase"`.
 *
 * `BaseItemDto` (`MediaBrowser.Model/Dto/BaseItemDto.cs`) is one DTO for every kind of item,
 * with different fields filled per `Type`, so everything but `Id` is optional, and
 * `.passthrough()` keeps its 100-odd other fields.
 */
import { z } from 'zod';

/** `GET /System/Info/Public`, unauthenticated. */
export const publicSystemInfoSchema = z.object({ Version: z.string() }).passthrough();

export const baseItemDtoSchema = z
  .object({
    Id: z.string(),
    Name: z.string().nullable().optional(),
    Type: z.string().nullable().optional(),
    CollectionType: z.string().nullable().optional(),
  })
  .passthrough();

/** `QueryResult<BaseItemDto>`: `GET /Library/MediaFolders` and `GET /Items`. */
export const baseItemQueryResultSchema = z
  .object({ Items: z.array(baseItemDtoSchema), TotalRecordCount: z.number().optional() })
  .passthrough();

/** `GET /Users`: only what finding an administrator reads. */
export const userListSchema = z.array(
  z
    .object({ Id: z.string(), Policy: z.object({ IsAdministrator: z.boolean() }).passthrough() })
    .passthrough(),
);

const namedIdSchema = z.object({ Id: z.string(), Name: z.string().nullable().optional() });

/**
 * An album or a track as the index reads it, asked for with `Fields=ProviderIds,Genres,Etag`.
 * `Etag` is filled for both (recorded); `DateLastSaved` is not returned even when asked for.
 * `RunTimeTicks` are 100 ns.
 */
export const indexItemSchema = z.object({
  Id: z.string(),
  Name: z.string().nullable().optional(),
  Type: z.string(),
  Etag: z.string().nullable().optional(),
  ParentId: z.string().nullable().optional(),
  AlbumId: z.string().nullable().optional(),
  IndexNumber: z.number().int().nullable().optional(),
  ParentIndexNumber: z.number().int().nullable().optional(),
  RunTimeTicks: z.number().nullable().optional(),
  ProductionYear: z.number().int().nullable().optional(),
  PremiereDate: z.string().nullable().optional(),
  Genres: z.array(z.string()).nullable().optional(),
  ProviderIds: z.record(z.string().nullable()).nullable().optional(),
  ArtistItems: z.array(namedIdSchema).nullable().optional(),
  AlbumArtists: z.array(namedIdSchema).nullable().optional(),
  /** The item's images by type; `Primary` is its cover (recorded). */
  ImageTags: z.record(z.string()).nullable().optional(),
  /** Whether Jellyfin holds a lyrics file for a track: a default field on Audio (checked live). */
  HasLyrics: z.boolean().optional(),
});
export type IndexItem = z.infer<typeof indexItemSchema>;

/** `GET /Items` for albums or tracks, with the index's fields. */
export const indexQueryResultSchema = z.object({
  Items: z.array(indexItemSchema),
  TotalRecordCount: z.number().int().nonnegative(),
});
export type IndexQueryResult = z.infer<typeof indexQueryResultSchema>;

/**
 * A track or an album as playing reads it, from `GET /Items/{id}` or an album's `GET /Items`
 * with the person's own token, so Jellyfin answers only what they can see. `Container` is the
 * file's format (`flac`); Jellyfin may list several names for one format (`mov,mp4,m4a`).
 * `RunTimeTicks` are 100 ns.
 */
export const playableItemSchema = z.object({
  Id: z.string(),
  Type: z.string(),
  /** What plays and who made it, as a plan names it (recorded). */
  Name: z.string().nullable().optional(),
  Artists: z.array(z.string()).nullable().optional(),
  AlbumArtist: z.string().nullable().optional(),
  /** A track's album. */
  AlbumId: z.string().nullable().optional(),
  Container: z.string().nullable().optional(),
  /** The file's streams; the `Audio` one's `Codec` says what the container holds. */
  MediaStreams: z
    .array(z.object({ Type: z.string(), Codec: z.string().nullable().optional() }))
    .nullable()
    .optional(),
  RunTimeTicks: z.number().nonnegative().nullable().optional(),
  IndexNumber: z.number().int().nullable().optional(),
  ParentIndexNumber: z.number().int().nullable().optional(),
});
export type PlayableItem = z.infer<typeof playableItemSchema>;

/** An album's tracks, as playing reads them. */
export const playableQueryResultSchema = z.object({ Items: z.array(playableItemSchema) });

/**
 * A track's lyrics: `GET /Audio/{id}/Lyrics` (Jellyfin 10.11, checked live). Each line's `Start`
 * is in 100 ns ticks; a synced file gives every line one, a plain file none. A line with empty
 * `Text` is an instrumental break. `Metadata` and each line's `Cues` are not read.
 */
export const jellyfinLyricsSchema = z.object({
  Lyrics: z.array(z.object({ Text: z.string(), Start: z.number().int().nonnegative().nullish() })),
});
export type JellyfinLyrics = z.infer<typeof jellyfinLyricsSchema>;

/** `POST /Sessions/Playing`, `/Progress` and `/Stopped` answer 204 with no body. */
export const noContentSchema = z.undefined();

/**
 * `UserItemDataDto`: one person's state on one item, from `GET /UserItems/{id}/UserData`.
 * `PlaybackPositionTicks` is the resume point, in 100 ns ticks; `LastPlayedDate` is absent until
 * the item is first played.
 */
export const userItemDataSchema = z
  .object({
    PlaybackPositionTicks: z.number(),
    PlayCount: z.number(),
    IsFavorite: z.boolean(),
    Played: z.boolean(),
    LastPlayedDate: z.string().nullable().optional(),
    ItemId: z.string(),
  })
  .passthrough();
export type UserItemData = z.infer<typeof userItemDataSchema>;
