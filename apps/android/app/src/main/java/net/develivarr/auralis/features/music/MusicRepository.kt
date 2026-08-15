package net.develivarr.auralis.features.music

import net.develivarr.auralis.data.model.JellyfinAlbum
import net.develivarr.auralis.data.model.JellyfinArtist
import net.develivarr.auralis.data.model.JellyfinLyrics
import net.develivarr.auralis.data.model.JellyfinPlaylist
import net.develivarr.auralis.data.model.JellyfinPlaylistItem
import net.develivarr.auralis.data.model.JellyfinTrack
import net.develivarr.auralis.data.model.MusicRecommendedShelf
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException

/**
 * Whether a Jellyfin server is reachable for this user at all — the first thing any music
 * screen needs before it can show artists/albums/tracks. Distinct from [ArtistsPageResult]/
 * [AlbumsPageResult]/[TracksPageResult]'s own `Failed` cases: this is a standing precondition,
 * checked once (e.g. on screen entry), not a per-request outcome.
 */
sealed interface MusicAvailability {
    /** A Jellyfin server is configured. [hasCredentials] tells the caller whether the
     * signed-in user still needs to [MusicRepository.login] before browsing will succeed —
     * `GET /jellyfin/config` deliberately answers this without requiring a token itself. */
    data class Available(val baseUrl: String?, val hasCredentials: Boolean) : MusicAvailability

    /** No Jellyfin server has been configured on this BFF yet — nothing is wrong, there is
     * just nothing to browse and nowhere to sign in to. Matches this project's existing
     * "unconfigured is not an error" pattern for Audiobookshelf's own `GET /setup`. */
    data object Unconfigured : MusicAvailability

    /** The `GET /jellyfin/config` call itself failed — `code` is the originating
     * [ApiException.code]. */
    data class Failed(val code: String) : MusicAvailability
}

/** Outcome of [MusicRepository.login]. */
sealed interface MusicLoginResult {
    data class LoggedIn(val userName: String) : MusicLoginResult

    /** The upstream call failed; `code` is the originating [ApiException.code] — e.g.
     * `invalid_credentials` on a bad password, `jellyfin_not_configured` when no `baseUrl`
     * was given and none is stored yet. */
    data class Failed(val code: String) : MusicLoginResult
}

/**
 * Outcome of [MusicRepository.artists]. One concrete result type per call rather than a single
 * generic `MusicPageResult<T>` — deliberately: every other sealed result in this codebase
 * (`DownloadEnqueueResult`, `MyPodcastsUiState`, etc.) is non-generic, and a generic sealed
 * `Loaded<T>` forces every caller (including a test's `as? Loaded` cast) into an erased,
 * star-projected `List<*>` unless it repeats the type argument explicitly — an unchecked cast
 * for no benefit here, since each of [artists]/[albums]/[tracks] already has its own distinct
 * item type. [total] is the upstream's `TotalRecordCount`, independent of how many items this
 * page actually carries — the field a pager needs, not a count of [items].
 */
sealed interface ArtistsPageResult {
    data class Loaded(val items: List<JellyfinArtist>, val total: Int, val startIndex: Int) : ArtistsPageResult

    /** The upstream call failed; `code` is the originating [ApiException.code] — never a new,
     * repository-invented error type, matching this project's existing house style (see
     * `BrowseTreeRepository`/`DownloadRepository`). */
    data class Failed(val code: String) : ArtistsPageResult
}

/** Outcome of [MusicRepository.albums]. See [ArtistsPageResult]'s doc comment for why this is
 * its own non-generic type rather than a shared generic one. */
sealed interface AlbumsPageResult {
    data class Loaded(val items: List<JellyfinAlbum>, val total: Int, val startIndex: Int) : AlbumsPageResult

    data class Failed(val code: String) : AlbumsPageResult
}

/** Outcome of [MusicRepository.tracks]. See [ArtistsPageResult]'s doc comment for why this is
 * its own non-generic type rather than a shared generic one. */
sealed interface TracksPageResult {
    data class Loaded(val items: List<JellyfinTrack>, val total: Int, val startIndex: Int) : TracksPageResult

    data class Failed(val code: String) : TracksPageResult
}

