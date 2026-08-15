package net.develivarr.auralis.playback

import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionError
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future
import net.develivarr.auralis.AuralisApplication

/**
 * Backs every media notification, lock-screen control and Android Auto's browse tree with a
 * real [ExoPlayer] behind a real [MediaLibrarySession]. Phase 5a built this as a
 * [MediaLibraryService] rather than a plain `MediaSessionService` specifically so that a browse
 * tree could be added later without restructuring playback — Wave E2a added that browse tree, in
 * its read-only form: browsing the root, browsing a folder's children, and looking up a single
 * item by browse id. Wave E2b made tapping a leaf item actually play: see
 * [BrowseTreeCallback.onAddMediaItems] and [PlaybackItemResolver]. Wave E2c (this one) adds voice
 * search ([BrowseTreeCallback.onSearch]/[BrowseTreeCallback.onGetSearchResult]), a spoken
 * "play <title>" request ([BrowseTreeCallback.onAddMediaItems]'s `RequestMetadata.searchQuery`
 * branch), and post-reboot playback resumption ([BrowseTreeCallback.onPlaybackResumption]).
 *
 * The player's media source factory is backed by an OkHttp [androidx.media3.datasource.DataSource.Factory]
 * wrapping [net.develivarr.auralis.AppContainer.httpClient] — the same client
 * [net.develivarr.auralis.data.network.ApiClient] and the Coil `ImageLoader` already share — so
 * ExoPlayer's range requests for a track carry the session cookie
 * [net.develivarr.auralis.data.network.SessionCookieJar] attaches. The BFF's track endpoint requires
 * that cookie like every other route; without it, streaming would 401.
 *
 * Wave F2a wraps that OkHttp factory in a [CacheDataSource.Factory] over
 * [net.develivarr.auralis.AppContainer.downloadCache] — the same
 * [androidx.media3.datasource.cache.SimpleCache] instance `Media3DownloadEngine`'s
 * `DownloadManager` writes completed downloads into — so a downloaded item plays from disk with
 * no network. That factory is built **read-only**
 * (`setCacheWriteDataSinkFactory(null)`, matching Media3's own demo app's
 * `buildReadOnlyCacheDataSource`, confirmed at the pinned 1.5.1 tag): `CacheDataSource`'s
 * default behaviour is to opportunistically write *any* streamed content into the cache it
 * reads from, and this project's cache is deliberately backed by a `NoOpCacheEvictor` (see
 * [net.develivarr.auralis.AppContainer.downloadCache]'s own doc comment — evicting a "kept offline"
 * download would defeat the whole feature). If playback wrote to that same never-evicting cache
 * on every ordinary stream, merely listening to a book — without ever tapping "download" —
 * would silently grow that cache forever, invisible to `Media3DownloadEngine.downloadsFor`
 * (which only knows about rows in `DownloadManager`'s own index, not raw cache contents). Making
 * playback's side read-only means the cache is populated by exactly one path: an explicit,
 * user-initiated download.
 *
 * [MediaLibrarySession.Callback]'s browsing methods (`onGetLibraryRoot`, `onGetChildren`,
 * `onGetItem`) are backed by [BrowseTreeRepository]; `onAddMediaItems`, `onSearch`,
 * `onGetSearchResult` and `onPlaybackResumption` are backed by [BrowseTreeRepository] and
 * [PlaybackItemResolver] together — all plain, Media3-free classes kept unit-testable with no
 * Robolectric/instrumented setup, since this project has none for `MediaLibrarySession.Callback`
 * itself. `onConnect`'s default already accepts a connecting controller and grants it every
 * available session and player command, which this wave still needs unchanged: transport control
 * (play/pause/seek/skip) from the notification and from Android Auto's transport surface.
 *
 * `onSetMediaItems` (the "tap to play, replacing the current queue" path Media3 routes
 * `Player.setMediaItem(s)` calls through) is deliberately *not* overridden. Checked directly
 * against the pinned Media3 1.5.1 tag (`MediaSession.java` in `androidx/media` at tag `1.5.1`):
 * `Callback.onSetMediaItems`'s default implementation calls `onAddMediaItems` with the same list
 * and wraps whatever it resolves in a `MediaItemsWithStartPosition` using the caller's own
 * `startIndex`/`startPositionMs` — exactly the single-item, default-position case Android Auto's
 * "tap a book" and the notification/lock-screen queue both need, so overriding
 * `onAddMediaItems` alone covers both call paths.
 */
@OptIn(UnstableApi::class)
class AuralisMediaLibraryService : MediaLibraryService() {
    private lateinit var player: ExoPlayer
    private lateinit var mediaLibrarySession: MediaLibrarySession
    private lateinit var browseTreeRepository: BrowseTreeRepository
    private lateinit var playbackItemResolver: PlaybackItemResolver

