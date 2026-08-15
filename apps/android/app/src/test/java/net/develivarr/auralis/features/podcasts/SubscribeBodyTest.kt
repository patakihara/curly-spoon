package net.develivarr.auralis.features.podcasts

import net.develivarr.auralis.data.model.Library
import net.develivarr.auralis.data.model.LibraryFolder
import net.develivarr.auralis.data.model.PodcastDirectoryResult
import net.develivarr.auralis.data.model.PodcastFeedPreview
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors `apps/web/src/features/podcasts/subscribeMetadata.test.ts` case-for-case. */
class SubscribeBodyTest {
    private val library =
        Library(
            id = "lib-podcasts",
            name = "Podcasts",
            mediaType = "podcast",
            icon = "podcast",
            folders = listOf(LibraryFolder(id = "folder-podcasts", path = "/data/podcasts")),
        )

    private val preview =
        PodcastFeedPreview(
            title = "The Daily Tech Digest",
            author = "Tech Media Collective",
            description = "A daily rundown of technology news.",
            descriptionPlain = "A daily rundown of technology news.",
            feedUrl = "https://feeds.fake.abs.local/daily-tech.xml",
            image = "https://fake.abs.local/covers/daily-tech.jpg",
            categories = listOf("Technology", "News"),
            language = "en-us",
            explicit = false,
            numEpisodes = 1,
            episodes = emptyList(),
            pubDate = "Mon, 01 Jan 2024 08:00:00 GMT",
            link = "https://fake.abs.local/daily-tech",
        )

    private val directoryResult =
        PodcastDirectoryResult(
            itunesId = 987654321L,
            itunesArtistId = 123456L,
            title = "The Daily Tech Digest",
            artistName = "Tech Media Collective",
            description = "A daily rundown of technology news.",
            descriptionPlain = "A daily rundown of technology news.",
            releaseDate = "2020-01-01T08:00:00Z",
            genres = listOf("Technology", "News"),
            cover = "https://fake.abs.local/covers/daily-tech.jpg",
            trackCount = 500,
            feedUrl = "https://feeds.fake.abs.local/daily-tech.xml",
            pageUrl = "https://podcasts.apple.com/podcast/id987654321",
            explicit = false,
        )

    @Test
    fun `builds a full subscribe body from a preview reached via a directory result`() {
        val body = buildSubscribeBody(preview, preview.feedUrl!!, library, directoryResult)

        assertEquals("lib-podcasts", body?.libraryId)
        assertEquals("folder-podcasts", body?.folderId)
        assertEquals("/data/podcasts", body?.folderPath)
        assertEquals("https://feeds.fake.abs.local/daily-tech.xml", body?.rssFeed)
        assertEquals("The Daily Tech Digest", body?.title)
        assertEquals("Tech Media Collective", body?.metadata?.author)
        assertEquals("A daily rundown of technology news.", body?.metadata?.description)
        assertEquals("2020-01-01T08:00:00Z", body?.metadata?.releaseDate)
        assertEquals("https://fake.abs.local/covers/daily-tech.jpg", body?.metadata?.imageUrl)
        assertEquals(listOf("Technology", "News"), body?.metadata?.genres)
        assertEquals("en-us", body?.metadata?.language)
        assertEquals(false, body?.metadata?.explicit)
        assertEquals("https://podcasts.apple.com/podcast/id987654321", body?.metadata?.itunesPageUrl)
        assertEquals(987654321L, body?.metadata?.itunesId)
        assertNull(body?.autoDownloadEpisodes)
    }

    @Test
    fun `omits itunes fields and falls back to the feed pubDate when there is no directory result`() {
        val body = buildSubscribeBody(preview, preview.feedUrl!!, library)

        assertNull(body?.metadata?.itunesId)
        assertNull(body?.metadata?.itunesPageUrl)
        assertEquals("Mon, 01 Jan 2024 08:00:00 GMT", body?.metadata?.releaseDate)
    }

    @Test
    fun `falls back to the directory result's title when the feed preview has none`() {
        val body = buildSubscribeBody(preview.copy(title = null), preview.feedUrl!!, library, directoryResult)

        assertEquals("The Daily Tech Digest", body?.title)
    }

    @Test
    fun `returns null when neither the preview nor the directory result has a usable title`() {
        val body = buildSubscribeBody(preview.copy(title = "   "), preview.feedUrl!!, library)

        assertNull(body)
    }

    @Test
    fun `returns null when the target library has no folder to subscribe into`() {
        val body = buildSubscribeBody(preview, preview.feedUrl!!, library.copy(folders = emptyList()))

        assertNull(body)
    }

    @Test
    fun `passes autoDownloadEpisodes through unchanged`() {
        val body = buildSubscribeBody(preview, preview.feedUrl!!, library, autoDownloadEpisodes = true)

        assertTrue(body?.autoDownloadEpisodes == true)
    }
}