/**
 * Outcome of [MusicRepository.recommended] (wave 13f-2 — the Android reader for the BFF's
 * `GET /music/recommended`, which had shipped with no consumer at all; see `docs/HANDOVER.md`'s
 * "wave that adds a writer must name its reader" rule). Unlike every other `Failed` case in this
 * file, a caller must **not** surface [Failed] as an error — a Jellyfin-unconfigured or
 * credential-less user gets a 409/401 here exactly as often as they would on any other
 * `/jellyfin/*` call, and this is a "nice to have" carousel, not a screen precondition. See
 * [MusicLibraryViewModel]'s use of this for how it degrades to "no shelves" rather than an error
 * state, mirroring [net.develivarr.auralis.features.home.ForYouViewModel
 * .fetchRecommendedCarousels]'s identical reasoning for the book/podcast counterpart.
 */
sealed interface MusicRecommendedResult {
    data class Loaded(val shelves: List<MusicRecommendedShelf>) : MusicRecommendedResult

    data class Failed(val code: String) : MusicRecommendedResult
}

/** Outcome of [MusicRepository.search]. */
sealed interface MusicSearchResult {
    data class Loaded(
        val artists: List<JellyfinArtist>,
        val albums: List<JellyfinAlbum>,
        val tracks: List<JellyfinTrack>,
    ) : MusicSearchResult

    data class Failed(val code: String) : MusicSearchResult
}

/** Outcome of [MusicRepository.setFavorite]. Shared by mark and unmark — both
 * [net.develivarr.auralis.data.network.ApiClient.jellyfinMarkFavorite]/`jellyfinUnmarkFavorite` return
 * the same `{ favorite }` shape, so there is no reason for two near-identical result types. */
sealed interface FavoriteToggleResult {
    /** [favorite] is the state Jellyfin actually recorded, not necessarily what was requested
     * — see [net.develivarr.auralis.data.model.JellyfinFavoriteResponse]'s own doc comment for why a
     * caller should reconcile against this value rather than assume its own request stuck. */
    data class Updated(val favorite: Boolean) : FavoriteToggleResult

    data class Failed(val code: String) : FavoriteToggleResult
}

/** Outcome of [MusicRepository.playlists]. See [ArtistsPageResult]'s doc comment for why this
 * is its own non-generic type rather than a shared generic one. */
sealed interface PlaylistsPageResult {
    data class Loaded(val items: List<JellyfinPlaylist>, val total: Int, val startIndex: Int) : PlaylistsPageResult

    data class Failed(val code: String) : PlaylistsPageResult
}

/** Outcome of [MusicRepository.playlistItems]. See [ArtistsPageResult]'s doc comment for why
 * this is its own non-generic type rather than a shared generic one. */
sealed interface PlaylistItemsPageResult {
    data class Loaded(
        val items: List<JellyfinPlaylistItem>,
        val total: Int,
        val startIndex: Int,
    ) : PlaylistItemsPageResult

    data class Failed(val code: String) : PlaylistItemsPageResult
}

/** Outcome of [MusicRepository.createPlaylist]. */
sealed interface CreatePlaylistResult {
    data class Created(val id: String) : CreatePlaylistResult

    data class Failed(val code: String) : CreatePlaylistResult
}

/** Outcome of [MusicRepository.addToPlaylist]/[MusicRepository.removeFromPlaylist] — both
 * mutate a playlist's items and respond with nothing but a status code (see
 * `routes/jellyfin.ts`'s 204 responses), so unlike [FavoriteToggleResult] there is no server
 * state to reconcile against on success; [Success] carries nothing. Shared by both methods for
 * the same reason [FavoriteToggleResult] is shared by mark/unmark — one outcome shape, two
 * dispatch sites. */
/** Outcome of [MusicRepository.reportPlaybackStart]/[reportPlaybackProgress]/
 * [reportPlaybackStopped] — one shared shape for all three, like [PlaylistMutationResult]
 * above and for the same reason (all three BFF routes are 204-on-success, no body to
 * distinguish). Not consumed by [net.develivarr.auralis.features.player.JellyfinApiPlaybackReportSender]
 * today — it treats [Failed] the same as [Success], swallowing either — but kept as a real
 * sealed result rather than a bare `Unit`/throwing suspend fun so this class's own house style
 * (every method degrades an [ApiException] into a typed result, never lets one propagate) holds
 * without exception here too. */
sealed interface PlaybackReportResult {
    data object Success : PlaybackReportResult

    data class Failed(val code: String) : PlaybackReportResult
}

