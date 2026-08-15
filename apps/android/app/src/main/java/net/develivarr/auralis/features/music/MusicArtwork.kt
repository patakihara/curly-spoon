package net.develivarr.auralis.features.music

/**
 * The BFF-proxied Jellyfin artwork URL for one item — mirrors
 * `apps/web/src/api/client.ts`'s `jellyfinArtworkUrl` exactly: no `width`/resize query
 * parameter, because `GET /jellyfin/items/:itemId/artwork` (`apps/server/src/routes/
 * jellyfin.ts`) has no resize option, unlike Audiobookshelf's own `/cover` route (see
 * `PodcastsViewModel.toListEntry`, which does pass `?width=`, for the contrast). The token
 * that makes this URL work lives server-side, behind the session cookie every `ApiClient`
 * request already carries — never in the URL itself, same reasoning as the web client's own
 * doc comment on `jellyfinArtworkUrl`.
 *
 * `null` when [baseUrl] hasn't been read from
 * [net.develivarr.auralis.data.settings.ServerConfigRepository] yet, so callers degrade to no image
 * rather than requesting a broken one.
 */
fun jellyfinItemArtworkUrl(
    baseUrl: String?,
    itemId: String,
): String? = baseUrl?.let { "${it.trimEnd('/')}/api/v1/jellyfin/items/$itemId/artwork" }
