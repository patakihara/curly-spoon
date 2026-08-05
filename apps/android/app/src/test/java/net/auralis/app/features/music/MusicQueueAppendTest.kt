package net.auralis.app.features.music

import kotlinx.coroutines.test.runTest
import net.auralis.app.playback.ResolvedPlayback
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [musicQueueAppendPages] is the pure plan [appendRemainingQueuePages] drives — see that
 * function's own doc comment for why the network-touching half is exercised through
 * [AlbumDetailViewModelTest]/[PlaylistDetailViewModelTest] instead of here.
 */
class MusicQueueAppendTest {
    @Test
    fun `a single-page album needs no further pages`() {
        // Everything already loaded (loadedCount == total) — the common case, since
        // AlbumDetailScreen/PlaylistDetailScreen page at 40 and most albums/playlists are
        // smaller than that.
        assertEquals(emptyList<Int>(), musicQueueAppendPages(loadedCount = 12, total = 12, pageSize = 40, cap = 2000))
    }

    @Test
    fun `a multi-page album proposes one start index per remaining page`() {
        val starts = musicQueueAppendPages(loadedCount = 40, total = 97, pageSize = 40, cap = 2000)

        // 40..79, 80..96 — two more pages to reach 97 total.
        assertEquals(listOf(40, 80), starts)
    }

    @Test
    fun `the cap stops the plan short of the upstream total`() {
        val starts = musicQueueAppendPages(loadedCount = 40, total = 10_000, pageSize = 40, cap = 200)

        // Must reach exactly the cap (200), not the real total (10_000): 40, 80, 120, 160.
        assertEquals(listOf(40, 80, 120, 160), starts)
        assertTrue(starts.last() + 40 >= 200)
    }

    @Test
    fun `nothing more is proposed once loadedCount already reached the cap`() {
        assertEquals(emptyList<Int>(), musicQueueAppendPages(loadedCount = 200, total = 10_000, pageSize = 40, cap = 200))
    }

    @Test
    fun `does not loop forever if loadedCount somehow overshoots total`() {
        assertEquals(emptyList<Int>(), musicQueueAppendPages(loadedCount = 50, total = 40, pageSize = 40, cap = 2000))
    }

    // -----------------------------------------------------------------------------
    // appendRemainingQueuePages — the driver. Uses a fake in-memory track/page source rather
    // than a real MusicRepository/MockWebServer, since the plan itself (musicQueueAppendPages,
    // covered above) is what's under test here, not any one caller's wiring — AlbumDetailViewModel
    // Test/PlaylistDetailViewModelTest cover that wiring against a real MockWebServer instead.
    // -----------------------------------------------------------------------------

    private fun track(id: String) = MusicTrackUi(id = id, title = id, position = "", durationSeconds = 100L)

    private fun resolved(track: MusicTrackUi) =
        ResolvedPlayback(
            mediaId = "track:${track.id}",
            uri = "https://bff.example.test/${track.id}",
            title = track.title,
            artist = null,
            subtitle = null,
            artworkUrl = null,
            startPositionMs = 0L,
        )

    @Test
    fun `a fully-loaded album fetches nothing extra`() =
        runTest {
            var fetchCalls = 0
            val pages = mutableListOf<List<ResolvedPlayback>>()

            appendRemainingQueuePages(
                loadedCount = 3,
                total = 3,
                pageSize = 40,
                cap = 2000,
                fetchPage = { start, limit -> fetchCalls++; error("must not be called: start=$start limit=$limit") },
                toResolved = { it.map(::resolved) },
                onPage = { pages.add(it) },
            )

            assertEquals(0, fetchCalls)
            assertTrue(pages.isEmpty())
        }

    @Test
    fun `a multi-page album ends up with every track queued`() =
        runTest {
            // 97 tracks total, page size 40, already 40 loaded — two more pages: 40 tracks then
            // 17. All source data is deterministic ids so the assertion can check exact coverage.
            val allIds = (1..97).map { "trk$it" }
            val pages = mutableListOf<List<ResolvedPlayback>>()

            appendRemainingQueuePages(
                loadedCount = 40,
                total = 97,
                pageSize = 40,
                cap = 2000,
                fetchPage = { start, limit -> allIds.subList(start, minOf(start + limit, allIds.size)).map(::track) },
                toResolved = { it.map(::resolved) },
                onPage = { pages.add(it) },
            )

            assertEquals(2, pages.size)
            assertEquals(40, pages[0].size)
            assertEquals(17, pages[1].size)
            val queuedIds = pages.flatten().map { it.mediaId }
            // Only the *remaining* 57 tracks (indices 40..96) are ever passed to fetchPage — the
            // first 40 are already loaded and appendRemainingQueuePages never re-fetches them.
            assertEquals(allIds.subList(40, allIds.size).map { "track:$it" }, queuedIds)
        }

    @Test
    fun `reaching the cap stops fetching further pages, asserted by actually reaching it`() =
        runTest {
            // A pathological 10_000-track playlist with a tiny cap (80 = two pages of 40) — the
            // fetcher would happily serve a third page if asked, so this only passes if the cap
            // itself stopped the loop, not because the source ran out.
            var fetchCalls = 0
            val pages = mutableListOf<List<ResolvedPlayback>>()

            appendRemainingQueuePages(
                loadedCount = 0,
                total = 10_000,
                pageSize = 40,
                cap = 80,
                fetchPage = { start, limit ->
                    fetchCalls++
                    (start until start + limit).map { track("trk$it") }
                },
                toResolved = { it.map(::resolved) },
                onPage = { pages.add(it) },
            )

            assertEquals(2, fetchCalls)
            assertEquals(2, pages.size)
            assertEquals(80, pages.sumOf { it.size })
        }

    @Test
    fun `a failed page fetch stops appending without retrying`() =
        runTest {
            var fetchCalls = 0
            val pages = mutableListOf<List<ResolvedPlayback>>()

            appendRemainingQueuePages(
                loadedCount = 40,
                total = 200,
                pageSize = 40,
                cap = 2000,
                fetchPage = { _, _ -> fetchCalls++; null }, // simulates TracksPageResult.Failed
                toResolved = { it.map(::resolved) },
                onPage = { pages.add(it) },
            )

            assertEquals(1, fetchCalls)
            assertTrue(pages.isEmpty())
        }

    @Test
    fun `an empty page from the upstream also stops appending, not just a failure`() =
        runTest {
            var fetchCalls = 0
            val pages = mutableListOf<List<ResolvedPlayback>>()

            appendRemainingQueuePages(
                loadedCount = 40,
                total = 200,
                pageSize = 40,
                cap = 2000,
                fetchPage = { _, _ -> fetchCalls++; emptyList() },
                toResolved = { it.map(::resolved) },
                onPage = { pages.add(it) },
            )

            assertEquals(1, fetchCalls)
            assertTrue(pages.isEmpty())
        }
}
