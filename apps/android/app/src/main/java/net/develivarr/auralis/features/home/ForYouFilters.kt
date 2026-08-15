package net.develivarr.auralis.features.home

/**
 * Pure state logic behind the "For you" screen's content-type filter chips
 * (docs/ROADMAP.md §12d) — the Android mirror of
 * `apps/web/src/features/home/forYouFilters.ts`.
 *
 * - The label is "Audiobooks" here, not "Books" — the reference screenshots
 *   (`docs/research/spec-addendum/01-for-you.jpg` through `04-for-you.jpg`) spell it out that
 *   way, and the roadmap's own wording for this wave quotes the row verbatim as
 *   "All / Music / Podcasts / Audiobooks".
 * - The order (Music, Podcasts, Audiobooks) is taken directly from the screenshots, and differs
 *   from [net.develivarr.auralis.features.search.SearchFilters]' primary row on purpose — same
 *   reasoning web's own doc comment gives for keeping this a separate small file rather than
 *   sharing one across features.
 *
 * "For you" also has no second ("secondary") row at all, unlike Search: a carousel is never
 * narrowed further than "which content type".
 */

data class ForYouFilterOption(val value: String, val label: String)

const val DEFAULT_FOR_YOU_FILTER = "all"

val FOR_YOU_FILTER_OPTIONS =
    listOf(
        ForYouFilterOption("all", "All"),
        ForYouFilterOption("music", "Music"),
        ForYouFilterOption("podcasts", "Podcasts"),
        ForYouFilterOption("books", "Audiobooks"),
    )

/** Single-select toggle: clicking the already-active chip clears the filter back to "all"
 * rather than leaving nothing selected. */
fun selectForYouFilter(
    current: String,
    value: String,
): String = if (current == value) DEFAULT_FOR_YOU_FILTER else value
