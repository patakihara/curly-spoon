package net.auralis.app.playback

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
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
import net.auralis.app.AuralisApplication

/**
 * Backs every media notification, lock-screen control and Android Auto's browse tree with a
 * real [ExoPlayer] behind a real [MediaLibrarySession]. Phase 5a built this as a
 * [MediaLibraryService] rather than a plain `MediaSessionService` specifically so that a browse
 * tree could be added later without restructuring playback — Wave E2a added that browse tree, in
 * its read-only form: browsing the root, browsing a folder's children, and looking up a single
 * item by browse id. Wave E2b (this one) is what makes tapping a leaf item actually play: see
 * [BrowseTreeCallback.onAddMediaItems] and [PlaybackItemResolver]. Voice search and playback
 * resumption are still not implemented.
 *
 * The player's media source factory is backed by an OkHttp [androidx.media3.datasource.DataSource.Factory]
 * wrapping [net.auralis.app.AppContainer.httpClient] — the same client
 * [net.auralis.app.data.network.ApiClient] and the Coil `ImageLoader` already share — so
 * ExoPlayer's range requests for a track carry the session cookie
 * [net.auralis.app.data.network.SessionCookieJar] attaches. The BFF's track endpoint requires
 * that cookie like every other route; without it, streaming would 401.
 *
 * [MediaLibrarySession.Callback]'s browsing methods (`onGetLibraryRoot`, `onGetChildren`,
 * `onGetItem`) are backed by [BrowseTreeRepository]; `onAddMediaItems` is backed by
 * [PlaybackItemResolver] — both plain, Media3-free classes kept unit-testable with no
 * Robolectric/instrumented setup, since this project has none for `MediaLibrarySession.Callback`
 * itself. `onSearch`/`onGetSearchResult` are left at their defaults
 * (`LibraryResult.ofError(ERROR_NOT_SUPPORTED)`) — voice search is out of this wave's scope.
 * `onConnect`'s default already accepts a connecting controller and grants it every available
 * session and player command, which this wave still needs unchanged: transport control
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
        browseTreeRepository = BrowseTreeRepository(container.apiClient, container.serverConfigRepository)
        playbackItemResolver = PlaybackItemResolver(container.apiClient, container.serverConfigRepository)

        val okHttpDataSourceFactory = OkHttpDataSource.Factory(container.httpClient)
        // Wrapped in DefaultDataSource.Factory, matching Media3's own recommended setup for a
        // custom network stack: the OkHttp factory alone only resolves http(s) URIs, and the
        // wrapper falls back to the platform's default handling for anything else (e.g. a
        // content:// URI), so nothing but the authenticated path changes.
        val dataSourceFactory = DefaultDataSource.Factory(this, okHttpDataSourceFactory)
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
     * Bridges [BrowseTreeRepository]'s suspend API into the `ListenableFuture`-based
     * [MediaLibrarySession.Callback] contract via `serviceScope.future { }`
     * (kotlinx-coroutines-guava). `MediaItem` conversion happens here, not in
     * [BrowseTreeRepository], so that class stays free of any Media3 import.
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
         * Resolves each incoming [MediaItem] to a playable one via [PlaybackItemResolver] —
         * this is what makes tapping a browse-tree leaf (or the notification/lock-screen replaying
         * a queued item) actually start playback, rather than handing ExoPlayer an item with no
         * [MediaItem.LocalConfiguration] to open. An item that already carries a real URI (the
         * phone UI's own path — [net.auralis.app.features.player.PlayerViewModel] resolves its own
         * items before calling `MediaController.setMediaItem`) is passed through unchanged rather
         * than re-resolved, both to avoid a redundant BFF round trip and because
         * [PlaybackItemResolver.resolve] only understands browse/bare item ids, not an
         * already-playable item's own media id. Anything the resolver can't turn into a playable
         * item — an unrecognised id, a track-less item, an upstream error — is dropped rather than
         * passed through broken, per this project's total-function house style.
         */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> =
            serviceScope.future<MutableList<MediaItem>> {
                mediaItems
                    .mapNotNull { item ->
                        if (item.localConfiguration != null) {
                            item
                        } else {
                            playbackItemResolver.resolve(item.mediaId)
                        }
                    }
                    .toMutableList()
            }
    }

    private fun BrowseNode.toMediaItem(): MediaItem =
        when (this) {
            is BrowseFolder -> folderMediaItem(id, title)
            is BrowseBook -> {
                val metadata =
                    MediaMetadata.Builder()
                        .setIsBrowsable(false)
                        .setIsPlayable(true)
                        .setTitle(title)
                        .apply {
                            subtitle?.let { setSubtitle(it) }
                            coverUrl?.let { setArtworkUri(Uri.parse(it)) }
                        }
                        .build()
                MediaItem.Builder()
                    .setMediaId(id)
                    .setMediaMetadata(metadata)
                    .build()
            }
        }

    private fun folderMediaItem(
        id: String,
        title: String,
    ): MediaItem {
        val metadata =
            MediaMetadata.Builder()
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                .setTitle(title)
                .build()
        return MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(metadata)
            .build()
    }
}
