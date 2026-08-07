package net.auralis.app.features.search

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure behaviour tests for [SearchFilterState]'s chip logic — the Kotlin mirror of
 * `apps/web/src/features/search/searchFilters.ts`. No Compose, no Android framework type
 * anywhere in this file or the class under test.
 */
class SearchFiltersTest {
    @Test
    fun `podcasts primary reveals no secondary row`() {
        assertTrue(secondaryFilterOptions("podcasts").isEmpty())
    }

    @Test
    fun `all primary reveals no secondary row`() {
        assertTrue(secondaryFilterOptions("all").isEmpty())
    }

    @Test
    fun `music primary reveals songs albums and artists`() {
        assertEquals(listOf("all", "songs", "albums", "artists"), secondaryFilterOptions("music").map { it.value })
    }

    @Test
    fun `books primary reveals books series and authors`() {
        assertEquals(listOf("all", "books", "series", "authors"), secondaryFilterOptions("books").map { it.value })
    }

    @Test
    fun `selecting a primary resets the secondary filter`() {
        // Music's "artists" is meaningless once Books is selected — carrying it across would
        // silently leave the new secondary row with a value none of its own chips represent,
        // and visibleKinds would then hide every book result. This is the regression this test
        // exists to pin: without the reset in selectPrimaryFilter, this assertion fails.
        val afterArtists = selectSecondaryFilter(selectPrimaryFilter(DEFAULT_SEARCH_FILTER_STATE, "music"), "artists")
        assertEquals(SearchFilterState("music", "artists"), afterArtists)

        val afterSwitchingToBooks = selectPrimaryFilter(afterArtists, "books")
        assertEquals(SearchFilterState("books", "all"), afterSwitchingToBooks)
    }

    @Test
    fun `selecting the already-active primary chip clears back to all`() {
        val selected = selectPrimaryFilter(DEFAULT_SEARCH_FILTER_STATE, "music")
        val cleared = selectPrimaryFilter(selected, "music")
        assertEquals(DEFAULT_SEARCH_FILTER_STATE, cleared)
    }

    @Test
    fun `selecting the already-active secondary chip clears it back to all`() {
        val withSecondary = selectSecondaryFilter(SearchFilterState("music", "all"), "songs")
        assertEquals("songs", withSecondary.secondary)
        val cleared = selectSecondaryFilter(withSecondary, "songs")
        assertEquals("all", cleared.secondary)
    }

    @Test
    fun `no selection shows every kind grouped by content type`() {
        val visible = visibleKinds("all", "all")
        assertTrue(visible.books)
        assertTrue(visible.podcasts)
        assertTrue(visible.artists)
        assertTrue(visible.albums)
        assertTrue(visible.tracks)
        // Series/authors only ever surface once Books is explicitly selected — the unfiltered
        // view groups at the same three content types it always has.
        assertTrue(!visible.series)
        assertTrue(!visible.authors)
    }

    @Test
    fun `books with no secondary shows books series and authors together`() {
        val visible = visibleKinds("books", "all")
        assertTrue(visible.books)
        assertTrue(visible.series)
        assertTrue(visible.authors)
        assertTrue(!visible.podcasts)
        assertTrue(!visible.artists)
    }

    @Test
    fun `books narrowed to series shows only series`() {
        val visible = visibleKinds("books", "series")
        assertTrue(visible.series)
        assertTrue(!visible.books)
        assertTrue(!visible.authors)
    }

    @Test
    fun `books narrowed to authors shows only authors`() {
        val visible = visibleKinds("books", "authors")
        assertTrue(visible.authors)
        assertTrue(!visible.books)
        assertTrue(!visible.series)
    }

    @Test
    fun `music with no secondary shows artists albums and tracks together`() {
        val visible = visibleKinds("music", "all")
        assertTrue(visible.artists)
        assertTrue(visible.albums)
        assertTrue(visible.tracks)
        assertTrue(!visible.books)
    }

    @Test
    fun `music narrowed to songs shows only tracks`() {
        val visible = visibleKinds("music", "songs")
        assertTrue(visible.tracks)
        assertTrue(!visible.artists)
        assertTrue(!visible.albums)
    }

    @Test
    fun `music narrowed to albums shows only albums`() {
        val visible = visibleKinds("music", "albums")
        assertTrue(visible.albums)
        assertTrue(!visible.tracks)
        assertTrue(!visible.artists)
    }

    @Test
    fun `music narrowed to artists shows only artists`() {
        val visible = visibleKinds("music", "artists")
        assertTrue(visible.artists)
        assertTrue(!visible.albums)
        assertTrue(!visible.tracks)
    }

    @Test
    fun `podcasts primary shows only podcasts regardless of secondary`() {
        val visible = visibleKinds("podcasts", "all")
        assertTrue(visible.podcasts)
        assertTrue(!visible.books)
        assertTrue(!visible.artists)
    }

    @Test
    fun `an unrecognised primary degrades to showing everything rather than throwing`() {
        val visible = visibleKinds("something-unknown", "all")
        assertTrue(visible.books)
        assertTrue(visible.podcasts)
        assertTrue(visible.artists)
    }

    @Test
    fun `an unrecognised secondary under books degrades to the books-with-no-secondary view`() {
        val visible = visibleKinds("books", "something-unknown")
        assertTrue(visible.books)
        assertTrue(visible.series)
        assertTrue(visible.authors)
    }
}
