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
