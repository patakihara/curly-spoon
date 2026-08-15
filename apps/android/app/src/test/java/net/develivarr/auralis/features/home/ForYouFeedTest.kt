package net.develivarr.auralis.features.home

import net.develivarr.auralis.data.model.AuthorRef
import net.develivarr.auralis.data.model.JellyfinAlbum
import net.develivarr.auralis.data.model.LibraryItem
import net.develivarr.auralis.data.model.MediaProgress
import net.develivarr.auralis.data.model.MediaSummary
import net.develivarr.auralis.data.model.Shelf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure behaviour tests for `ForYouFeed.kt` — the Kotlin mirror of
 * `apps/web/src/features/home/forYouFeed.test.ts`. No Compose, no Android framework type
 * anywhere in this file or the functions under test.
 */
class ForYouFeedTest {
    private fun libraryItem(
        id: String,
        title: String = "Title-$id",
        authors: List<AuthorRef>? = null,
        author: String? = null,
        progress: Double? = null,
    ) = LibraryItem(
        id = id,
        libraryId = "lib1",
        media = MediaSummary(kind = "book", title = title, authors = authors, author = author),
        progress = progress?.let { MediaProgress("prog-$id", id, duration = 100.0, currentTime = it * 100, progress = it, isFinished = false) },
    )

    private fun shelf(
        id: String,
        label: String = "Shelf $id",
        type: String = "book",
        items: List<LibraryItem>,
        reason: String? = null,
    ) = Shelf(id = id, label = label, type = type, items = items, reason = reason)

    @Test
    fun `shelfToCarousel uses the passed contentType, not shelf type`() {
        val podcastShelf = shelf(id = "s1", type = "episode", items = listOf(libraryItem("e1", author = "Host")))
        val carousel = shelfToCarousel(podcastShelf, ForYouContentType.PODCASTS) { "cover/$it" }
        assertEquals(ForYouContentType.PODCASTS, carousel.contentType)
        assertEquals(ForYouContentType.PODCASTS, carousel.items.single().contentType)
    }

    @Test
    fun `a book item's subtitle prefers structured authors over free-text author`() {
        val withBoth =
            libraryItem(
                "b1",
                authors = listOf(AuthorRef("a1", "Structured Author")),
                author = "Free Text Author",
            )
        val carousel = shelfToCarousel(shelf(id = "s1", items = listOf(withBoth)), ForYouContentType.BOOKS) { null }
        assertEquals("Structured Author", carousel.items.single().subtitle)
    }

    @Test
    fun `a book item with no structured authors falls back to the free-text author`() {
        val freeTextOnly = libraryItem("b1", authors = null, author = "Free Text Author")
        val carousel = shelfToCarousel(shelf(id = "s1", items = listOf(freeTextOnly)), ForYouContentType.BOOKS) { null }
        assertEquals("Free Text Author", carousel.items.single().subtitle)
    }

    @Test
    fun `a book item with an empty authors list falls back to the free-text author`() {
        val emptyStructured = libraryItem("b1", authors = emptyList(), author = "Free Text Author")
        val carousel = shelfToCarousel(shelf(id = "s1", items = listOf(emptyStructured)), ForYouContentType.BOOKS) { null }
        assertEquals("Free Text Author", carousel.items.single().subtitle)
    }

    @Test
    fun `shelfToCarousel carries a recommended shelf's reason through to the carousel`() {
        // Deliberately not asserting the exact wording — that string is composed server-side
        // (apps/server/src/features/recommendations/shelves.ts) and is a first draft, not final
        // copy (see the coordinator's note on this wave). Only presence and identity matter here.
        val recommended = shelf(id = "s1", items = listOf(libraryItem("b1")), reason = "Because you finished a book")
        val carousel = shelfToCarousel(recommended, ForYouContentType.BOOKS) { null }
        assertEquals("Because you finished a book", carousel.reason)
    }

    @Test
    fun `shelfToCarousel yields a null reason for an ordinary home shelf`() {
        val home = shelf(id = "s1", items = listOf(libraryItem("b1")))
        val carousel = shelfToCarousel(home, ForYouContentType.BOOKS) { null }
        assertNull(carousel.reason)
    }