sealed interface PlaylistMutationResult {
    data object Success : PlaylistMutationResult

    data class Failed(val code: String) : PlaylistMutationResult
}

/**
 * Outcome of [MusicRepository.lyrics] (Android wave J, synced lyrics view). Distinct from every
 * other result in this file: [Loaded.lyrics] is nullable *by design*, not merely absent —
 * Jellyfin having no lyrics for a track is the common case across the library (see
 * `routes/jellyfin.ts`'s own doc comment, mirrored on [ApiClient.jellyfinLyrics]), not something
 * this sealed type has a distinct case for. Only a genuine upstream/network failure reaches
 * [Failed].
 */
sealed interface LyricsResult {
    data class Loaded(val lyrics: JellyfinLyrics?) : LyricsResult

    data class Failed(val code: String) : LyricsResult
}

/**
 * Thin, testable layer over [ApiClient]'s `jellyfin*` methods — the Jellyfin-music counterpart
 * to how `BrowseTreeRepository`/`DownloadRepository` sit over the Audiobookshelf routes. No
 * Android framework type appears anywhere in this class or its return types, so it is fully
 * unit-testable on the plain JVM, same as those two.
 *
 * Every method here is total: an [ApiException] is caught and turned into the relevant sealed
 * result's `Failed(code)` case rather than left to propagate, matching this project's
 * "total functions that degrade rather than throw" house style. `code` is always
 * [ApiException.code] verbatim — never a new error type invented at this layer — so a caller
 * that already knows how to branch on BFF error codes (e.g. `upstream_auth_expired`) keeps
 * working unchanged for Jellyfin.
 *
 * No UI consumes this yet (see `docs/ROADMAP.md` §9 — Android music is a later wave); this
 * class exists so that wave's ViewModel has a stable, already-tested surface to call.
 */
class MusicRepository(private val apiClient: ApiClient) {
    /**
     * Whether Jellyfin is reachable for this user at all. `configured == false` degrades to
     * [MusicAvailability.Unconfigured] rather than [MusicAvailability.Failed] — an unconfigured
     * server answers `GET /jellyfin/config` successfully (see routes/jellyfin.ts), it just says
     * "nothing set up", so treating it as a call failure would be wrong.
     */
    suspend fun availability(): MusicAvailability =
        try {
            val config = apiClient.jellyfinConfig()
            if (config.configured) {
                MusicAvailability.Available(config.baseUrl, config.hasCredentials)
            } else {
                MusicAvailability.Unconfigured
            }
        } catch (e: ApiException) {
            MusicAvailability.Failed(e.code)
        }

    /**
     * Signs in (and, when [baseUrl] is given, configures) the shared Jellyfin connection.
     * Unlike Audiobookshelf's separate `POST /setup` + `POST /auth/login`, Jellyfin's BFF route
     * does both in one call — see `JellyfinLoginRequestBody`'s doc comment.
     */
    suspend fun login(
        username: String,
        password: String,
        baseUrl: String? = null,
    ): MusicLoginResult =
        try {
            val response = apiClient.jellyfinLogin(username, password, baseUrl)
            MusicLoginResult.LoggedIn(response.user.name)
        } catch (e: ApiException) {
            MusicLoginResult.Failed(e.code)
        }

    /** GET /jellyfin/artists, paginated. See [ApiClient.jellyfinArtists] for parameter meaning
     * — [favoritesOnly]/[id] included. */
    suspend fun artists(
        parentId: String? = null,
        startIndex: Int? = null,
        limit: Int? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
        favoritesOnly: Boolean? = null,
        id: String? = null,
    ): ArtistsPageResult =
        try {
            val page = apiClient.jellyfinArtists(parentId, startIndex, limit, sortBy, sortOrder, favoritesOnly, id)
            ArtistsPageResult.Loaded(page.items, page.total, page.startIndex)
        } catch (e: ApiException) {
            ArtistsPageResult.Failed(e.code)
        }

    /** GET /jellyfin/albums, paginated, optionally scoped to one artist. See
     * [ApiClient.jellyfinAlbums] for parameter meaning — [favoritesOnly]/[id] included. */
    suspend fun albums(
        parentId: String? = null,
        artistId: String? = null,
        startIndex: Int? = null,
        limit: Int? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
        favoritesOnly: Boolean? = null,
        id: String? = null,
    ): AlbumsPageResult =
        try {
            val page =
                apiClient.jellyfinAlbums(parentId, artistId, startIndex, limit, sortBy, sortOrder, favoritesOnly, id)
            AlbumsPageResult.Loaded(page.items, page.total, page.startIndex)
        } catch (e: ApiException) {
            AlbumsPageResult.Failed(e.code)
        }

