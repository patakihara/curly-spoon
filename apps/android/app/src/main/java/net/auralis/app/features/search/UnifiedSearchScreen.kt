package net.auralis.app.features.search

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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import coil.ImageLoader
import net.auralis.app.AppContainer
import net.auralis.app.data.model.MusicCandidate
import net.auralis.app.data.model.Release
import net.auralis.app.features.music.MusicRow
import net.auralis.app.features.music.MusicSearchTrackUi
import net.auralis.app.features.musicrequests.CandidateRequestState
import net.auralis.app.features.requests.ReleaseRequestState
import net.auralis.app.features.requests.TitleRequestState
import net.auralis.app.navigation.Routes
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
 * Navigation per kind: podcasts open [net.auralis.app.navigation.Routes.podcastDetail]; music
 * artists/albums open their existing detail routes; a music track opens its album, same
 * non-interactive-when-no-album-id treatment as `MusicSearchScreen.kt`'s own `SearchTrackRow`.
 * **Books, series and authors have no detail route anywhere in this app yet** (confirmed by
 * reading `AuralisNavHost.kt`'s `Routes` object), so those three kinds render as plain,
 * non-interactive rows rather than as dead tap targets — see [SearchBookUi]/[SearchSeriesUi]/
 * [SearchAuthorUi]'s own doc comments.
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
                OutlinedTextField(
                    value = uiState.query,
                    onValueChange = viewModel::onQueryChange,
                    label = { Text("Books, podcasts, artists, albums, or tracks") },
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
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

private fun LazyListScope.searchResultsSection(
    state: UnifiedSearchResultsUiState,
    visible: VisibleKinds,
    imageLoader: ImageLoader,
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
                        // No book-detail route exists yet — non-interactive rather than a dead
                        // tap target, per this file's own doc comment.
                        onClick = null,
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
