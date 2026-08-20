package net.develivarr.auralis.features.search

/**
 * Kotlin counterpart to `apps/web/src/features/search/searchStatus.ts`'s `searchStatus` — the
 * five literal English sentences `docs/design/screens/SEARCH.md` §6.4 pins as a shared contract
 * across both platforms, not a translation guideline. See that section for the exact strings
 * this function must produce; they are reproduced here verbatim rather than paraphrased so a
 * diff against the spec is a diff against source, not against a description of it.
 *
 * Web's `SearchStatusInput` tracks `absConfigured`/`jellyfinConfigured` as two independent,
 * upfront-known booleans (fetched via react-query before any query is typed) and a separate
 * `absLoading`/`jellyfinLoading` pair. Android's [UnifiedSearchViewModel] has no equivalent
 * upfront check — [UnifiedSearchUiState.libraryUnconfigured] is only learned the first time a
 * search actually settles, the same way [UnifiedSearchResultsUiState.Results.musicUnconfigured]
 * already is — so this function takes the narrower, already-merged shape that state produces:
 * one [libraryUnconfigured] flag and one [isLoading] flag standing in for
 * `absLoading || (jellyfinConfigured && jellyfinLoading)`, since Android's library and music
 * fan-outs are awaited together and only ever settle to [UnifiedSearchResultsUiState.Results] as
 * one unit (see [UnifiedSearchViewModel.performSearch]'s own doc comment).
 */
data class UnifiedSearchStatusCounts(
    val books: Int = 0,
    val podcasts: Int = 0,
    val artists: Int = 0,
    val albums: Int = 0,
    val tracks: Int = 0,
)

fun unifiedSearchStatus(
    libraryUnconfigured: Boolean,
    /** The raw, as-typed query — used only for the text a user sees/hears, matching
     * `SearchStatusInput.query`'s own doc comment. */
    query: String,
    /** Already trimmed by the caller, used only for the empty-query decision — matching
     * `SearchStatusInput.trimmedQuery`'s own doc comment. */
    trimmedQuery: String,
    isLoading: Boolean,
    counts: UnifiedSearchStatusCounts,
): String {
    if (libraryUnconfigured) {
        return "Connect Audiobookshelf in Settings to search your library."
    }

    if (trimmedQuery.isEmpty()) {
        return "Start typing to search titles, authors and narrators."
    }

    if (isLoading) {
        return "Searching…"
    }

    val musicHasResults = counts.artists > 0 || counts.albums > 0 || counts.tracks > 0
    val hasResults = counts.books > 0 || counts.podcasts > 0 || musicHasResults

    if (!hasResults) {
        return "No matches for \"$query\"."
    }

    val parts = mutableListOf(plural(counts.books, "book"), plural(counts.podcasts, "podcast"))
    if (musicHasResults) {
        parts += plural(counts.artists, "artist")
        parts += plural(counts.albums, "album")
        parts += plural(counts.tracks, "track")
    }

    return "${parts.joinToString(", ")} found for \"$query\"."
}

private fun plural(
    count: Int,
    noun: String,
): String = "$count $noun${if (count == 1) "" else "s"}"
