package net.develivarr.auralis.data.network

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import net.develivarr.auralis.data.model.ApiErrorBody
import net.develivarr.auralis.data.model.AuthUser
import net.develivarr.auralis.data.model.BookRequest
import net.develivarr.auralis.data.model.CreateMusicRequestBody
import net.develivarr.auralis.data.model.CreateRequestBody
import net.develivarr.auralis.data.model.HomeResponse
import net.develivarr.auralis.data.model.JellyfinAddToPlaylistBody
import net.develivarr.auralis.data.model.JellyfinAlbumsPage
import net.develivarr.auralis.data.model.JellyfinArtistsPage
import net.develivarr.auralis.data.model.JellyfinConfig
import net.develivarr.auralis.data.model.JellyfinCreatePlaylistBody
import net.develivarr.auralis.data.model.JellyfinCreatePlaylistResponse
import net.develivarr.auralis.data.model.JellyfinFavoriteResponse
import net.develivarr.auralis.data.model.JellyfinLoginRequestBody
import net.develivarr.auralis.data.model.JellyfinLoginResponse
import net.develivarr.auralis.data.model.JellyfinLyricsResponse
import net.develivarr.auralis.data.model.JellyfinPlaybackProgressBody
import net.develivarr.auralis.data.model.JellyfinPlaybackReportBody
import net.develivarr.auralis.data.model.JellyfinPlaylistItemsPage
import net.develivarr.auralis.data.model.JellyfinPlaylistsPage
import net.develivarr.auralis.data.model.JellyfinSearchResults
import net.develivarr.auralis.data.model.JellyfinTracksPage
import net.develivarr.auralis.data.model.Library
import net.develivarr.auralis.data.model.LibrariesResponse
import net.develivarr.auralis.data.model.LibraryItem
import net.develivarr.auralis.data.model.LibraryItemResponse
import net.develivarr.auralis.data.model.LibraryItemsPage
import net.develivarr.auralis.data.model.LoginRequestBody
import net.develivarr.auralis.data.model.LoginResponse
import net.develivarr.auralis.data.model.MeResponse
import net.develivarr.auralis.data.model.MediaProgress
import net.develivarr.auralis.data.model.MusicCandidate
import net.develivarr.auralis.data.model.MusicRequest
import net.develivarr.auralis.data.model.MusicRequestResponse
import net.develivarr.auralis.data.model.MusicRequestsResponse
import net.develivarr.auralis.data.model.MusicSearchResult
import net.develivarr.auralis.data.model.MyProgressResponse
import net.develivarr.auralis.data.model.OkResponse
import net.develivarr.auralis.data.model.PlaybackSession
import net.develivarr.auralis.data.model.PlayResponse
import net.develivarr.auralis.data.model.PodcastDirectoryResult
import net.develivarr.auralis.data.model.PodcastFeedPreview
import net.develivarr.auralis.data.model.PodcastFeedPreviewResponse
import net.develivarr.auralis.data.model.PodcastSearchResponse
import net.develivarr.auralis.data.model.PreviewPodcastFeedBody
import net.develivarr.auralis.data.model.ProviderEntry
import net.develivarr.auralis.data.model.ProvidersResponse
import net.develivarr.auralis.data.model.Release
import net.develivarr.auralis.data.model.RequestResponse
import net.develivarr.auralis.data.model.RequestSearchResult
import net.develivarr.auralis.data.model.RequestsResponse
import net.develivarr.auralis.data.model.SearchResults
import net.develivarr.auralis.data.model.SeriesPage
import net.develivarr.auralis.data.model.SetupRequestBody
import net.develivarr.auralis.data.model.SetupResult
import net.develivarr.auralis.data.model.SetupState
import net.develivarr.auralis.data.model.Shelf
import net.develivarr.auralis.data.model.SubscribePodcastBody
import net.develivarr.auralis.data.model.SubscribePodcastResponse
import net.develivarr.auralis.data.model.SyncSessionBody
import net.develivarr.auralis.data.model.auralisJson
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Talks to the Fastify BFF (`apps/server`) the same way `apps/web` does, over the session
 * cookie [SessionCookieJar] maintains. `httpClient` must already have been built with
 * `.cookieJar(cookieJar)` — that wiring happens wherever this class is constructed, not here.
 */
