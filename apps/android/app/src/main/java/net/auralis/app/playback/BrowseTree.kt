package net.auralis.app.playback

import net.auralis.app.data.model.LibraryItem
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.settings.ServerConfigRepository

/**
 * A node in Android Auto's browse tree. Deliberately free of any `android.*`/`androidx.*`
 * (Media3 in particular) import — [AuralisMediaLibraryService] converts these to `MediaItem`s
 * at the edge, keeping this file plain-JVM unit-testable with no Robolectric/instrumented test
 * setup required, matching the rest of this project's data-layer style.
 */
sealed interface BrowseNode {
    val id: String
    val title: String
}

data class BrowseFolder(
    override val id: String,
    override val title: String,
) : BrowseNode

data class BrowseBook(
    override val id: String,
    override val title: String,
    val subtitle: String? = null,
    val coverUrl: String? = null,
) : BrowseNode

/** Browse-id constants and the string-prefix scheme used for series/book leaf ids. */
object BrowseIds {
    const val ROOT = "root"
    const val CONTINUE = "continue"
    const val BOOKS = "books"
    const val SERIES = "series"
    private const val SERIES_PREFIX = "series:"
    private const val BOOK_PREFIX = "book:"

    fun seriesNode(seriesId: String) = "$SERIES_PREFIX$seriesId"

    fun book(itemId: String) = "$BOOK_PREFIX$itemId"

    fun seriesIdFrom(browseId: String) = browseId.removePrefix(SERIES_PREFIX)

    fun itemIdFrom(browseId: String) = browseId.removePrefix(BOOK_PREFIX)

    fun isSeriesNode(browseId: String) = browseId.startsWith(SERIES_PREFIX)

    fun isBookNode(browseId: String) = browseId.startsWith(BOOK_PREFIX)
}

/**
 * Read-only half of Android Auto's browse tree: root, a folder's children, and single-item
 * lookup by browse id. Playing a tapped item and voice search are a later wave's job (see
 * `docs/ROADMAP.md` §7, Wave E2b) — this class only resolves what the tree looks like.
 *
 * Deliberately ships `Continue`/`Books`/`Series` only, no `Downloaded` node: no
 * offline-downloads feature exists anywhere in `apps/android` yet.
 */
class BrowseTreeRepository(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
) {
    suspend fun rootChildren(): List<BrowseFolder> =
        listOf(
            BrowseFolder(BrowseIds.CONTINUE, "Continue Listening"),
            BrowseFolder(BrowseIds.BOOKS, "Books"),
            BrowseFolder(BrowseIds.SERIES, "Series"),
        )

    // Network failures degrade to emptyList() here rather than propagating, mirroring item()'s
    // existing try/catch below and this project's "total functions" house style. It also matches
    // MediaLibraryService.Callback.onGetChildren's own contract: an empty list is the documented
    // response for "nothing to show", so a transient upstream error surfaces as an empty browse
    // node rather than an uncaught exception crossing the future{} bridge in
    // AuralisMediaLibraryService.
    suspend fun children(
        parentId: String,
        page: Int,
        pageSize: Int,
    ): List<BrowseNode> =
        try {
            childrenOrThrow(parentId, page, pageSize)
        } catch (e: ApiException) {
            emptyList()
        }

    private suspend fun childrenOrThrow(
        parentId: String,
        page: Int,
        pageSize: Int,
    ): List<BrowseNode> {
        val baseUrl = serverConfigRepository.getBaseUrl() ?: return emptyList()
        val libraryId = apiClient.libraries().firstOrNull()?.id ?: return emptyList()

        return when {
            parentId == BrowseIds.CONTINUE -> continueListeningChildren(libraryId, baseUrl, page, pageSize)
            parentId == BrowseIds.BOOKS ->
                apiClient.libraryItems(libraryId, page = page, limit = pageSize)
                    .items.map { it.toBrowseBook(baseUrl) }
            parentId == BrowseIds.SERIES ->
                apiClient.librarySeries(libraryId, page = page, limit = pageSize)
                    .series.map { BrowseFolder(BrowseIds.seriesNode(it.id), it.name) }
            BrowseIds.isSeriesNode(parentId) ->
                seriesBooks(libraryId, BrowseIds.seriesIdFrom(parentId), baseUrl, page, pageSize)
            else -> emptyList()
        }
    }

    suspend fun item(browseId: String): BrowseBook? {
        if (!BrowseIds.isBookNode(browseId)) return null
        val baseUrl = serverConfigRepository.getBaseUrl() ?: return null
        return try {
            apiClient.libraryItem(BrowseIds.itemIdFrom(browseId)).toBrowseBook(baseUrl)
        } catch (e: ApiException) {
            null
        }
    }

    // Audiobookshelf's real "continue listening" shelf id/label isn't verified against a real
    // server in this codebase (a documented gap — see docs/setup/MY_SETUP.md on real-API-shape
    // risk). Matched heuristically until checked on a real device.
    //
    // The page/pageSize window is applied here, client-side, rather than forwarded to
    // libraryHome(): that endpoint paginates the outer list of shelves, not the items inside
    // whichever shelf matches "continue", so there is no upstream parameter to pass through for
    // the inner list. Skipping this isn't just wasted bandwidth — Media3's
    // MediaLibrarySessionImpl.verifyResultItems() throws an uncaught IllegalStateException on
    // the main looper if onGetChildren returns more items than the caller's pageSize, so an
    // unbounded shelf (any "Continue Listening" list past pageSize items) is a guaranteed crash,
    // not a degraded result.
    private suspend fun continueListeningChildren(
        libraryId: String,
        baseUrl: String,
        page: Int,
        pageSize: Int,
    ): List<BrowseBook> {
        val shelf =
            apiClient.libraryHome(libraryId).firstOrNull {
                it.id.contains("continue", ignoreCase = true) || it.label.contains("continue", ignoreCase = true)
            } ?: return emptyList()
        return shelf.items.drop(page * pageSize).take(pageSize).map { it.toBrowseBook(baseUrl) }
    }

    // Whether the real /series endpoint actually populates `books` on this listing call (vs.
    // only on a per-series fetch) is still an open question — see docs/setup/MY_SETUP.md-style
    // real-server-shape gaps noted elsewhere in this project. 500 mirrors seriesQuerySchema's
    // own documented max (apps/server/src/routes/schemas.ts).
    //
    // Same reasoning as continueListeningChildren above applies to the page/pageSize window
    // here: librarySeries(limit = 500) paginates the list of series, not a matched series' own
    // `books` array, so there's no upstream parameter for the inner list either, and the same
    // Media3 verifyResultItems() crash is waiting for any series with more books than pageSize.
    private suspend fun seriesBooks(
        libraryId: String,
        seriesId: String,
        baseUrl: String,
        page: Int,
        pageSize: Int,
    ): List<BrowseBook> {
        val series = apiClient.librarySeries(libraryId, limit = 500).series.firstOrNull { it.id == seriesId } ?: return emptyList()
        return series.books.drop(page * pageSize).take(pageSize).map { it.toBrowseBook(baseUrl) }
    }

    private fun LibraryItem.toBrowseBook(baseUrl: String): BrowseBook =
        BrowseBook(
            id = BrowseIds.book(id),
            title = media.title,
            subtitle =
                media.authors?.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.name }
                    ?: media.author,
            coverUrl = "${baseUrl.trimEnd('/')}/api/v1/media/$id/cover?width=200",
        )
}
