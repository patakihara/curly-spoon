package net.auralis.app.features.podcasts

import net.auralis.app.data.model.PodcastEpisode

/**
 * Episode ordering for the podcast detail screen. Mirrors
 * `apps/web/src/features/podcasts/episodeOrder.ts` exactly, including its default: a podcast
 * listener wants newest first — that's the point of subscribing rather than browsing a static
 * archive — unlike the library's own neutral title-sort default.
 */
enum class EpisodeOrder {
    NEWEST,
    OLDEST,
}

/**
 * `publishedAt == null` (a malformed or missing feed entry) always sorts last, regardless of
 * direction — an undated episode degrades to "least relevant" rather than jumping to the top of
 * either ordering. Matches the web reference's `compareEpisodes`.
 */
private fun compareEpisodes(
    a: PodcastEpisode,
    b: PodcastEpisode,
    order: EpisodeOrder,
): Int {
    val aPublished = a.publishedAt
    val bPublished = b.publishedAt
    if (aPublished == null && bPublished == null) return 0
    if (aPublished == null) return 1
    if (bPublished == null) return -1
    return if (order == EpisodeOrder.NEWEST) bPublished.compareTo(aPublished) else aPublished.compareTo(bPublished)
}

/** Total, non-mutating sort — matches [PodcastEpisode]'s list to sort by, and never crashes on
 * an empty or all-undated list. Explicit `Comparator(...)`, not a bare trailing lambda, so
 * there is no ambiguity at the `sortedWith` call site about which overload is being invoked. */
fun sortEpisodes(
    episodes: List<PodcastEpisode>,
    order: EpisodeOrder = EpisodeOrder.NEWEST,
): List<PodcastEpisode> = episodes.sortedWith(Comparator { a, b -> compareEpisodes(a, b, order) })
