package net.develivarr.auralis.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [shellDestinationFor] and [shouldShowShell] are the pure core of the persistent nav shell
 * (wave 12a-A1) — no Compose involved, so these run as plain JVM tests. The one real trap is
 * [Routes.MUSIC] ("music") being a string-prefix of [Routes.MUSIC_SEARCH] ("music/search"): a
 * naive `route.startsWith(destination.route)` walk, ordered [Music, Search], would resolve
 * "music/search" to Music. Matching longest-prefix-first is what this file asserts against.
 */
class ShellDestinationsTest {
    @Test
    fun `each of the five destinations resolves from its own bare route`() {
        assertEquals(ShellDestination.FOR_YOU, shellDestinationFor(Routes.HOME))
        assertEquals(ShellDestination.MUSIC, shellDestinationFor(Routes.MUSIC))
        assertEquals(ShellDestination.BOOKS, shellDestinationFor(Routes.BOOKS))
        assertEquals(ShellDestination.PODCASTS, shellDestinationFor(Routes.PODCASTS))
        assertEquals(ShellDestination.SEARCH, shellDestinationFor(Routes.MUSIC_SEARCH))
    }

    @Test
    fun `music search resolves to Search, not Music, despite music being its string prefix`() {
        assertEquals(ShellDestination.SEARCH, shellDestinationFor("music/search"))
        assertNotEquals(ShellDestination.MUSIC, shellDestinationFor("music/search"))
    }

    @Test
    fun `nested music routes all resolve to Music`() {
        val nestedMusicRoutes =
            listOf(
                "music/album/abc123",
                "music/artist/def456",
                "music/playlist/ghi789",
                "music/favorites",
                "music/playlists",
                "music/requests",
                "music/lyrics",
            )
        nestedMusicRoutes.forEach { route ->
            assertEquals("route '$route' should resolve to Music", ShellDestination.MUSIC, shellDestinationFor(route))
        }
    }

    @Test
    fun `podcast detail routes resolve to Podcasts`() {
        assertEquals(ShellDestination.PODCASTS, shellDestinationFor("podcast/xyz987"))
    }

    @Test
    fun `an unknown route resolves to no destination`() {
        assertNull(shellDestinationFor("onboarding"))
        assertNull(shellDestinationFor("login"))
        assertNull(shellDestinationFor("requests"))
        assertNull(shellDestinationFor("downloads"))
        assertNull(shellDestinationFor(null))
        assertNull(shellDestinationFor("something/entirely/unrelated"))
    }

    @Test
    fun `the shell is hidden on onboarding and login, shown everywhere else`() {
        assertTrue(!shouldShowShell(Routes.ONBOARDING))
        assertTrue(!shouldShowShell(Routes.LOGIN))
        assertTrue(shouldShowShell(Routes.HOME))
        assertTrue(shouldShowShell(Routes.MUSIC))
        assertTrue(shouldShowShell(Routes.BOOKS))
        assertTrue(shouldShowShell(Routes.PODCASTS))
        assertTrue(shouldShowShell(Routes.MUSIC_SEARCH))
        assertTrue(shouldShowShell(null))
    }

    private fun assertNotEquals(
        expected: Any?,
        actual: Any?,
    ) = org.junit.Assert.assertNotEquals(expected, actual)
}