    // SupervisorJob so one failed browse call can't cancel a sibling in-flight call; Dispatchers.IO
    // because every BrowseTreeRepository call ultimately makes a blocking-style OkHttp request via
    // ApiClient's own withContext(Dispatchers.IO) — this scope just needs to be off the main thread
    // to launch from.
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        val container = (applicationContext as AuralisApplication).container
        browseTreeRepository =
            BrowseTreeRepository(container.apiClient, container.serverConfigRepository, container.downloadRepository)
        playbackItemResolver = PlaybackItemResolver(container.apiClient, container.serverConfigRepository)

        val okHttpDataSourceFactory = OkHttpDataSource.Factory(container.httpClient)
        // Read-only cache layer over the same SimpleCache Media3DownloadEngine's DownloadManager
        // writes into — see this class's own doc comment for why read-only, and
        // AppContainer.downloadCache's for why the cache is a single shared instance.
        // FLAG_IGNORE_CACHE_ON_ERROR: a corrupted or otherwise unreadable cache entry should
        // fall back to streaming over the network rather than fail playback outright, matching
        // this project's total-function house style.
        val cacheDataSourceFactory =
            CacheDataSource.Factory()
                .setCache(container.downloadCache)
                .setUpstreamDataSourceFactory(okHttpDataSourceFactory)
                .setCacheWriteDataSinkFactory(null)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        // Wrapped in DefaultDataSource.Factory, matching Media3's own recommended setup for a
        // custom network stack: the cache-then-OkHttp factory only resolves http(s) URIs, and
        // the wrapper falls back to the platform's default handling for anything else (e.g. a
        // content:// URI), so nothing but the authenticated/cached path changes.
        val dataSourceFactory = DefaultDataSource.Factory(this, cacheDataSourceFactory)
        val mediaSourceFactory = DefaultMediaSourceFactory(this).setDataSourceFactory(dataSourceFactory)

        player =
            ExoPlayer.Builder(this)
                .setMediaSourceFactory(mediaSourceFactory)
                .build()

