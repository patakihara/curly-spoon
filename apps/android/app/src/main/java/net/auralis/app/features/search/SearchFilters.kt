package net.auralis.app.features.search

/**
 * Pure state logic behind [UnifiedSearchScreen]'s two chip rows (`docs/ROADMAP.md` §12b/12b-A1)
 * — a Kotlin mirror of `apps/web/src/features/search/searchFilters.ts`, kept in step with it
 * deliberately rather than re-derived: the two clients show the same rows for the same reason,
 * and drifting the sets apart would be a silent product inconsistency, not a platform
 * difference.
 *
 * Two rows, one dependency direction:
 *
 * - Row 1 ("primary") picks a content type: All / Music / Books / Podcasts.
 * - Row 2 ("secondary") only exists once a specific type is picked, and its options depend on
 *   which one — Music reveals Songs/Albums/Artists, Books reveals Books/Series/Authors.
 *   [secondaryFilterOptions] decides which set applies, and returns `[]` — no second row — for
 *   anything without one, including "all" and any unrecognised value: this module never assumes
 *   its caller only ever passes one of the four known primary values.
 *
 * Podcasts has no second row on purpose. Audiobookshelf's `/search` endpoint returns podcasts as
 * a single flat bucket — whole shows, not episodes — and no other podcast-shaped kind of match
 * exists to filter between. A second row with only "All" and one option meaning the same thing
 * would be a control that does nothing.
 *
 * [selectPrimaryFilter]/[selectSecondaryFilter] back both chip rows as single-select toggles:
 * tapping the already-active chip clears it to "all" rather than leaving nothing selected.
 * Selecting a new primary always resets the secondary to "all" — the previous secondary value
 * may not even exist under the new primary's option set (e.g. "artists" has no equivalent under
 * Books) — and clearing the primary clears the secondary as a consequence, since its value is
 * never read once [visibleKinds] sees `primary == "all"`.
 */

data class FilterOption(val value: String, val label: String)

data class SearchFilterState(val primary: String = "all", val secondary: String = "all")

val DEFAULT_SEARCH_FILTER_STATE = SearchFilterState()

val PRIMARY_FILTER_OPTIONS: List<FilterOption> =
    listOf(
        FilterOption("all", "All"),
        FilterOption("music", "Music"),
        FilterOption("books", "Books"),
        FilterOption("podcasts", "Podcasts"),
    )

private val SECONDARY_FILTER_OPTIONS: Map<String, List<FilterOption>> =
    mapOf(
        "music" to
            listOf(
                FilterOption("all", "All"),
                FilterOption("songs", "Songs"),
                FilterOption("albums", "Albums"),
                FilterOption("artists", "Artists"),
            ),
        "books" to
            listOf(
                FilterOption("all", "All"),
                FilterOption("books", "Books"),
                FilterOption("series", "Series"),
                FilterOption("authors", "Authors"),
            ),
    )

/** Which second-row chips a given first-row selection reveals. `[]` means no second row at all
 * — "all" and "podcasts" both resolve here, along with any value this module doesn't
 * recognise. */
fun secondaryFilterOptions(primary: String): List<FilterOption> = SECONDARY_FILTER_OPTIONS[primary] ?: emptyList()

fun selectPrimaryFilter(
    state: SearchFilterState,
    value: String,
): SearchFilterState {
    val nextPrimary = if (state.primary == value) "all" else value
    return SearchFilterState(primary = nextPrimary, secondary = "all")
}

fun selectSecondaryFilter(
    state: SearchFilterState,
    value: String,
): SearchFilterState {
    val nextSecondary = if (state.secondary == value) "all" else value
    return state.copy(secondary = nextSecondary)
}

/** Which result kinds the current chip selection should render. Every field defaults to
 * `false` so a caller only has to name what it wants visible. */
data class VisibleKinds(
    val books: Boolean = false,
    val series: Boolean = false,
    val authors: Boolean = false,
    val podcasts: Boolean = false,
    val artists: Boolean = false,
    val albums: Boolean = false,
    val tracks: Boolean = false,
)

private val NONE_VISIBLE = VisibleKinds()

/** The nothing-selected view: every kind grouped by its content type, with no sub-filtering.
 * Series/authors are deliberately excluded here — they only ever surface once "Books" is
 * explicitly selected — so the unfiltered view groups at the same three content types it
 * always has (Books, Podcasts, Music). */
private val ALL_KINDS_VISIBLE =
    VisibleKinds(books = true, podcasts = true, artists = true, albums = true, tracks = true)

/** Resolves the current chip selection to which result kinds should render. Total: an
 * unrecognised [primary] (or a [secondary] that doesn't apply to the given [primary]) degrades
 * to the same "show everything" result as `primary == "all"`, rather than throwing or silently
 * hiding results behind a typo. */
fun visibleKinds(
    primary: String,
    secondary: String,
): VisibleKinds =
    when (primary) {
        "books" ->
            when (secondary) {
                "books" -> NONE_VISIBLE.copy(books = true)
                "series" -> NONE_VISIBLE.copy(series = true)
                "authors" -> NONE_VISIBLE.copy(authors = true)
                else -> NONE_VISIBLE.copy(books = true, series = true, authors = true)
            }
        "music" ->
            when (secondary) {
                "songs" -> NONE_VISIBLE.copy(tracks = true)
                "albums" -> NONE_VISIBLE.copy(albums = true)
                "artists" -> NONE_VISIBLE.copy(artists = true)
                else -> NONE_VISIBLE.copy(artists = true, albums = true, tracks = true)
            }
        "podcasts" -> NONE_VISIBLE.copy(podcasts = true)
        else -> ALL_KINDS_VISIBLE
    }
