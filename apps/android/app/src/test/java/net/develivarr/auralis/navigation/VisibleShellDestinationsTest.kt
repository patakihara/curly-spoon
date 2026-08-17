package net.develivarr.auralis.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * [visibleShellDestinations] is the pure core of wave 16d-A-2's fix — no Compose involved, so
 * this runs as a plain JVM test, the same shape as [ShellDestinationsTest]. Mirrors
 * `apps/web/src/components/destinations.ts`'s own test coverage: For You and Search are
 * unconditional; Music needs only Jellyfin configured; Books/Podcasts each need Audiobookshelf
 * configured *and* a library of their own media type, not just Audiobookshelf configured alone.
 */
class VisibleShellDestinationsTest {
    @Test
    fun `nothing configured shows only For You and Search`() {
        val visible = visibleShellDestinations(DestinationAvailability())

        assertEquals(setOf(ShellDestination.FOR_YOU, ShellDestination.SEARCH), visible)
    }

    @Test
    fun `Jellyfin configured alone adds Music and nothing else`() {
        val visible = visibleShellDestinations(DestinationAvailability(jellyfinConfigured = true))

        assertEquals(
            setOf(ShellDestination.FOR_YOU, ShellDestination.SEARCH, ShellDestination.MUSIC),
            visible,
        )
    }

    @Test
    fun `Audiobookshelf configured with no libraries adds neither Books nor Podcasts`() {
        val visible = visibleShellDestinations(DestinationAvailability(audiobookshelfConfigured = true))

        assertEquals(setOf(ShellDestination.FOR_YOU, ShellDestination.SEARCH), visible)
    }

    @Test
    fun `a book library with Audiobookshelf configured adds only Books`() {
        val visible =
            visibleShellDestinations(
                DestinationAvailability(audiobookshelfConfigured = true, hasBookLibrary = true),
            )

        assertEquals(
            setOf(ShellDestination.FOR_YOU, ShellDestination.SEARCH, ShellDestination.BOOKS),
            visible,
        )
    }

    @Test
    fun `a podcast library with Audiobookshelf configured adds only Podcasts`() {
        val visible =
            visibleShellDestinations(
                DestinationAvailability(audiobookshelfConfigured = true, hasPodcastLibrary = true),
            )

        assertEquals(
            setOf(ShellDestination.FOR_YOU, ShellDestination.SEARCH, ShellDestination.PODCASTS),
            visible,
        )
    }

    @Test
    fun `a matching library with Audiobookshelf unconfigured adds nothing`() {
        // The library flags alone must never be enough — a server can only report libraries
        // once it's configured, so this pins that the two conditions are genuinely ANDed rather
        // than either being sufficient alone.
        val visible =
            visibleShellDestinations(
                DestinationAvailability(hasBookLibrary = true, hasPodcastLibrary = true),
            )

        assertEquals(setOf(ShellDestination.FOR_YOU, ShellDestination.SEARCH), visible)
    }

    @Test
    fun `everything configured shows all five destinations`() {
        val visible =
            visibleShellDestinations(
                DestinationAvailability(
                    jellyfinConfigured = true,
                    audiobookshelfConfigured = true,
                    hasBookLibrary = true,
                    hasPodcastLibrary = true,
                ),
            )

        assertEquals(ShellDestination.entries.toSet(), visible)
    }
}