        mediaLibrarySession =
            MediaLibrarySession.Builder(this, player, BrowseTreeCallback())
                .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
        return mediaLibrarySession
    }

    override fun onDestroy() {
        // Player before session, per Media3's own documented teardown order (see the
        // MediaLibraryService.onDestroy example in developer.android.com's "Serve content with a
        // MediaLibraryService" guide): the session holds a reference to the player, so releasing
        // it first avoids the session outliving the resource it wraps.
        player.release()
        mediaLibrarySession.release()
        serviceScope.cancel()
        super.onDestroy()
    }

    /**
     * Bridges [BrowseTreeRepository]'s and [PlaybackItemResolver]'s suspend APIs into the
     * `ListenableFuture`-based [MediaLibrarySession.Callback] contract via
     * `serviceScope.future { }` (kotlinx-coroutines-guava). `MediaItem` conversion is delegated
     * to [MediaItemConversions]'s extension functions, not done here or in
     * [BrowseTreeRepository]/[PlaybackItemResolver], so those two classes stay free of any
     * Media3 import.
     */
    private inner class BrowseTreeCallback : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            serviceScope.future<LibraryResult<MediaItem>> {
                LibraryResult.ofItem(folderMediaItem(BrowseIds.ROOT, "Auralis"), params)
            }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
            serviceScope.future<LibraryResult<ImmutableList<MediaItem>>> {
                val children =
                    if (parentId == BrowseIds.ROOT) {
                        browseTreeRepository.rootChildren()
                    } else {
                        browseTreeRepository.children(parentId, page, pageSize)
                    }
                LibraryResult.ofItemList(children.map { it.toMediaItem() }, params)
            }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            serviceScope.future<LibraryResult<MediaItem>> {
                val item = browseTreeRepository.item(mediaId)
                if (item != null) {
                    LibraryResult.ofItem(item.toMediaItem(), null)
                } else {
                    LibraryResult.ofError(SessionError.ERROR_BAD_VALUE)
                }
            }

        /**
         * Resolves each incoming [MediaItem] to a playable one. Checks
         * [MediaItem.RequestMetadata.searchQuery] first, via [resolveSearchQueryItem] — set, and
         * not `null`, on the item Android Auto sends for a spoken "play <title>" request.
         * Confirmed at the pinned Media3 1.5.1 tag
         * (`MediaSessionLegacyStub.onPlayFromSearch`/`createMediaItemForMediaRequest`): that item's
         * `mediaId` is `MediaItem.DEFAULT_MEDIA_ID` (`""`), not `null` or omitted, so `mediaId`
         * alone can never distinguish this case from an ordinary unrecognised-id item — the
         * `searchQuery` check has to come first, not as a fallback.
         *
         * Everything else keeps Wave E2b's original behaviour: an item that already carries a real
         * URI (the phone UI's own path — [net.develivarr.auralis.features.player.PlayerViewModel]
         * resolves its own items before calling `MediaController.setMediaItem`) passes through
         * unchanged, both to avoid a redundant BFF round trip and because
         * [PlaybackItemResolver.resolve] only understands browse/bare item ids, not an
         * already-playable item's own media id; anything else resolves by `mediaId`. Anything none
         * of these three paths can turn into a playable item is dropped rather than passed through
         * broken, per this project's total-function house style.
         */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> =
            serviceScope.future<MutableList<MediaItem>> {
                mediaItems.mapNotNull { item -> resolveIncomingItem(item) }.toMutableList()
            }

        private suspend fun resolveIncomingItem(item: MediaItem): MediaItem? {
            val searchQuery = item.requestMetadata.searchQuery
            return when {
                searchQuery != null -> resolveSearchQueryItem(searchQuery)
                item.localConfiguration != null -> item
                else -> playbackItemResolver.resolve(item.mediaId)?.toMediaItem()
            }
        }

        /**
         * Resolves a "play <query>" voice/text request: search (or, for a blank query — Android
         * Auto's "play"/"resume" with no title — fetch the continue-listening fallback instead),
         * hand both to [bestSearchMatch] to decide which book wins, then resolve that browse id
         * through the same [PlaybackItemResolver] every other path uses. `null` — dropping the
         * item, per [onAddMediaItems]'s own contract — when nothing matches.
         */
        private suspend fun resolveSearchQueryItem(query: String): MediaItem? {
            val results =
                if (query.isBlank()) {
                    emptyList()
                } else {
                    browseTreeRepository.search(query, page = 0, pageSize = SEARCH_PLAY_CANDIDATE_LIMIT)
                }
            val fallback = if (query.isBlank()) browseTreeRepository.mostRecentContinueListening() else null
            val match = bestSearchMatch(query, results, fallback) ?: return null
            return playbackItemResolver.resolve(match.id)?.toMediaItem()
        }

        /**
         * `onSearch`'s contract (confirmed against `MediaLibrarySessionImpl`/`MediaLibraryService`
         * at the pinned Media3 1.5.1 tag): return a [LibraryResult] for the search itself, and
         * *separately* notify the browser of how many results exist via
         * [MediaLibrarySession.notifySearchResultChanged] — the browser only calls
         * [onGetSearchResult] afterwards, using that count to decide how many pages to ask for.
         * The count here is computed by running the exact same [BrowseTreeRepository.search] query
         * [onGetSearchResult] will, windowed to effectively "everything" (`Int.MAX_VALUE`) rather
         * than duplicating the upstream call unwindowed — so the reported count and the results a
         * later [onGetSearchResult] call actually returns can never drift apart.
         */
        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<Void>> =
            serviceScope.future<LibraryResult<Void>> {
                val resultCount = browseTreeRepository.search(query, page = 0, pageSize = Int.MAX_VALUE).size
                session.notifySearchResultChanged(browser, query, resultCount, params)
                LibraryResult.ofVoid(params)
            }

        /**
         * The paginated half of search, called after [onSearch]. `page`/`pageSize` are windowed
         * by [BrowseTreeRepository.search] itself, reusing the exact client-side windowing
         * [onGetChildren] already needs for the same reason: `MediaLibrarySessionImpl`'s
         * `verifyResultItems()` (confirmed at the pinned 1.5.1 tag to gate this method with the
         * identical check it gates `onGetChildren` with) throws an uncaught
         * `IllegalStateException` on the main looper if more than `pageSize` items come back.
         */
        override fun onGetSearchResult(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
            serviceScope.future<LibraryResult<ImmutableList<MediaItem>>> {
                val results = browseTreeRepository.search(query, page, pageSize)
                LibraryResult.ofItemList(results.map { it.toMediaItem() }, params)
            }

        /**
         * Answers Android Auto's post-reboot "what was playing" request (before the phone is even
         * unlocked) with the most recent continue-listening item, resumed from its stored
         * position rather than restarted — see [ResolvedPlayback.startPositionMs] and
         * [MediaItemConversions.toMediaItemsWithStartPosition] for where that position comes from.
         * The default implementation this overrides
         * (confirmed at the pinned Media3 1.5.1 tag, `MediaSession.java`) fails the future with
         * `UnsupportedOperationException` to mean "resumption not supported"; this override
         * reproduces exactly that signal — by throwing inside the `future { }` block, which
         * `kotlinx-coroutines-guava` completes the returned future with — for the "nothing to
         * resume" case (an empty continue-listening shelf, or a resolve failure), rather than
         * inventing a different empty-result contract of its own.
         */
        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> =
            serviceScope.future<MediaSession.MediaItemsWithStartPosition> {
                val mostRecent = browseTreeRepository.mostRecentContinueListening() ?: throw UnsupportedOperationException()
                val resolved = playbackItemResolver.resolve(mostRecent.id) ?: throw UnsupportedOperationException()
                resolved.toMediaItemsWithStartPosition()
            }
    }

    private companion object {
        /**
         * How many top search matches [BrowseTreeCallback.resolveSearchQueryItem] fetches before
         * picking a winner via [bestSearchMatch] — small on purpose: only Audiobookshelf's own
         * top-ranked results are ever going to win an exact-title tie-break, and this path never
         * shows the list to the user the way [BrowseTreeCallback.onGetSearchResult] does.
         */
        const val SEARCH_PLAY_CANDIDATE_LIMIT = 5
    }
}
