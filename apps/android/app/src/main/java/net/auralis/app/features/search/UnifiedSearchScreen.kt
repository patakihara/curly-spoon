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
import net.auralis.app.features.music.MusicRow
import net.auralis.app.features.music.MusicSearchTrackUi
import net.auralis.app.navigation.Routes

/**
 * Unified search across books, podcasts and music (`docs/ROADMAP.md` §12b/12b-A1) — the
 * Android counterpart to `apps/web/src/features/search/SearchPage.tsx`'s library half. Reached
 * from the shell's "Search" destination (`Routes.MUSIC_SEARCH`, still that route string despite
 * the rename — see this wave's own report for why changing it wasn't warranted).
 *
 * **Library only.** This screen shows what is already on the connected servers; requesting a
 * non-library title (12b-A2, a separate wave) is out of scope and nothing here creates a
 * request of any kind.
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
            if (state.isEmpty && state.libraryError == null && state.musicError == null) {
                item { Text("No matches found.", modifier = Modifier.padding(top = 24.dp)) }
            }
        }
    }
}

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
