package net.auralis.app.features.home

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pure behaviour tests for `ForYouFilters.kt`'s chip logic — the Kotlin mirror of
 * `apps/web/src/features/home/forYouFilters.test.ts`. No Compose, no Android framework type
 * anywhere in this file or the functions under test.
 */
class ForYouFiltersTest {
    @Test
    fun `the option list is exactly All, Music, Podcasts, Audiobooks in that order`() {
        assertEquals(
            listOf("all" to "All", "music" to "Music", "podcasts" to "Podcasts", "books" to "Audiobooks"),
            FOR_YOU_FILTER_OPTIONS.map { it.value to it.label },
        )
    }

    @Test
    fun `re-clicking the active chip clears the filter back to all`() {
        assertEquals("all", selectForYouFilter(current = "music", value = "music"))
    }

    @Test
    fun `selecting a different chip replaces the current filter`() {
        assertEquals("podcasts", selectForYouFilter(current = "music", value = "podcasts"))
    }
}
