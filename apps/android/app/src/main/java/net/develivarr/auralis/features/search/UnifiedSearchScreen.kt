package net.develivarr.auralis.features.search

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.PopupProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import coil.ImageLoader
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.data.model.MusicCandidate
import net.develivarr.auralis.data.model.Release
import net.develivarr.auralis.features.music.MusicRow
import net.develivarr.auralis.features.music.MusicSearchTrackUi
import net.develivarr.auralis.features.musicrequests.CandidateRequestState
import net.develivarr.auralis.features.requests.ReleaseRequestState
import net.develivarr.auralis.features.requests.TitleRequestState
import net.develivarr.auralis.navigation.Routes
import java.util.Locale

/**
 * Unified search across books, podcasts and music (`docs/ROADMAP.md` §12b/12b-A1/12b-A2) —
 * the Android counterpart to `apps/web/src/features/search/SearchPage.tsx`. Reached from the
 * shell's "Search" destination (`Routes.MUSIC_SEARCH`, still that route string despite the
 * rename — see 12b-A1's own report for why changing it wasn't warranted).
 *
 * Two chip rows, mirroring [SearchFilterState]'s own doc comment: a primary row (All / Music /
 * Books / Podcasts) always shown, and a secondary row that only appears once a specific
 * content type is selected, its options depending on which one. With nothing selected, every
 * kind renders, grouped by content type in this fixed order: Books, Series, Authors, Podcasts,
 * Artists, Albums, Tracks — omitting any section with nothing in it, the same "no empty
 * headers" choice `MusicSearchScreen.kt`'s own search results section already makes.
 *
 * Navigation per kind: books open [net.develivarr.auralis.navigation.Routes.bookDetail] (wave
 * 16e-search-A — `Routes.bookDetail` landed with `16e-book-A` and this row was a dead tap target
 * behind a since-stale comment until now); podcasts open
 * [net.develivarr.auralis.navigation.Routes.podcastDetail]; music artists/albums open their
 * existing detail routes; a music track opens its album, same non-interactive-when-no-album-id
 * treatment as `MusicSearchScreen.kt`'s own `SearchTrackRow`. **Series and authors still have no
 * detail route anywhere in this app** (confirmed by reading `AuralisNavHost.kt`'s `Routes`
 * object), so those two kinds render as plain, non-interactive rows rather than as dead tap
 * targets, and are excluded from suggestions entirely too — see [SearchSeriesUi]/
 * [SearchAuthorUi]'s own doc comments and [deriveSearchSuggestions]'s.
 *
 * **16e-search-A adds a typeahead suggestion dropdown** ([UnifiedSearchQueryArea],
 * [deriveSearchSuggestions]) and a live-region status line ([unifiedSearchStatus]) — see
 * `docs/design/screens/SEARCH.md` §6.2/§6.4 for the shared behaviour contract both platforms
 * build to.
 *
 * **12b-A2 adds two "Available to request" groups** — non-library books and music, clearly
 * separated from the library sections above by their own heading, mirroring
 * `apps/web/src/features/search/RequestableBooksSection.tsx`/`RequestableMusicSection.tsx`.
 * Each is gated on **both** [VisibleKinds] (the current chip selection — the same gate the
 * library sections above use) **and** [UnifiedSearchViewModel]'s own availability check
 * ([canRequestBooks]/[hasEnabledMusicProvider]); see [requestableBooksSection]/
 * [requestableMusicSection]'s own doc comments for the exact rendering rules. Neither group
 * ever de-duplicates against the library results above it — a title already on the shelf still
 * renders as requestable, the same undecided-but-consistent choice web's 12b-2 made (queue
 * `440b217`).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UnifiedSearchScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: UnifiedSearchViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer {
                        UnifiedSearchViewModel(
                            container.apiClient,
                            container.musicRepository,
                            container.serverConfigRepository,
                        )
                    }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    val visible = visibleKinds(uiState.filters.primary, uiState.filters.secondary)
    val secondaryOptions = secondaryFilterOptions(uiState.filters.primary)
    // Both derived here, every recomposition, from uiState alone — cheap pure functions, no
    // memoisation needed. See SearchStatus.kt/SearchSuggestions.kt's own doc comments.
    val resultsState = uiState.resultsState
    val statusText =
        unifiedSearchStatus(
            libraryUnconfigured = uiState.libraryUnconfigured,
            query = uiState.query,
            trimmedQuery = uiState.query.trim(),
            isLoading = resultsState is UnifiedSearchResultsUiState.Searching,
            counts =
                if (resultsState is UnifiedSearchResultsUiState.Results) {
                    UnifiedSearchStatusCounts(
                        books = resultsState.books.size,
                        podcasts = resultsState.podcasts.size,
                        artists = resultsState.artists.size,
                        albums = resultsState.albums.size,
                        tracks = resultsState.tracks.size,
                    )
                } else {
                    UnifiedSearchStatusCounts()
                },
        )
    val suggestions =
        if (resultsState is UnifiedSearchResultsUiState.Results) {
            deriveSearchSuggestions(resultsState)
        } else {
            emptyList()
        }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Search") }) },
    ) { innerPadding ->
        LazyColumn(
            modifier =
                Modifier.fillMaxSize()
                    .padding(innerPadding)
                    .padding(horizontal = 16.dp),
        ) {
            item {
                UnifiedSearchQueryArea(
                    query = uiState.query,
                    onQueryChange = viewModel::onQueryChange,
                    statusText = statusText,
                    suggestions = suggestions,
                    onSelectSuggestion = { suggestion ->
                        // (1) of §6.2's "Selection" rule — the plain title, not the decorated
                        // "· Kind" label, so the field and the still-visible results list below
                        // stay coherent if the user navigates back.
                        viewModel.onQueryChange(suggestion.title)
                        // (2) — the same route that kind's row in the full results list below
                        // already navigates to. No new routes.
                        when (val target = suggestion.target) {
                            is SearchSuggestionTarget.Book -> navController.navigate(Routes.bookDetail(target.id))
                            is SearchSuggestionTarget.Podcast ->
                                navController.navigate(Routes.podcastDetail(target.id))
                            is SearchSuggestionTarget.Artist ->
                                navController.navigate(Routes.musicArtistDetail(target.id))
                            is SearchSuggestionTarget.Album ->
                                navController.navigate(Routes.musicAlbumDetail(target.id))
                            is SearchSuggestionTarget.TrackAlbum ->
                                navController.navigate(Routes.musicAlbumDetail(target.albumId))
                        }
                    },
                )
            }
            item {
                Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    PRIMARY_FILTER_OPTIONS.forEach { option ->
                        FilterChip(
                            selected = uiState.filters.primary == option.value,
                            onClick = { viewModel.selectPrimaryFilter(option.value) },
                            label = { Text(option.label) },
                            modifier = Modifier.padding(end = 8.dp),
                        )
                    }
                }
            }
            if (secondaryOptions.isNotEmpty()) {
                item {
                    Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        secondaryOptions.forEach { option ->
                            FilterChip(
                                selected = uiState.filters.secondary == option.value,
                                onClick = { viewModel.selectSecondaryFilter(option.value) },
                                label = { Text(option.label) },
                                modifier = Modifier.padding(end = 8.dp),
                            )
                        }
                    }
                }
            }
            searchResultsSection(
                state = uiState.resultsState,
                visible = visible,
                imageLoader = container.imageLoader,
                onOpenBook = { itemId -> navController.navigate(Routes.bookDetail(itemId)) },
                onOpenPodcast = { itemId -> navController.navigate(Routes.podcastDetail(itemId)) },
                onOpenArtist = { artistId -> navController.navigate(Routes.musicArtistDetail(artistId)) },
                onOpenAlbum = { albumId -> navController.navigate(Routes.musicAlbumDetail(albumId)) },
                requestableBooksState = uiState.requestableBooksState,
                requestableMusicState = uiState.requestableMusicState,
                query = uiState.query,
                onRequestRelease = viewModel::requestRelease,
                onRequestAnyway = viewModel::requestAnyway,
                onRequestCandidate = viewModel::requestCandidate,
            )
        }
    }
}

/** `internal`, not `private`, so [UnifiedSearchScreenTest] can compose it directly against
 * plain state inside its own `LazyColumn`, without an [AppContainer]/ViewModel/
 * `NavHostController` — the same "Content" split `BookDetailContent`/`PodcastDetailContent`/
 * `AlbumDetailContent` already establish for their own screens. */