    /** GET /jellyfin/tracks, paginated, optionally scoped to one album. See
     * [ApiClient.jellyfinTracks] for parameter meaning — [favoritesOnly] included. */
    suspend fun tracks(
        parentId: String? = null,
        albumId: String? = null,
        startIndex: Int? = null,
        limit: Int? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
        favoritesOnly: Boolean? = null,
    ): TracksPageResult =
        try {
            val page = apiClient.jellyfinTracks(parentId, albumId, startIndex, limit, sortBy, sortOrder, favoritesOnly)
            TracksPageResult.Loaded(page.items, page.total, page.startIndex)
        } catch (e: ApiException) {
            TracksPageResult.Failed(e.code)
        }

    /** GET /music/recommended — see [MusicRecommendedResult]'s doc comment for why [Failed] is
     * not to be treated as an error by callers. */
    suspend fun recommended(): MusicRecommendedResult =
        try {
            MusicRecommendedResult.Loaded(apiClient.musicRecommended())
        } catch (e: ApiException) {
            MusicRecommendedResult.Failed(e.code)
        }

    /** GET /jellyfin/search — artists, albums and tracks matching [term] in one call. */
    suspend fun search(
        term: String,
        limit: Int? = null,
    ): MusicSearchResult =
        try {
            val result = apiClient.jellyfinSearch(term, limit)
            MusicSearchResult.Loaded(result.artists, result.albums, result.tracks)
        } catch (e: ApiException) {
            MusicSearchResult.Failed(e.code)
        }

    /**
     * Marks or unmarks [itemId] as a favourite, depending on [favorite] — dispatches to
     * [ApiClient.jellyfinMarkFavorite]/[ApiClient.jellyfinUnmarkFavorite] the same way
     * `apps/web/src/api/queries.ts`'s `useToggleJellyfinFavoriteMutation` dispatches to the
     * web client's own `markJellyfinFavorite`/`unmarkJellyfinFavorite`, so both clients make the
     * identical mark-vs-unmark call for the identical intent. Works for an artist, album or
     * track id alike — Jellyfin's favourite endpoints are not scoped to one item kind.
     */
    suspend fun setFavorite(
        itemId: String,
        favorite: Boolean,
    ): FavoriteToggleResult =
        try {
            val response = if (favorite) apiClient.jellyfinMarkFavorite(itemId) else apiClient.jellyfinUnmarkFavorite(itemId)
            FavoriteToggleResult.Updated(response.favorite)
        } catch (e: ApiException) {
            FavoriteToggleResult.Failed(e.code)
        }

    /** The BFF-proxied stream URL for one track — see [ApiClient.jellyfinTrackStreamUrl]'s doc
     * comment for why this never carries a Jellyfin token. A pure URL builder, not a fetch, so
     * unlike every other method here it has nothing to catch: [ApiClient.jellyfinTrackStreamUrl]
     * never throws. */
    suspend fun trackStreamUrl(itemId: String): String = apiClient.jellyfinTrackStreamUrl(itemId)

    /** GET /jellyfin/playlists, paginated. See [ApiClient.jellyfinPlaylists] for parameter
     * meaning. */
    suspend fun playlists(
        parentId: String? = null,
        startIndex: Int? = null,
        limit: Int? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
        favoritesOnly: Boolean? = null,
        id: String? = null,
    ): PlaylistsPageResult =
        try {
            val page =
                apiClient.jellyfinPlaylists(parentId, startIndex, limit, sortBy, sortOrder, favoritesOnly, id)
            PlaylistsPageResult.Loaded(page.items, page.total, page.startIndex)
        } catch (e: ApiException) {
            PlaylistsPageResult.Failed(e.code)
        }

