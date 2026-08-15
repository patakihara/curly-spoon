package net.develivarr.auralis.playback

import net.develivarr.auralis.data.downloads.DownloadRepository
import net.develivarr.auralis.data.downloads.DownloadState
import net.develivarr.auralis.data.model.LibraryItem
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.data.settings.ServerConfigRepository

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
    const val DOWNLOADED = "downloaded"
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
 * Ships `Continue`/`Books`/`Series`/`Downloaded`. The first three shipped without a `Downloaded`
 * node in Wave E2a, deliberately, because no offline-downloads feature existed anywhere in
 * `apps/android` at the time; Wave F2b adds it now that one does — see [downloadedChildren]'s own
 * doc comment for what counts as "downloaded" there. [downloadRepository] stays [DownloadRepository]
 * for the same reason [apiClient] stays [ApiClient]: both are Media3-free, so this class remains
 * fully unit-testable with no Robolectric/instrumented setup.
 */
class BrowseTreeRepository(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
    private val downloadRepository: DownloadRepository,
) {
    suspend fun rootChildren(): List<BrowseFolder> =
        listOf(
            BrowseFolder(BrowseIds.CONTINUE, "Continue Listening"),
            BrowseFolder(BrowseIds.BOOKS, "Books"),
            BrowseFolder(BrowseIds.SERIES, "Series"),
            BrowseFolder(BrowseIds.DOWNLOADED, "Downloaded"),
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
            parentId == BrowseIds.DOWNLOADED -> downloadedChildren(baseUrl, page, pageSize)
            else -> emptyList()
        }
    }

    /**
     * Text/voice search across the current library's books, mapped to the same [BrowseBook]
     * shape the rest of this class uses so search results and browsed items convert through the
     * identical [MediaItemConversions] mapper. Backs both
     * [AuralisMediaLibraryService]'s `onSearch`/`onGetSearchResult` (typed/spoken search) and its
     * `onAddMediaItems` handling of a `RequestMetadata.searchQuery` item (a spoken "play <title>"
     * request, resolved via [bestSearchMatch]) — the same upstream call answers both.
     *
     * Windowed to [pageSize] client-side, exactly like [continueListeningChildren] and
     * [seriesBooks] above: `GET /libraries/{id}/search` has no page parameter of its own, and —
     * confirmed by reading `MediaLibrarySessionImpl` at the pinned Media3 1.5.1 tag —
     * `onGetSearchResult` is gated by the *exact same* `verifyResultItems()` pageSize check that
     * made `onGetChildren`'s windowing mandatory, not optional (see that method's own comment).
     * An unbounded result list here would crash `onGetSearchResult` the same way an unbounded
     * shelf once crashed `onGetChildren`.
     *
     * Degrades to `emptyList()` for a blank query (nothing to search for) or any [ApiException],
     * matching this class's existing total-function style — and specifically what lets a blank
     * spoken query fall through to [mostRecentContinueListening] in the caller instead of
     * surfacing an error.
     */
    suspend fun search(
        query: String,
        page: Int,
        pageSize: Int,
    ): List<BrowseBook> {
        if (query.isBlank()) return emptyList()
        return try {
            searchOrThrow(query, page, pageSize)
        } catch (e: ApiException) {
            emptyList()
        }
    }

    private suspend fun searchOrThrow(
        query: String,
        page: Int,
        pageSize: Int,
    ): List<BrowseBook> {
        val baseUrl = serverConfigRepository.getBaseUrl() ?: return emptyList()
        val libraryId = apiClient.libraries().firstOrNull()?.id ?: return emptyList()
        return apiClient.searchLibrary(libraryId, query)
            .books.drop(page * pageSize).take(pageSize).map { it.toBrowseBook(baseUrl) }
    }

    /**
     * The single most recently listened-to book, for Android Auto's post-reboot playback
     * resumption ([AuralisMediaLibraryService]'s `onPlaybackResumption`) and for a spoken
     * "play"/"resume" request with no title in it (a blank `RequestMetadata.searchQuery`,
     * handled in [AuralisMediaLibraryService]'s `onAddMediaItems` via [bestSearchMatch]). A thin
     * wrapper over [children]'s existing [BrowseIds.CONTINUE] handling with `pageSize = 1`, so
     * "most recent" stays defined in exactly one place — the shelf's own item order — rather
     * than gaining a second, possibly-diverging definition here.
     */
    suspend fun mostRecentContinueListening(): BrowseBook? =
        children(BrowseIds.CONTINUE, page = 0, pageSize = 1).firstOrNull() as? BrowseBook

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

    /**
     * Only items whose [net.develivarr.auralis.data.downloads.DownloadSummary.state] is
     * [DownloadState.COMPLETED] — every track finished, not merely "downloading" or "kept
     * offline but partially failed" — appear here. This is deliberately stricter than
     * [DownloadRepository.keptOfflineItemIds] alone: signal is worst exactly where a car is,
     * which is this node's whole reason to exist, so listing an item that isn't actually fully
     * on disk yet would let a driver tap it expecting offline playback and get nothing. A
     * still-downloading item simply doesn't appear here until it finishes; it's never hidden
     * from the phone app's own downloads screen, which shows in-progress state deliberately.
     *
     * Sorted by item id for a stable, deterministic order across pages — [DownloadSummary]
     * carries no title to sort by without an extra network round trip per item, and
     * [DownloadRepository] has no other ordering of its own to borrow.
     *
     * Windowed to [pageSize] client-side, exactly like every other node in this class: an
     * unbounded result crashes `onGetChildren` on the main looper (see [seriesBooks]'s own
     * comment on `verifyResultItems()`).
     */
    private suspend fun downloadedChildren(
        baseUrl: String,
        page: Int,
        pageSize: Int,
    ): List<BrowseBook> {
        val completedItemIds =
            downloadRepository.downloadSummaries()
                .filter { it.state == DownloadState.COMPLETED }
                .map { it.itemId }
                .sorted()
        return completedItemIds.drop(page * pageSize).take(pageSize).mapNotNull { itemId ->
            try {
                apiClient.libraryItem(itemId).toBrowseBook(baseUrl)
            } catch (e: ApiException) {
                // One item's lookup failing (deleted upstream since it was downloaded, a
                // transient network blip) shouldn't blank the whole node — skip it, matching
                // this class's existing total-function style elsewhere.
                null
            }
        }
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

/**
 * Picks what a "play <query>" voice/text request should actually play — the decidable half of
 * [AuralisMediaLibraryService]'s handling of a `MediaItem` whose `RequestMetadata.searchQuery`
 * is set (see `MediaSessionLegacyStub.onPlayFromSearch` at the pinned Media3 1.5.1 tag: `mediaId`
 * is `MediaItem.DEFAULT_MEDIA_ID`, i.e. `""`, in that case, so `mediaId` alone can never carry
 * this). [searchResults] is the caller's own already-fetched, already-windowed
 * [BrowseTreeRepository.search] output for a non-blank [query]; [continueListeningFallback] is
 * only ever consulted when [query] is blank — Android Auto's "play"/"resume" without a title —
 * and is the same [BrowseTreeRepository.mostRecentContinueListening] result
 * `onPlaybackResumption` falls back to after a reboot.
 *
 * An exact, case-insensitive title match wins over Audiobookshelf's own relevance ordering: a
 * user who speaks the *exact* title of a book almost certainly wants that book, even over a
 * differently-titled result the server ranks higher. Failing an exact match, the first (most
 * relevant) result stands. `null` when there is nothing to play at all — no search results and
 * no fallback.
 */
fun bestSearchMatch(
    query: String,
    searchResults: List<BrowseBook>,
    continueListeningFallback: BrowseBook?,
): BrowseBook? =
    if (query.isBlank()) {
        continueListeningFallback
    } else {
        searchResults.firstOrNull { it.title.equals(query, ignoreCase = true) }
            ?: searchResults.firstOrNull()
    }
