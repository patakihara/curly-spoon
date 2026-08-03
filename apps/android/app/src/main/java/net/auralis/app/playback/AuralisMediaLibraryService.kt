package net.auralis.app.playback

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import net.auralis.app.AuralisApplication

/**
 * Backs every media notification, lock-screen control and (from a later wave) Android Auto's
 * browse tree with a real [ExoPlayer] behind a real [MediaLibrarySession]. Phase 5a built this
 * as a [MediaLibraryService] rather than a plain `MediaSessionService` specifically so that a
 * browse tree could be added later without restructuring playback — this wave is that
 * groundwork; it does not add browsing itself.
 *
 * The player's media source factory is backed by an OkHttp [androidx.media3.datasource.DataSource.Factory]
 * wrapping [net.auralis.app.AppContainer.httpClient] — the same client
 * [net.auralis.app.data.network.ApiClient] and the Coil `ImageLoader` already share — so
 * ExoPlayer's range requests for a track carry the session cookie
 * [net.auralis.app.data.network.SessionCookieJar] attaches. The BFF's track endpoint requires
 * that cookie like every other route; without it, streaming would 401.
 *
 * [MediaLibrarySession.Callback] is used with its defaults untouched. Every method it declares
 * (and every method its parent, `MediaSession.Callback`, declares) already has a default
 * implementation: the library-browsing methods (`onGetLibraryRoot`, `onGetChildren`,
 * `onGetItem`, `onSearch`, `onGetSearchResult`) default to `LibraryResult.ofError`
 * (`ERROR_NOT_SUPPORTED`), which is exactly the "not supported yet" behaviour this wave wants —
 * a real browse tree is separate, later scope. `onConnect`'s default already accepts a
 * connecting controller and grants it every available session and player command, which is what
 * this wave actually needs: transport control (play/pause/seek/skip) from the notification and
 * from Android Auto's transport surface, with no tree-shaped browsing behind it.
 */
@OptIn(UnstableApi::class)
class AuralisMediaLibraryService : MediaLibraryService() {
    private lateinit var player: ExoPlayer
    private lateinit var mediaLibrarySession: MediaLibrarySession

    override fun onCreate() {
        super.onCreate()
        val container = (applicationContext as AuralisApplication).container

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
            MediaLibrarySession.Builder(this, player, object : MediaLibrarySession.Callback {})
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
        super.onDestroy()
    }
}