    @Test
    fun `carouselReasonText returns a non-blank reason unchanged`() {
        val carousel = FeedCarousel("s", "Shelf", ForYouContentType.BOOKS, emptyList(), reason = "Some reason")
        assertEquals("Some reason", carouselReasonText(carousel))
    }

    @Test
    fun `carouselReasonText treats a null reason as nothing to render`() {
        val carousel = FeedCarousel("s", "Shelf", ForYouContentType.BOOKS, emptyList(), reason = null)
        assertNull(carouselReasonText(carousel))
    }

    @Test
    fun `carouselReasonText treats a blank reason as nothing to render`() {
        val carousel = FeedCarousel("s", "Shelf", ForYouContentType.BOOKS, emptyList(), reason = "   ")
        assertNull(carouselReasonText(carousel))
    }

    @Test
    fun `albumsToCarousel yields null progress for every album`() {
        val albums = listOf(JellyfinAlbum(id = "al1", name = "Album One"), JellyfinAlbum(id = "al2", name = "Album Two"))
        val carousel = albumsToCarousel("music-favorite-albums", "Your albums", albums) { "art/$it" }
        assertEquals(ForYouContentType.MUSIC, carousel.contentType)
        assertTrue(carousel.items.all { it.progress == null })
        assertEquals(listOf("art/al1", "art/al2"), carousel.items.map { it.coverUrl })
    }

    @Test
    fun `filterCarousels keeps only the matching content type`() {
        val books = FeedCarousel("b", "Books", ForYouContentType.BOOKS, emptyList())
        val music = FeedCarousel("m", "Music", ForYouContentType.MUSIC, emptyList())
        val podcasts = FeedCarousel("p", "Podcasts", ForYouContentType.PODCASTS, emptyList())
        val result = filterCarousels(listOf(books, music, podcasts), "music")
        assertEquals(listOf(music), result)
    }

    @Test
    fun `filterCarousels with an unrecognised filter keeps everything`() {
        val books = FeedCarousel("b", "Books", ForYouContentType.BOOKS, emptyList())
        val music = FeedCarousel("m", "Music", ForYouContentType.MUSIC, emptyList())
        val result = filterCarousels(listOf(books, music), "nonsense")
        assertEquals(listOf(books, music), result)
    }

    private fun feedItem(id: String) =
        FeedItem(id = id, contentType = ForYouContentType.BOOKS, title = "T-$id", subtitle = null, coverUrl = null, progress = null)

    @Test
    fun `buildQuickPicks takes items round-robin across carousels`() {
        val a = FeedCarousel("a", "A", ForYouContentType.BOOKS, listOf(feedItem("a1"), feedItem("a2"), feedItem("a3")))
        val b = FeedCarousel("b", "B", ForYouContentType.PODCASTS, listOf(feedItem("b1"), feedItem("b2"), feedItem("b3")))
        val c = FeedCarousel("c", "C", ForYouContentType.MUSIC, listOf(feedItem("c1"), feedItem("c2"), feedItem("c3")))
        val picks = buildQuickPicks(listOf(a, b, c), max = 8)
        // First item of each carousel before the second of any — the exact order, not just membership.
        assertEquals(listOf("a1", "b1", "c1", "a2", "b2", "c2", "a3", "b3"), picks.map { it.id })
    }

    @Test
    fun `buildQuickPicks caps at 8`() {
        val a = FeedCarousel("a", "A", ForYouContentType.BOOKS, (1..10).map { feedItem("a$it") })
        val picks = buildQuickPicks(listOf(a), max = 8)
        assertEquals(8, picks.size)
    }

    @Test
    fun `buildQuickPicks terminates on carousels of unequal length without looping forever`() {
        val short = FeedCarousel("short", "Short", ForYouContentType.BOOKS, listOf(feedItem("s1")))
        val long = FeedCarousel("long", "Long", ForYouContentType.PODCASTS, (1..5).map { feedItem("l$it") })
        val picks = buildQuickPicks(listOf(short, long), max = 8)
        // short contributes only its one item; long keeps contributing until max/its own end.
        assertEquals(listOf("s1", "l1", "l2", "l3", "l4", "l5"), picks.map { it.id })
    }
}