internal fun LazyListScope.searchResultsSection(
    state: UnifiedSearchResultsUiState,
    visible: VisibleKinds,
    imageLoader: ImageLoader,
    onOpenBook: (String) -> Unit,
    onOpenPodcast: (String) -> Unit,
    onOpenArtist: (String) -> Unit,
    onOpenAlbum: (String) -> Unit,
    requestableBooksState: RequestableBooksUiState,
    requestableMusicState: RequestableMusicUiState,
    query: String,
    onRequestRelease: (Release) -> Unit,
    onRequestAnyway: () -> Unit,
    onRequestCandidate: (MusicCandidate) -> Unit,
) {
    when (state) {
        // Inviting, not "no results" — no search has actually run yet.
        is UnifiedSearchResultsUiState.Idle ->
            item {
                Text(
                    "Search your library and connected Jellyfin server.",
                    modifier = Modifier.padding(top = 24.dp),
                )
            }
        is UnifiedSearchResultsUiState.Searching ->
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        is UnifiedSearchResultsUiState.Results -> {
            // The library and music sides degrade independently (see UnifiedSearchViewModel's
            // own doc comment) — an error on one side is shown as a small inline note above
            // that side's (empty) section, never as a full-screen error blocking the other
            // side's real results.
            if (state.libraryError != null) {
                item {
                    Text(
                        "Couldn't search your library right now.",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }
            }
            if (visible.books && state.books.isNotEmpty()) {
                sectionHeader("Books")
                items(state.books, key = { "book:${it.id}" }) { book ->
                    MusicRow(
                        title = book.title,
                        subtitle = book.subtitle,
                        coverUrl = book.coverUrl,
                        imageLoader = imageLoader,
                        // Routes.bookDetail(itemId) exists (16e-book-A) — this row used to be a
                        // dead tap target behind a since-stale "no route exists" comment.
                        onClick = { onOpenBook(book.id) },
                        artSize = SEARCH_ROW_ART_SIZE,
                        artCornerRadius = SEARCH_ROW_ART_RADIUS,
                        fallbackIcon = Icons.AutoMirrored.Filled.MenuBook,
                    )
                }
            }
            if (visible.books) {
                requestableBooksSection(requestableBooksState, query, onRequestRelease, onRequestAnyway)
            }
            if (visible.series && state.series.isNotEmpty()) {
                sectionHeader("Series")
                items(state.series, key = { "series:${it.id}" }) { series ->
                    Text(series.name, modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp))
                }
            }
            if (visible.authors && state.authors.isNotEmpty()) {
                sectionHeader("Authors")
                items(state.authors, key = { "author:${it.id}" }) { author ->
                    Text(author.name, modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp))
                }
            }
            if (visible.podcasts && state.podcasts.isNotEmpty()) {
                sectionHeader("Podcasts")
                items(state.podcasts, key = { "podcast:${it.id}" }) { podcast ->
                    MusicRow(
                        title = podcast.title,
                        subtitle = null,
                        coverUrl = podcast.coverUrl,
                        imageLoader = imageLoader,
                        onClick = { onOpenPodcast(podcast.id) },
                        artSize = SEARCH_ROW_ART_SIZE,
                        artCornerRadius = SEARCH_ROW_ART_RADIUS,
                        fallbackIcon = Icons.Filled.Podcasts,
                    )
                }
            }
            if (state.musicError != null) {
                item {
                    Text(
                        "Couldn't search Jellyfin right now.",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }
            }
            if (visible.artists && state.artists.isNotEmpty()) {
                sectionHeader("Artists")
                items(state.artists, key = { "artist:${it.id}" }) { artist ->
                    MusicRow(
                        title = artist.name,
                        subtitle = null,
                        coverUrl = artist.coverUrl,
                        imageLoader = imageLoader,
                        onClick = { onOpenArtist(artist.id) },
                        artSize = SEARCH_ROW_ART_SIZE,
                        artCornerRadius = SEARCH_ROW_ART_RADIUS,
                        fallbackIcon = Icons.Filled.MusicNote,
                    )
                }
            }
            if (visible.albums && state.albums.isNotEmpty()) {
                sectionHeader("Albums")
                items(state.albums, key = { "album:${it.id}" }) { album ->
                    MusicRow(
                        title = album.name,
                        subtitle = album.artistName,
                        coverUrl = album.coverUrl,
                        imageLoader = imageLoader,
                        onClick = { onOpenAlbum(album.id) },
                        artSize = SEARCH_ROW_ART_SIZE,
                        artCornerRadius = SEARCH_ROW_ART_RADIUS,
                        fallbackIcon = Icons.Filled.MusicNote,
                    )
                }
            }
            if (visible.tracks && state.tracks.isNotEmpty()) {
                sectionHeader("Tracks")
                items(state.tracks, key = { "track:${it.id}" }) { track ->
                    SearchResultTrackRow(track = track, onOpenAlbum = onOpenAlbum)
                }
            }
            if (visible.artists || visible.albums || visible.tracks) {
                requestableMusicSection(requestableMusicState, onRequestCandidate)
            }
            if (state.isEmpty && state.libraryError == null && state.musicError == null) {
                item { Text("No matches found.", modifier = Modifier.padding(top = 24.dp)) }
            }
        }
    }
}

