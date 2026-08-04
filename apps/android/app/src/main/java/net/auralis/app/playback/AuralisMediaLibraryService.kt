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
 * tree could be added later without restructuring playback — this wave (E2a) is that browse
 * tree, in its read-only form: browsing the root, browsing a folder's children, and looking up
 * a single item by browse id. Actually starting playback from a tapped item, voice search, and
 * playback resumption are a later wave's job (see `docs/ROADMAP.md` §7, Wave E2b) — tapping a
 * leaf [MediaItem] this service returns does not yet start playback.
 *
 * The player's media source factory is backed by an OkHttp [androidx.media3.datasource.DataSource.Factory]
 * wrapping [net.auralis.app.AppContainer.httpClient] — the same client
 * [net.auralis.app.data.network.ApiClient] and the Coil `ImageLoader` already share — so
 * ExoPlayer's range requests for a track carry the session cookie
 * [net.auralis.app.data.network.SessionCookieJar] attaches. The BFF's track endpoint requires
 * that cookie like every other route; without it, streaming would 401.
 *
 * [MediaLibrarySession.Callback]'s browsing methods (`onGetLibraryRoot`, `onGetChildren`,
 * `onGetItem`) are overridden below, backed by [BrowseTreeRepository] — a plain, Media3-free
 * class kept unit-testable with no Robolectric/instrumented setup, since this project has none
 * for `MediaLibrarySession.Callback` itself. `onSearch`/`onGetSearchResult` are left at their
 * defaults (`LibraryResult.ofError(ERROR_NOT_SUPPORTED)`) — voice search is out of this wave's
 * scope. `onConnect`'s default already accepts a connecting controller and grants it every
 * available session and player command, which this wave still needs unchanged: transport
 * control (play/pause/seek/skip) from the notification and from Android Auto's transport
 * surface.
 */
@OptIn(UnstableApi::class)
class AuralisMediaLibraryService : MediaLibraryService() {
    private lateinit var player: ExoPlayer
    private lateinit var mediaLibrarySession: MediaLibrarySession
    private lateinit var browseTreeRepository: BrowseTreeRepository

    // SupervisorJob so one failed browse call can't cancel a sibling in-flight call; Dispatchers.IO
    // because every BrowseTreeRepository call ultimately makes a blocking-style OkHttp request via
    // ApiClient's own withContext(Dispatchers.IO) — this scope just needs to be off the main thread
    // to launch from.
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        val container = (applicationContext as AuralisApplication).container
        browseTreeRepository = BrowseTreeRepository(container.apiClient, container.serverConfigRepository)

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