    /** GET /jellyfin/playlists/{playlistId}/items, paginated, in stored playlist order. See
     * [ApiClient.jellyfinPlaylistItems] for parameter meaning. */
    suspend fun playlistItems(
        playlistId: String,
        startIndex: Int? = null,
        limit: Int? = null,
    ): PlaylistItemsPageResult =
        try {
            val page = apiClient.jellyfinPlaylistItems(playlistId, startIndex, limit)
            PlaylistItemsPageResult.Loaded(page.items, page.total, page.startIndex)
        } catch (e: ApiException) {
            PlaylistItemsPageResult.Failed(e.code)
        }

    /** POST /jellyfin/playlists — creates a playlist named [name], optionally seeded with
     * [itemIds]. */
    suspend fun createPlaylist(
        name: String,
        itemIds: List<String>? = null,
    ): CreatePlaylistResult =
        try {
            CreatePlaylistResult.Created(apiClient.jellyfinCreatePlaylist(name, itemIds))
        } catch (e: ApiException) {
            CreatePlaylistResult.Failed(e.code)
        }

    /** POST /jellyfin/playlists/{playlistId}/items — appends [itemIds] (plain item ids) to the
     * end of [playlistId]. See [ApiClient.jellyfinAddToPlaylist]'s doc comment for why these are
     * item ids, not playlist-entry ids — the opposite of [removeFromPlaylist]'s own parameter. */
    suspend fun addToPlaylist(
        playlistId: String,
        itemIds: List<String>,
    ): PlaylistMutationResult =
        try {
            apiClient.jellyfinAddToPlaylist(playlistId, itemIds)
            PlaylistMutationResult.Success
        } catch (e: ApiException) {
            PlaylistMutationResult.Failed(e.code)
        }

    /** DELETE /jellyfin/playlists/{playlistId}/items — removes the given playlist entries.
     * [playlistItemIds] must be [net.develivarr.auralis.data.model.JellyfinPlaylistItem.playlistItemId]
     * values from a prior [playlistItems] call, **not** track ids — see that field's own doc
     * comment for why the distinction is load-bearing. */
    suspend fun removeFromPlaylist(
        playlistId: String,
        playlistItemIds: List<String>,
    ): PlaylistMutationResult =
        try {
            apiClient.jellyfinRemoveFromPlaylist(playlistId, playlistItemIds)
            PlaylistMutationResult.Success
        } catch (e: ApiException) {
            PlaylistMutationResult.Failed(e.code)
        }

    /** POST /jellyfin/playback/start — see [ApiClient.jellyfinReportPlaybackStart]'s doc comment.
     * [net.develivarr.auralis.features.player.JellyfinApiPlaybackReportSender] is the only caller. */
    suspend fun reportPlaybackStart(
        itemId: String,
        positionSeconds: Double,
    ): PlaybackReportResult =
        try {
            apiClient.jellyfinReportPlaybackStart(itemId, positionSeconds)
            PlaybackReportResult.Success
        } catch (e: ApiException) {
            PlaybackReportResult.Failed(e.code)
        }

    /** POST /jellyfin/playback/progress — see [ApiClient.jellyfinReportPlaybackProgress]'s doc
     * comment. */
    suspend fun reportPlaybackProgress(
        itemId: String,
        positionSeconds: Double,
        isPaused: Boolean,
    ): PlaybackReportResult =
        try {
            apiClient.jellyfinReportPlaybackProgress(itemId, positionSeconds, isPaused)
            PlaybackReportResult.Success
        } catch (e: ApiException) {
            PlaybackReportResult.Failed(e.code)
        }

    /** POST /jellyfin/playback/stopped — see [ApiClient.jellyfinReportPlaybackStopped]'s doc
     * comment. */
    suspend fun reportPlaybackStopped(
        itemId: String,
        positionSeconds: Double,
    ): PlaybackReportResult =
        try {
            apiClient.jellyfinReportPlaybackStopped(itemId, positionSeconds)
            PlaybackReportResult.Success
        } catch (e: ApiException) {
            PlaybackReportResult.Failed(e.code)
        }

    /** GET /jellyfin/tracks/{itemId}/lyrics (Android wave J). See [ApiClient.jellyfinLyrics]'s
     * doc comment for why a `null` [LyricsResult.Loaded.lyrics] is a normal outcome, not
     * [LyricsResult.Failed]. */
    suspend fun lyrics(itemId: String): LyricsResult =
        try {
            LyricsResult.Loaded(apiClient.jellyfinLyrics(itemId).lyrics)
        } catch (e: ApiException) {
            LyricsResult.Failed(e.code)
        }
}
