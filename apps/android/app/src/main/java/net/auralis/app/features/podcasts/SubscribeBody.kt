package net.auralis.app.features.podcasts

import net.auralis.app.data.model.Library
import net.auralis.app.data.model.PodcastDirectoryResult
import net.auralis.app.data.model.PodcastFeedPreview
import net.auralis.app.data.model.PodcastSubscribeMetadata
import net.auralis.app.data.model.SubscribePodcastBody

/**
 * Builds the `POST /podcasts` body from a previewed feed, following Audiobookshelf's subscribe
 * contract (`subscribePodcastBodySchema`, `apps/server/src/routes/schemas.ts`). Mirrors
 * `apps/web/src/features/podcasts/subscribeMetadata.ts`'s `buildSubscribeBody` field-for-field.
 *
 * Total, not partial: a target library with no folder, or a feed with no usable title, degrades
 * to `null` rather than throwing — `folderId`/`folderPath`/`title` are all required by the
 * schema and there's nothing sane to substitute for a missing folder, while an empty title
 * would otherwise 400 confusingly deep inside the subscribe call.
 *
 * [directoryResult] is nullable because a feed can be previewed two ways: picked from a
 * `GET /podcasts/search` result (carries `itunesId`/`pageUrl`, which the feed preview itself
 * never has), or a raw RSS URL pasted directly (no directory result at all). Fields present on
 * both prefer the feed preview, since it reflects the feed as it exists right now rather than
 * whatever the directory had indexed.
 */
fun buildSubscribeBody(
    preview: PodcastFeedPreview,
    rssFeed: String,
    library: Library,
    directoryResult: PodcastDirectoryResult? = null,
    autoDownloadEpisodes: Boolean? = null,
): SubscribePodcastBody? {
    val folder = library.folders.firstOrNull() ?: return null

    val title = (preview.title ?: directoryResult?.title ?: "").trim()
    if (title.isEmpty()) return null

    val genres = preview.categories.ifEmpty { directoryResult?.genres ?: emptyList() }

    return SubscribePodcastBody(
        libraryId = library.id,
        folderId = folder.id,
        folderPath = folder.path,
        rssFeed = rssFeed,
        title = title,
        metadata =
            PodcastSubscribeMetadata(
                author = preview.author ?: directoryResult?.artistName,
                description = preview.description ?: directoryResult?.description,
                releaseDate = directoryResult?.releaseDate ?: preview.pubDate,
                imageUrl = preview.image ?: directoryResult?.cover,
                genres = genres,
                language = preview.language,
                explicit = preview.explicit,
                itunesPageUrl = directoryResult?.pageUrl,
                itunesId = directoryResult?.itunesId,
            ),
        autoDownloadEpisodes = autoDownloadEpisodes,
    )
}