/**
 * The "Available to request" books group (12b-A2). Renders nothing for
 * [RequestableBooksUiState.Idle] (either nothing typed, or the server has no usable
 * indexer+download-client pair — [UnifiedSearchViewModel] never even searched) and nothing for
 * a settled [RequestableBooksUiState.Loaded] with zero releases *and* no "request anyway" to
 * offer — same "no empty heading" choice `RequestableBooksSection.tsx` makes. A
 * [RequestableBooksUiState.Loading] section *does* render, with its own spinner — unlike the
 * web reference, which shows nothing while loading — because this screen's whole point is that
 * library results must visibly not be waiting on this section: see [UnifiedSearchViewModel]'s
 * own doc comment on why the two are independent fan-outs.
 */
private fun LazyListScope.requestableBooksSection(
    state: RequestableBooksUiState,
    query: String,
    onRequestRelease: (Release) -> Unit,
    onRequestAnyway: () -> Unit,
) {
    when (state) {
        is RequestableBooksUiState.Idle -> Unit
        is RequestableBooksUiState.Loading -> {
            sectionHeader("Available to request")
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
        is RequestableBooksUiState.Loaded -> {
            if (state.releases.isEmpty() && !state.offerRequestAnyway) return
            sectionHeader("Available to request")
            if (state.error != null) {
                item {
                    Text(
                        "Couldn't search for requestable titles right now.",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
            items(state.releases, key = { "requestable-book:${it.guid}" }) { release ->
                RequestableReleaseRow(
                    release = release,
                    requestState = state.releaseStates[release.guid] ?: ReleaseRequestState.Idle,
                    onRequest = { onRequestRelease(release) },
                )
            }
            if (state.offerRequestAnyway) {
                item {
                    RequestAnywayRow(
                        term = query.trim(),
                        titleRequestState = state.titleRequestState,
                        onRequestAnyway = onRequestAnyway,
                    )
                }
            }
        }
    }
}

/** The "Available to request" music group (12b-A2). See [requestableBooksSection]'s doc
 * comment — identical rendering rules, minus "request anyway": a [MusicCandidate] is one
 * specific file held by one specific peer right now, so there is nothing to fall back to when
 * nothing matches (see [UnifiedSearchViewModel.requestCandidate]'s own doc comment). */
private fun LazyListScope.requestableMusicSection(
    state: RequestableMusicUiState,
    onRequestCandidate: (MusicCandidate) -> Unit,
) {
    when (state) {
        is RequestableMusicUiState.Idle -> Unit
        is RequestableMusicUiState.Loading -> {
            sectionHeader("Available to request")
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
        is RequestableMusicUiState.Loaded -> {
            if (state.candidates.isEmpty()) return
            sectionHeader("Available to request")
            if (state.error != null) {
                item {
                    Text(
                        "Couldn't search Soulseek right now.",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
            items(state.candidates, key = { "requestable-music:${it.guid}" }) { candidate ->
                RequestableCandidateRow(
                    candidate = candidate,
                    requestState = state.candidateStates[candidate.guid] ?: CandidateRequestState.Idle,
                    grabWarning = state.grabWarnings[candidate.guid],
                    onRequest = { onRequestCandidate(candidate) },
                )
            }
        }
    }
}

/** One requestable book release. Mirrors `features/requests/RequestsScreen.kt`'s own
 * `ReleaseRow` at every level that carries over (same Idle→Pending→Requested/Failed row
 * shape) rather than being imported from it — that file is out of scope for this wave to
 * touch, per its own "do not touch" list, and its row composable is private besides. */
@Composable
private fun RequestableReleaseRow(
    release: Release,
    requestState: ReleaseRequestState,
    onRequest: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(release.title, style = MaterialTheme.typography.titleSmall)
        Text("${release.sourceName} • ${formatBytes(release.sizeBytes)} • ${release.seeders} seeders")
        when (requestState) {
            is ReleaseRequestState.Idle ->
                Button(onClick = onRequest, modifier = Modifier.padding(top = 4.dp)) { Text("Request") }
            is ReleaseRequestState.Pending ->
                Button(onClick = {}, enabled = false, modifier = Modifier.padding(top = 4.dp)) { Text("Requesting…") }
            is ReleaseRequestState.Requested ->
                Text("Requested", modifier = Modifier.padding(top = 4.dp))
            is ReleaseRequestState.Failed -> {
                Text(
                    text = requestState.message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Button(onClick = onRequest, modifier = Modifier.padding(top = 4.dp)) { Text("Request") }
            }
        }
    }
}

/** "Request anyway" — queues [term] with no release attached. Mirrors
 * `features/requests/RequestsScreen.kt`'s own `RequestAnywaySection`, not reused for the same
 * "out of scope, and private" reason [RequestableReleaseRow]'s doc comment gives. */
@Composable
private fun RequestAnywayRow(
    term: String,
    titleRequestState: TitleRequestState,
    onRequestAnyway: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text("No releases matched \"$term\".")
        when (titleRequestState) {
            is TitleRequestState.Idle ->
                Button(onClick = onRequestAnyway, modifier = Modifier.padding(top = 8.dp)) { Text("Request \"$term\"") }
            is TitleRequestState.Pending ->
                Button(onClick = {}, enabled = false, modifier = Modifier.padding(top = 8.dp)) { Text("Requesting…") }
            is TitleRequestState.Requested ->
                Text("Requested \"$term\"", modifier = Modifier.padding(top = 8.dp))
            is TitleRequestState.Failed -> {
                Text(
                    text = titleRequestState.message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Button(onClick = onRequestAnyway, modifier = Modifier.padding(top = 8.dp)) { Text("Request \"$term\"") }
            }
        }
    }
}

/** One requestable music candidate — a specific file a Soulseek search turned up. Mirrors
 * `features/musicrequests/MusicRequestsScreen.kt`'s own candidate row at every level that
 * carries over, not reused for the same "out of scope, and private" reason
 * [RequestableReleaseRow]'s doc comment gives. [grabWarning] renders alongside "Requested",
 * never in place of it — see [RequestableMusicUiState.Loaded.grabWarnings]'s own doc comment
 * on why a failed auto-grab must not read as a failed request. */
@Composable
private fun RequestableCandidateRow(
    candidate: MusicCandidate,
    requestState: CandidateRequestState,
    grabWarning: String?,
    onRequest: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(candidate.title, style = MaterialTheme.typography.titleSmall)
        Text(
            listOfNotNull(candidate.artist, candidate.album, candidate.sourceName, formatBytes(candidate.sizeBytes))
                .joinToString(" • ") + formatBitrate(candidate.bitrateKbps),
        )
        when (requestState) {
            is CandidateRequestState.Idle ->
                Button(onClick = onRequest, modifier = Modifier.padding(top = 4.dp)) { Text("Request") }
            is CandidateRequestState.Pending ->
                Button(onClick = {}, enabled = false, modifier = Modifier.padding(top = 4.dp)) { Text("Requesting…") }
            is CandidateRequestState.Requested -> {
                Text("Requested", modifier = Modifier.padding(top = 4.dp))
                if (grabWarning != null) {
                    Text(
                        text = grabWarning,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            is CandidateRequestState.Failed -> {
                Text(
                    text = requestState.message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Button(onClick = onRequest, modifier = Modifier.padding(top = 4.dp)) { Text("Request") }
            }
        }
    }
}

/** Below 1 KB shows as whole bytes; above, repeatedly divides by 1024 and labels KB/MB/GB/TB,
 * one decimal place. Mirrors `features/requests/RequestsScreen.kt`'s own `formatBytes`
 * exactly, duplicated rather than imported — that file's copy is private and out of scope for
 * this wave to touch. */
private fun formatBytes(bytes: Long?): String {
    if (bytes == null) return "Unknown size"
    if (bytes < 1024) return "$bytes B"

    val units = listOf("KB", "MB", "GB", "TB")
    var value = bytes / 1024.0
    var unitIndex = 0
    while (value >= 1024 && unitIndex < units.size - 1) {
        value /= 1024
        unitIndex += 1
    }
    return String.format(Locale.US, "%.1f %s", value, units[unitIndex])
}

/** Empty string when the provider didn't report a bitrate — mirrors
 * `features/musicrequests/MusicRequestsScreen.kt`'s own `formatBitrate`, duplicated for the
 * same "private, out of scope" reason [formatBytes] is. */
private fun formatBitrate(kbps: Int?): String = if (kbps == null) "" else " • ${kbps}kbps"

private fun LazyListScope.sectionHeader(label: String) {
    item {
        Text(
            label,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 16.dp),
        )
    }
}

/** `docs/design/screens/SEARCH.md` §3's "Result row art size" — 52dp, down from [MusicRow]'s own
 * 56dp default, on this screen's book/podcast/artist/album rows only (see [MusicRow]'s own doc
 * comment on why the default itself is unchanged). */
private val SEARCH_ROW_ART_SIZE = 52.dp

/** §3's "Result row art radius" — 8dp, "Android is always the 'mobile' case" per that row's own
 * Source column. */
private val SEARCH_ROW_ART_RADIUS = 8.dp

/**
 * The search field, its status line (§6.4) and its typeahead suggestion dropdown (§6.2) —
 * `internal`, split out of [UnifiedSearchScreen] so [UnifiedSearchScreenTest] can compose it
 * directly against plain state, the same "Content" split `BookDetailContent` already
 * establishes, rather than needing a full [AppContainer]/ViewModel/`NavHostController`.
 *
 * §10 names `ExposedDropdownMenuBox`/`DropdownMenu` as the natural fit; this uses a plain
 * [DropdownMenu] anchored to a [Box] around the field instead, since `ExposedDropdownMenuBox`'s
 * `Modifier.menuAnchor()` API changed shape across recent Material3 versions and nothing here
 * can compile against the pinned one to confirm which overload applies — the *behaviour* is
 * §10's actual contract, not the specific composable. `PopupProperties(focusable = false)` keeps
 * the popup from stealing focus off the field the instant it opens, which would otherwise
 * immediately close it again via [showSuggestions]'s own focus condition.
 */
@Composable
internal fun UnifiedSearchQueryArea(
    query: String,
    onQueryChange: (String) -> Unit,
    statusText: String,
    suggestions: List<SearchSuggestionUi>,
    onSelectSuggestion: (SearchSuggestionUi) -> Unit,
) {
    // §6.2's "Visibility" rule: field focused, query non-empty, at least one candidate — mirrors
    // SearchField.tsx's hasSuggestions/showList gating exactly, per that section's own wording.
    var fieldFocused by remember { mutableStateOf(false) }
    val showSuggestions = fieldFocused && query.trim().isNotEmpty() && suggestions.isNotEmpty()

    Box(modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            label = { Text("Books, podcasts, artists, albums, or tracks") },
            modifier =
                Modifier
                    .fillMaxWidth()
                    .testTag("search-field")
                    .onFocusChanged { fieldFocused = it.isFocused },
        )
        DropdownMenu(
            expanded = showSuggestions,
            onDismissRequest = { fieldFocused = false },
            properties = PopupProperties(focusable = false),
        ) {
            suggestions.forEach { suggestion ->
                DropdownMenuItem(
                    text = { Text(suggestion.label) },
                    onClick = { onSelectSuggestion(suggestion) },
                    modifier =
                        Modifier
                            .testTag("search-suggestion-${suggestion.id}")
                            // §11's "Suggestion listbox, Android" — no Compose-native combobox
                            // semantics to inherit, so this is the explicit contentDescription
                            // TalkBack needs, matching the same visible label sighted users see.
                            .semantics { contentDescription = suggestion.label },
                )
            }
        }
    }
    // §11's "Status announcement" — Modifier.semantics { liveRegion = Polite } is Compose's
    // direct equivalent of web's aria-live="polite" on its own status <p>.
    Text(
        text = statusText,
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = 12.dp)
                .testTag("search-status")
                .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/** One music track search result — the same shape and the same "no `clickable` modifier at all
 * when there's nowhere to navigate" treatment as `MusicSearchScreen.kt`'s own `SearchTrackRow`:
 * a search hit carries no sibling track list to build a playback queue from, so tapping it
 * opens its album instead, and a track with no [MusicSearchTrackUi.albumId] has nowhere to go. */
@Composable
private fun SearchResultTrackRow(
    track: MusicSearchTrackUi,
    onOpenAlbum: (String) -> Unit,
) {
    val albumId = track.albumId
    val rowModifier =
        Modifier.fillMaxWidth().let { base ->
            if (albumId != null) base.clickable(onClick = { onOpenAlbum(albumId) }) else base
        }.padding(vertical = 8.dp)
    Row(modifier = rowModifier, verticalAlignment = Alignment.CenterVertically) {
        Column {
            Text(track.title, style = MaterialTheme.typography.titleSmall)
            track.artistNames?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