class ApiClient(
    private val httpClient: OkHttpClient,
    private val cookieJar: SessionCookieJar,
    /**
     * Where every request's blocking OkHttp call runs. Defaults to the real [Dispatchers.IO]
     * thread pool for production use, but a test can inject a `TestDispatcher` sharing the same
     * scheduler that drives the coroutine under test — making the request visible to `runTest`'s
     * own completion tracking instead of escaping onto a real background thread it knows nothing
     * about, which is what let a fire-and-forget caller's request outlive its test and throw
     * during a *later* test's run. Declared before [baseUrl] (rather than after) so [baseUrl]
     * stays the trailing lambda parameter at every call site — this parameter is meant to be
     * skipped by production callers, who get the default, and named explicitly by tests.
     */
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val baseUrl: suspend () -> String,
) {
    suspend fun getSetupState(): SetupState = get("/setup")

    suspend fun postSetup(baseUrl: String): SetupResult = post("/setup", SetupRequestBody(baseUrl))

    suspend fun login(
        username: String,
        password: String,
    ): LoginResponse = post("/auth/login", LoginRequestBody(username, password))

    suspend fun logout() {
        postNoBody<OkResponse>("/auth/logout")
        cookieJar.clearAll()
    }

    suspend fun me(): AuthUser = get<MeResponse>("/auth/me").user

    suspend fun libraries(): List<Library> = get<LibrariesResponse>("/libraries").libraries

    suspend fun libraryHome(libraryId: String): List<Shelf> = get<HomeResponse>("/libraries/$libraryId/home").shelves

    /** GET /libraries/{id}/items — used by Android Auto's browse tree (a later wave) to
     * list a library's items page by page. */
    suspend fun libraryItems(
        libraryId: String,
        page: Int? = null,
        limit: Int? = null,
        sort: String? = null,
        desc: Boolean? = null,
        filter: String? = null,
    ): LibraryItemsPage {
        val params =
            buildMap {
                page?.let { put("page", it.toString()) }
                limit?.let { put("limit", it.toString()) }
                sort?.let { put("sort", it) }
                desc?.let { put("desc", it.toString()) }
                filter?.let { put("filter", it) }
            }
        return get("/libraries/$libraryId/items", params)
    }

    /** GET /libraries/{id}/series — used by Android Auto's browse tree (a later wave) to
     * list a library's series. */
    suspend fun librarySeries(
        libraryId: String,
        page: Int? = null,
        limit: Int? = null,
    ): SeriesPage {
        val params =
            buildMap {
                page?.let { put("page", it.toString()) }
                limit?.let { put("limit", it.toString()) }
            }
        return get("/libraries/$libraryId/series", params)
    }

    /** GET /libraries/{id}/search — used by Android Auto's browse tree (a later wave) for
     * voice/text search within a library. */
    suspend fun searchLibrary(
        libraryId: String,
        query: String,
        limit: Int? = null,
    ): SearchResults {
        val params =
            buildMap {
                put("q", query)
                limit?.let { put("limit", it.toString()) }
            }
        return get("/libraries/$libraryId/search", params)
    }

    /** GET /items/{id} — used by Android Auto's browse tree (a later wave) to resolve a
     * single item, optionally expanded (tracks/chapters) and/or with playback progress. */
    suspend fun libraryItem(
        itemId: String,
        expanded: Boolean = false,
        includeProgress: Boolean = false,
    ): LibraryItem {
        val params =
            buildMap {
                if (expanded) put("expanded", "true")
                if (includeProgress) put("include", "progress")
            }
        return get<LibraryItemResponse>("/items/$itemId", params).item
    }

    suspend fun playItem(itemId: String): PlaybackSession = postNoBody<PlayResponse>("/items/$itemId/play").session

    /**
     * POST /items/{itemId}/play/{episodeId} — the episode-scoped counterpart to [playItem].
     * Verified against `routes/playback.ts`: this endpoint and `POST /items/{id}/play` both
     * route through the same `/sessions/{id}/sync` and `/sessions/{id}/close` handlers, so
     * the returned session's id is already scoped to the episode upstream — [syncSession]
     * and [closeSession] need no separate episode parameter, matching how `apps/web`'s
     * `playEpisode` is documented.
     */
    suspend fun playEpisode(
        itemId: String,
        episodeId: String,
    ): PlaybackSession = postNoBody<PlayResponse>("/items/$itemId/play/$episodeId").session

    suspend fun syncSession(
        sessionId: String,
        currentTime: Double,
        timeListened: Double,
        duration: Double,
    ) {
        post<SyncSessionBody, OkResponse>("/sessions/$sessionId/sync", SyncSessionBody(currentTime, timeListened, duration))
    }

    suspend fun closeSession(sessionId: String) {
        postNoBody<OkResponse>("/sessions/$sessionId/close")
    }

    /**
     * GET /me/progress — every [MediaProgress] record for the signed-in user, book and
     * podcast-episode alike (a book's record has `episodeId == null`). Audiobookshelf never
     * populates item-level progress on a podcast container — it tracks progress per
     * `(item, episode)` pair instead — so a podcast UI resolves an episode's resume position
     * by filtering this list for a matching `libraryItemId`/`episodeId` pair itself, the same
     * approach `apps/web`'s `getMyProgress`/`episodeProgress.ts` use.
     */
    suspend fun myProgress(): List<MediaProgress> = get<MyProgressResponse>("/me/progress").progress

    suspend fun audioTrackUrl(
        itemId: String,
        fileId: String,
    ): String = apiUrl("/media/$itemId/track/$fileId").toString()

    // -----------------------------------------------------------------------------
    // Podcast discovery (routes/podcasts.ts) — search, feed preview, subscribe
    // -----------------------------------------------------------------------------

    /** GET /podcasts/search — the iTunes-backed podcast directory. Not admin-gated upstream,
     * unlike [previewPodcastFeed]/[subscribePodcast]. */
    suspend fun searchPodcastDirectory(
        term: String,
        country: String? = null,
    ): List<PodcastDirectoryResult> {
        val params =
            buildMap {
                put("term", term)
                country?.let { put("country", it) }
            }
        return get<PodcastSearchResponse>("/podcasts/search", params).results
    }

    /** POST /podcasts/feed — parses an RSS feed so its episodes can be shown before
     * subscribing. Admin-gated upstream: a non-admin session gets `upstream_forbidden`
     * (403), distinct from the `upstream_auth_expired` (401) a stale session gets — a
     * non-admin user tapping "subscribe" must not be signed out as if their session expired. */
    suspend fun previewPodcastFeed(rssFeed: String): PodcastFeedPreview =
        post<PreviewPodcastFeedBody, PodcastFeedPreviewResponse>(
            "/podcasts/feed",
            PreviewPodcastFeedBody(rssFeed),
        ).preview

    /** POST /podcasts — subscribe to a previewed feed, creating a new Audiobookshelf library
     * item. Admin-gated upstream, same as [previewPodcastFeed]. */
    suspend fun subscribePodcast(body: SubscribePodcastBody): LibraryItem =
        post<SubscribePodcastBody, SubscribePodcastResponse>("/podcasts", body).item

    suspend fun searchReleases(
        term: String,
        author: String? = null,
        limit: Int? = null,
    ): RequestSearchResult {
        val params =
            buildMap {
                put("term", term)
                author?.let { put("author", it) }
                limit?.let { put("limit", it.toString()) }
            }
        return get("/requests/search", params)
    }

    suspend fun listRequests(status: String? = null): List<BookRequest> {
        val params = status?.let { mapOf("status" to it) } ?: emptyMap()
        return get<RequestsResponse>("/requests", params).requests
    }

    suspend fun createRequest(
        title: String,
        author: String? = null,
        release: Release? = null,
    ): BookRequest = post<CreateRequestBody, RequestResponse>("/requests", CreateRequestBody(title, author, release)).request

    suspend fun getRequest(id: String): BookRequest = get<RequestResponse>("/requests/$id").request

    suspend fun approveRequest(id: String): BookRequest = postNoBody<RequestResponse>("/requests/$id/approve").request

    suspend fun rejectRequest(id: String): BookRequest = postNoBody<RequestResponse>("/requests/$id/reject").request

    suspend fun retryRequest(id: String): BookRequest = postNoBody<RequestResponse>("/requests/$id/retry").request

    suspend fun grabRequest(id: String): BookRequest = postNoBody<RequestResponse>("/requests/$id/grab").request

    suspend fun deleteRequest(id: String) {
        executeNoContent(Request.Builder().url(apiUrl("/requests/$id")).delete().build())
    }

    /** GET /providers — every indexer/download-client/music-provider descriptor this build
     * knows, each paired with whatever is actually configured for it. Wave 12b-A2's
     * availability gate (`net.develivarr.auralis.features.search.SearchRequestability`) is the only
     * consumer so far. */
    suspend fun providers(): List<ProviderEntry> = get<ProvidersResponse>("/providers").providers

    // -----------------------------------------------------------------------------
    // Music requests (routes/musicRequests.ts) — Android wave K. Only search/list/create/
    // retry/delete are wired into a screen (net.develivarr.auralis.features.musicrequests); approve/
    // reject/grab are included here for parity with the book pipeline's ApiClient surface but
    // stay unused, exactly like approveRequest/rejectRequest/grabRequest above — approval
    // defaults to automatic (see docs/HANDOVER.md's phase-6 decisions) and grab already runs
    // as part of retry.
    // -----------------------------------------------------------------------------

    suspend fun searchMusicRequests(
        term: String,
        limit: Int? = null,
    ): MusicSearchResult {
        val params =
            buildMap {
                put("term", term)
                limit?.let { put("limit", it.toString()) }
            }
        return get("/music-requests/search", params)
    }

    suspend fun listMusicRequests(status: String? = null): List<MusicRequest> {
        val params = status?.let { mapOf("status" to it) } ?: emptyMap()
        return get<MusicRequestsResponse>("/music-requests", params).requests
    }

    suspend fun createMusicRequest(candidate: MusicCandidate): MusicRequest =
        post<CreateMusicRequestBody, MusicRequestResponse>("/music-requests", CreateMusicRequestBody(candidate)).request

    suspend fun getMusicRequest(id: String): MusicRequest = get<MusicRequestResponse>("/music-requests/$id").request

    suspend fun approveMusicRequest(id: String): MusicRequest =
        postNoBody<MusicRequestResponse>("/music-requests/$id/approve").request

    suspend fun rejectMusicRequest(id: String): MusicRequest =
        postNoBody<MusicRequestResponse>("/music-requests/$id/reject").request

    suspend fun retryMusicRequest(id: String): MusicRequest =
        postNoBody<MusicRequestResponse>("/music-requests/$id/retry").request

    suspend fun grabMusicRequest(id: String): MusicRequest =
        postNoBody<MusicRequestResponse>("/music-requests/$id/grab").request

    suspend fun deleteMusicRequest(id: String) {
        executeNoContent(Request.Builder().url(apiUrl("/music-requests/$id")).delete().build())
    }

    // -----------------------------------------------------------------------------
    // Jellyfin music (routes/jellyfin.ts) — Android data layer, phase 9. No screen consumes
    // these yet; see net.develivarr.auralis.features.music.MusicRepository.
    // -----------------------------------------------------------------------------

    /** GET /jellyfin/config — whether a Jellyfin server is configured at all, and whether the
     * signed-in user already has a stored access token. */
    suspend fun jellyfinConfig(): JellyfinConfig = get("/jellyfin/config")

    /**
     * POST /jellyfin/login. `baseUrl` is optional — omitted, the BFF reuses whatever a previous
     * login already configured (see `JellyfinLoginRequestBody`'s doc comment); required the very
     * first time nothing is configured yet, or to point at a different server.
     */
    suspend fun jellyfinLogin(
        username: String,
        password: String,
        baseUrl: String? = null,
    ): JellyfinLoginResponse = post("/jellyfin/login", JellyfinLoginRequestBody(baseUrl, username, password))

    /**
     * GET /jellyfin/artists — paginated. `sortOrder` is passed through verbatim, same as the
     * BFF/upstream client: `'Ascending'`/`'Descending'`, not validated client-side.
     *
     * [favoritesOnly] mirrors the BFF's own `favoritesOnly` filter — used by the favourites
     * screen to list only favourited artists. [id] is a single artist id, sent as the BFF's
     * comma-separated `ids` filter with exactly one entry — the same shape
     * `apps/web/src/api/client.ts`'s `getJellyfinArtists`' own `id` parameter already uses to
     * fetch one artist (there is no dedicated single-artist route; see that method's own doc
     * comment) for a detail screen's own favourite-state header fetch. A one-element `ids`
     * filter is not treated as empty by the BFF (`isEmptyIdsFilter` only short-circuits a
     * *zero*-element list), so this reaches `getArtists` normally rather than the BFF's
     * empty-page shortcut.
     */
    suspend fun jellyfinArtists(
        parentId: String? = null,
        startIndex: Int? = null,
        limit: Int? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
        favoritesOnly: Boolean? = null,
        id: String? = null,
    ): JellyfinArtistsPage {
        val params =
            buildMap {
                parentId?.let { put("parentId", it) }
                startIndex?.let { put("startIndex", it.toString()) }
                limit?.let { put("limit", it.toString()) }
                sortBy?.let { put("sortBy", it) }
                sortOrder?.let { put("sortOrder", it) }
                favoritesOnly?.let { put("favoritesOnly", it.toString()) }
                id?.let { put("ids", it) }
            }
        return get("/jellyfin/artists", params)
    }

    /**
     * GET /jellyfin/albums — paginated, optionally scoped to one artist via [artistId] (the
     * BFF's `albumArtistIds` filter — see `AlbumsQuery`'s doc comment in `@auralis/jellyfin-client`
     * for why album-artist rather than any-contributing-artist).
     *
     * [favoritesOnly]/[id] mirror [jellyfinArtists]'s identical parameters — see that method's
     * own doc comment for what each does and why [id] is safe against the BFF's empty-`ids`
     * shortcut.
     */
    suspend fun jellyfinAlbums(
        parentId: String? = null,
        artistId: String? = null,
        startIndex: Int? = null,
        limit: Int? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
        favoritesOnly: Boolean? = null,
        id: String? = null,
    ): JellyfinAlbumsPage {
        val params =
            buildMap {
                parentId?.let { put("parentId", it) }
                artistId?.let { put("artistId", it) }
                startIndex?.let { put("startIndex", it.toString()) }
                limit?.let { put("limit", it.toString()) }
                sortBy?.let { put("sortBy", it) }
                sortOrder?.let { put("sortOrder", it) }
                favoritesOnly?.let { put("favoritesOnly", it.toString()) }
                id?.let { put("ids", it) }
            }
        return get("/jellyfin/albums", params)
    }

    /** GET /jellyfin/tracks — paginated, optionally scoped to one album via [albumId].
     * [favoritesOnly] mirrors [jellyfinArtists]'s identical parameter — used by the favourites
     * screen to list only favourited tracks. No single-track [id] fetch exists here: unlike an
     * artist/album header, no screen in this app needs one track's favourite state fetched in
     * isolation. */
    suspend fun jellyfinTracks(
        parentId: String? = null,
        albumId: String? = null,
        startIndex: Int? = null,
        limit: Int? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
        favoritesOnly: Boolean? = null,
    ): JellyfinTracksPage {
        val params =
            buildMap {
                parentId?.let { put("parentId", it) }
                albumId?.let { put("albumId", it) }
                startIndex?.let { put("startIndex", it.toString()) }
                limit?.let { put("limit", it.toString()) }
                sortBy?.let { put("sortBy", it) }
                sortOrder?.let { put("sortOrder", it) }
                favoritesOnly?.let { put("favoritesOnly", it.toString()) }
            }
        return get("/jellyfin/tracks", params)
    }

    /** GET /jellyfin/search — artists, albums and tracks matching [term] in one call. */
    suspend fun jellyfinSearch(
        term: String,
        limit: Int? = null,
    ): JellyfinSearchResults {
        val params =
            buildMap {
                put("term", term)
                limit?.let { put("limit", it.toString()) }
            }
        return get("/jellyfin/search", params)
    }

    /** POST /jellyfin/items/{itemId}/favorite — marks `itemId` as a favourite for the signed-in
     * user. Returns the resulting favourite state (expected `true`) rather than nothing, so
     * [MusicRepository.setFavorite] reconciles against what the server actually recorded
     * instead of assuming the request it sent is the state that stuck — see
     * [JellyfinFavoriteResponse]'s own doc comment. */
    suspend fun jellyfinMarkFavorite(itemId: String): JellyfinFavoriteResponse =
        postNoBody("/jellyfin/items/$itemId/favorite")

    /** DELETE /jellyfin/items/{itemId}/favorite — unmarks `itemId` as a favourite. See
     * [jellyfinMarkFavorite]'s doc comment for why the resulting state is returned rather than
     * assumed. Built as a direct [execute] call, like [jellyfinMarkFavorite]'s underlying
     * [postNoBody], rather than [executeNoContent]: unlike [deleteRequest] this DELETE has a
     * response body to decode, not a 204. */
    suspend fun jellyfinUnmarkFavorite(itemId: String): JellyfinFavoriteResponse =
        execute(Request.Builder().url(apiUrl("/jellyfin/items/$itemId/favorite")).delete().build())

    /**
     * Builds the URL for GET /jellyfin/tracks/{itemId}/stream — a pure URL builder, like
     * [audioTrackUrl] above, not a fetch. Deliberately carries **no token**: unlike
     * `JellyfinClient.streamUrl` in `@auralis/jellyfin-client` (which embeds the upstream
     * Jellyfin access token as an `ApiKey` query parameter by that package's own design), this
     * URL points at the BFF's own proxy route, which holds the token server-side and never
     * hands it to a browser or an APK — see routes/jellyfin.ts's file doc comment.
     */
    suspend fun jellyfinTrackStreamUrl(itemId: String): String = apiUrl("/jellyfin/tracks/$itemId/stream").toString()

    /**
     * GET /jellyfin/tracks/{itemId}/lyrics (Android wave J, synced lyrics view). Mirrors
     * `routes/jellyfin.ts`'s own "Lyrics" section comment: Jellyfin's "no lyrics" 404 is folded
     * server-side into a 200 with `{ lyrics: null }`, so a `null`
     * [JellyfinLyricsResponse.lyrics] reaching here is a normal, expected outcome — never an
     * [ApiException] — the same way every other 2xx response on this class is trusted as-is.
     */
    suspend fun jellyfinLyrics(itemId: String): JellyfinLyricsResponse = get("/jellyfin/tracks/$itemId/lyrics")

    // -----------------------------------------------------------------------------
    // Jellyfin playlists (routes/jellyfin.ts) — Android wave F (music playlists). See
    // routes/jellyfin.ts's own "Playlists" section comment and `@auralis/jellyfin-client`'s
    // `schemas/raw.ts` playlists section for the source-verified upstream behaviour these
    // mirror: add keys on plain item ids, remove keys on the per-entry `playlistItemId`
    // (never a track id), and a playlist's own item order is fixed server-side (no sort
    // parameter exists for it).
    // -----------------------------------------------------------------------------

    /** GET /jellyfin/playlists — paginated, same shape as [jellyfinArtists]/[jellyfinAlbums].
     * [favoritesOnly]/[id] included for parity with those methods, though no screen in this
     * wave uses them (a playlist itself carries no favourite state — see [JellyfinPlaylist]'s
     * doc comment — so [favoritesOnly] would always report nothing back). */
    suspend fun jellyfinPlaylists(
        parentId: String? = null,
        startIndex: Int? = null,
        limit: Int? = null,
        sortBy: String? = null,
        sortOrder: String? = null,
        favoritesOnly: Boolean? = null,
        id: String? = null,
    ): JellyfinPlaylistsPage {
        val params =
            buildMap {
                parentId?.let { put("parentId", it) }
                startIndex?.let { put("startIndex", it.toString()) }
                limit?.let { put("limit", it.toString()) }
                sortBy?.let { put("sortBy", it) }
                sortOrder?.let { put("sortOrder", it) }
                favoritesOnly?.let { put("favoritesOnly", it.toString()) }
                id?.let { put("ids", it) }
            }
        return get("/jellyfin/playlists", params)
    }

    /** GET /jellyfin/playlists/{playlistId}/items — [playlistId]'s tracks in playlist order,
     * paginated. No `sortBy`/`sortOrder`/`favoritesOnly` here — see this section's own file
     * doc comment for why a playlist's order is fixed server-side. */
    suspend fun jellyfinPlaylistItems(
        playlistId: String,
        startIndex: Int? = null,
        limit: Int? = null,
    ): JellyfinPlaylistItemsPage {
        val params =
            buildMap {
                startIndex?.let { put("startIndex", it.toString()) }
                limit?.let { put("limit", it.toString()) }
            }
        return get("/jellyfin/playlists/$playlistId/items", params)
    }

    /** POST /jellyfin/playlists — creates a playlist named [name], optionally seeded with
     * [itemIds], and returns its new id. */
    suspend fun jellyfinCreatePlaylist(
        name: String,
        itemIds: List<String>? = null,
    ): String = post<JellyfinCreatePlaylistBody, JellyfinCreatePlaylistResponse>(
        "/jellyfin/playlists",
        JellyfinCreatePlaylistBody(name, itemIds),
    ).id

    /** POST /jellyfin/playlists/{playlistId}/items — appends [itemIds] (plain item ids, not
     * playlist-entry ids) to the end of [playlistId]. 204 on success, so this goes through
     * [executeNoContent] rather than [post]'s own `execute`, same as [deleteRequest]. */
    suspend fun jellyfinAddToPlaylist(
        playlistId: String,
        itemIds: List<String>,
    ) {
        val requestBody =
            auralisJson.encodeToString(JellyfinAddToPlaylistBody(itemIds))
                .toRequestBody("application/json".toMediaType())
        executeNoContent(
            Request.Builder().url(apiUrl("/jellyfin/playlists/$playlistId/items")).post(requestBody).build(),
        )
    }

    /** DELETE /jellyfin/playlists/{playlistId}/items?playlistItemIds=a,b,c — removes the given
     * playlist entries. [playlistItemIds] must be [net.develivarr.auralis.data.model.JellyfinPlaylistItem
     * .playlistItemId] values from a prior [jellyfinPlaylistItems] call, **not** track ids — see
     * that field's own doc comment. Sent comma-separated, mirroring [jellyfinArtists]'s own
     * [id] parameter's `ids` shape. 204 on success, so this goes through [executeNoContent]. */
    suspend fun jellyfinRemoveFromPlaylist(
        playlistId: String,
        playlistItemIds: List<String>,
    ) {
        val url =
            apiUrl("/jellyfin/playlists/$playlistId/items").newBuilder()
                .addQueryParameter("playlistItemIds", playlistItemIds.joinToString(","))
                .build()
        executeNoContent(Request.Builder().url(url).delete().build())
    }

    /** POST /jellyfin/playback/start — establishes [itemId] as Jellyfin's `NowPlayingItem` for
     * the signed-in session, at [positionSeconds]. 204 on success, so this goes through
     * [executeNoContent], same as [jellyfinAddToPlaylist]. See
     * `net.develivarr.auralis.features.player.JellyfinPlaybackReporter`'s own doc comment for when this
     * fires relative to [jellyfinReportPlaybackProgress]/[jellyfinReportPlaybackStopped]. */
    suspend fun jellyfinReportPlaybackStart(
        itemId: String,
        positionSeconds: Double,
    ) {
        val requestBody =
            auralisJson.encodeToString(JellyfinPlaybackReportBody(itemId, positionSeconds))
                .toRequestBody("application/json".toMediaType())
        executeNoContent(Request.Builder().url(apiUrl("/jellyfin/playback/start")).post(requestBody).build())
    }

    /** POST /jellyfin/playback/progress — reports [itemId]'s current position and pause state.
     * [isPaused] has no default here (unlike the BFF's own optional field): the caller is always
     * `JellyfinPlaybackReporter`, which always knows the real play state, and an implicit
     * "unspecified" would risk silently repeating the exact bug this route exists to avoid — a
     * paused track that Jellyfin keeps showing as playing. 204 on success. */
    suspend fun jellyfinReportPlaybackProgress(
        itemId: String,
        positionSeconds: Double,
        isPaused: Boolean,
    ) {
        val requestBody =
            auralisJson.encodeToString(JellyfinPlaybackProgressBody(itemId, positionSeconds, isPaused))
                .toRequestBody("application/json".toMediaType())
        executeNoContent(Request.Builder().url(apiUrl("/jellyfin/playback/progress")).post(requestBody).build())
    }

    /** POST /jellyfin/playback/stopped — closes out [itemId]'s Jellyfin `NowPlayingItem` at
     * [positionSeconds], the position resume picks up from next time. 204 on success. */
    suspend fun jellyfinReportPlaybackStopped(
        itemId: String,
        positionSeconds: Double,
    ) {
        val requestBody =
            auralisJson.encodeToString(JellyfinPlaybackReportBody(itemId, positionSeconds))
                .toRequestBody("application/json".toMediaType())
        executeNoContent(Request.Builder().url(apiUrl("/jellyfin/playback/stopped")).post(requestBody).build())
    }

    private suspend fun apiUrl(path: String): HttpUrl = "${baseUrl().trimEnd('/')}/api/v1$path".toHttpUrl()

    private suspend inline fun <reified T> get(
        path: String,
        queryParams: Map<String, String> = emptyMap(),
    ): T {
        val url =
            apiUrl(path).newBuilder().apply {
                queryParams.forEach { (key, value) -> addQueryParameter(key, value) }
            }.build()
        return execute(Request.Builder().url(url).get().build())
    }

    private suspend inline fun <reified B, reified T> post(
        path: String,
        body: B,
    ): T {
        val requestBody =
            auralisJson.encodeToString(body)
                .toRequestBody("application/json".toMediaType())
        return execute(Request.Builder().url(apiUrl(path)).post(requestBody).build())
    }

    private suspend inline fun <reified T> postNoBody(path: String): T =
        execute(Request.Builder().url(apiUrl(path)).post(ByteArray(0).toRequestBody(null)).build())

    private suspend inline fun <reified T> execute(request: Request): T =
        withContext(ioDispatcher) {
            var status = 0
            try {
                httpClient.newCall(request).execute().use { response ->
                    status = response.code
                    val bodyString = response.body?.string().orEmpty()
                    if (!response.isSuccessful) throw apiExceptionFromErrorBody(bodyString, response.code)
                    auralisJson.decodeFromString<T>(bodyString)
                }
            } catch (e: IOException) {
                throw ApiException("network_error", "Could not reach the Auralis server: ${e.message}", 0)
            } catch (e: SerializationException) {
                // A 2xx response whose body doesn't match the expected shape — same
                // "unexpected_response" treatment as an undecodable non-2xx error body.
                throw ApiException("unexpected_response", "Unexpected response from the server (HTTP $status)", status)
            }
        }

    /**
     * Like [execute], but for the one response with no body at all (`DELETE /requests/:id`'s
     * 204) — decoding an empty string as JSON would throw, so this variant only checks the
     * status and never calls into `auralisJson`.
     */
    private suspend fun executeNoContent(request: Request) =
        withContext(ioDispatcher) {
            try {
                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        throw apiExceptionFromErrorBody(response.body?.string().orEmpty(), response.code)
                    }
                }
            } catch (e: IOException) {
                throw ApiException("network_error", "Could not reach the Auralis server: ${e.message}", 0)
            }
        }

    private fun apiExceptionFromErrorBody(
        body: String,
        status: Int,
    ): ApiException {
        if (body.isNotEmpty()) {
            try {
                val parsed = auralisJson.decodeFromString<ApiErrorBody>(body)
                return ApiException(parsed.error.code, parsed.error.message, status)
            } catch (e: SerializationException) {
                // fall through — body wasn't the expected error shape
            }
        }
        return ApiException("unexpected_response", "Unexpected response from the server (HTTP $status)", status)
    }
}
