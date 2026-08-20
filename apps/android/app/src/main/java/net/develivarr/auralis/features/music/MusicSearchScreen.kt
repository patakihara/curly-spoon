package net.develivarr.auralis.features.music

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import coil.ImageLoader
import coil.compose.AsyncImage
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.navigation.Routes

/**
 * Search across the connected Jellyfin library's artists, albums and tracks
 * (`music/search`). Reached from [MusicLibraryScreen]'s top bar. Results are grouped into up to
 * three sections, in that order, each omitted entirely when empty — mirroring
 * `apps/web/src/features/search/SearchPage.tsx`'s own section ordering and its identical
 * "omit an empty section rather than show it with nothing in it" choice.
 *
 * An artist or album result navigates to its own detail screen, same as everywhere else in this
 * app's music browsing. A **track** result does not play directly: unlike an [AlbumDetailScreen]
 * track row, a search hit carries no sibling track list to build a playback queue from, so
 * tapping it opens its album instead, where a full, orderable queue already exists — the same
 * choice `apps/web/src/features/search/SearchPage.tsx` makes for the same reason. A track
 * with no [MusicSearchTrackUi.albumId] has nowhere to navigate to, so [SearchTrackRow] renders it
 * non-interactive rather than as a dead tap target.
 *
 * **16e-search-A-3**: [SearchTrackRow] now renders a cover-art tile, matching the treatment
 * `UnifiedSearchScreen.kt`'s own `SearchResultTrackRow` uses (52dp art, 8dp corner radius, a
 * muted [Icons.Filled.MusicNote] fallback underneath the [AsyncImage]) — before this wave it was
 * the only track row in the app with no art at all, named but deliberately left alone by
 * `16e-search-A-2`, which fixed every *other* kind of result row on the unified search screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicSearchScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: MusicSearchViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { MusicSearchViewModel(container.musicRepository, container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Search music") }) },
    ) { innerPadding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
            item {
                OutlinedTextField(
                    value = uiState.query,
                    onValueChange = viewModel::onQueryChange,
                    label = { Text("Artists, albums, or tracks") },
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                )
            }
            searchResultsSection(
                state = uiState.resultsState,
                imageLoader = container.imageLoader,
                onOpenArtist = { artistId -> navController.navigate(Routes.musicArtistDetail(artistId)) },
                onOpenAlbum = { albumId -> navController.navigate(Routes.musicAlbumDetail(albumId)) },
                onRetry = viewModel::retry,
            )
        }
    }
}

internal fun LazyListScope.searchResultsSection(
    state: MusicSearchResultsUiState,
    imageLoader: ImageLoader,
    onOpenArtist: (String) -> Unit,
    onOpenAlbum: (String) -> Unit,
    onRetry: () -> Unit,
) {
    when (state) {
        // Inviting, not "no results" — no search has actually run yet.
        is MusicSearchResultsUiState.Idle ->
            item {
                Text(
                    "Search your Jellyfin library for artists, albums, and tracks.",
                    modifier = Modifier.padding(top = 24.dp),
                )
            }
        is MusicSearchResultsUiState.Searching ->
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        // Calm, deliberately not an error and deliberately no retry button — see
        // MusicLibraryScreen's identical treatment of this same state for why.
        is MusicSearchResultsUiState.Unconfigured ->
            item {
                Text("No Jellyfin server connected yet.", modifier = Modifier.padding(top = 24.dp))
            }
        is MusicSearchResultsUiState.Failed ->
            item {
                Column(modifier = Modifier.padding(top = 24.dp)) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry, modifier = Modifier.padding(top = 4.dp)) { Text("Retry") }
                }
            }
        is MusicSearchResultsUiState.Results ->
            if (state.isEmpty) {
                item { Text("No matches found.", modifier = Modifier.padding(top = 24.dp)) }
            } else {
                if (state.artists.isNotEmpty()) {
                    item {
                        Text(
                            "Artists",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
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
                if (state.albums.isNotEmpty()) {
                    item {
                        Text(
                            "Albums",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
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
                if (state.tracks.isNotEmpty()) {
                    item {
                        Text(
                            "Tracks",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                    items(state.tracks, key = { "track:${it.id}" }) { track ->
                        SearchTrackRow(track = track, imageLoader = imageLoader, onOpenAlbum = onOpenAlbum)
                    }
                }
            }
    }
}

/** One track search result — visually a plain row, like [MusicRow]'s artist/album rows, not a
 * [Button]: this is a list item, not an action. Non-interactive — no `clickable` modifier
 * applied at all, not merely a no-op click handler — when [MusicSearchTrackUi.albumId] is null,
 * per this file's own doc comment on why a track result with nowhere to navigate must not read
 * as tappable. Adding cover art (16e-search-A-3) does not change that: the tile is a sibling of
 * the row's clickable modifier, not a click target of its own, exactly as it is not one on
 * [MusicRow] or `UnifiedSearchScreen.kt`'s own `SearchResultTrackRow`.
 *
 * The art tile deliberately does **not** call [MusicRow] — it builds its own
 * [Box]/[Icon]/[AsyncImage] layering instead, matching `SearchResultTrackRow`'s own choice on
 * the unified search screen (see that composable's doc comment): a per-track `testTag` on the
 * fallback [Icon] is needed so several tracks' fallback icons do not collide under Robolectric's
 * strict-mode node lookup, and [MusicRow] has no parameter for that. Same reasoning, same
 * layering, second file — kept in step deliberately so this screen's and the unified search
 * screen's track rows agree, per this wave's own instruction to read `UnifiedSearchScreen.kt`
 * for the treatment rather than invent a third one. */
@Composable
private fun SearchTrackRow(
    track: MusicSearchTrackUi,
    imageLoader: ImageLoader,
    onOpenAlbum: (String) -> Unit,
) {
    val albumId = track.albumId
    val rowModifier =
        Modifier.fillMaxWidth().let { base ->
            if (albumId != null) base.clickable(onClick = { onOpenAlbum(albumId) }) else base
        }.padding(vertical = 8.dp)
    Row(modifier = rowModifier, verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier.size(TRACK_ART_SIZE).clip(RoundedCornerShape(TRACK_ART_RADIUS)),
            contentAlignment = Alignment.Center,
        ) {
            // Coil paints nothing while loading, on failure, or when track.coverUrl is null (it
            // is null until the server base URL resolves) — this fallback icon is what shows
            // through in every one of those cases, not an error/placeholder painter on
            // AsyncImage itself, same as MusicRow's and SearchResultTrackRow's own fallback.
            Icon(
                imageVector = Icons.Filled.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                // Tagged per-track (not a fixed tag) so a list of several tracks does not
                // collide under Robolectric's strict-mode node lookup.
                modifier = Modifier.size(TRACK_ART_SIZE / 2).testTag("music-search-track-art-fallback-${track.id}"),
            )
            AsyncImage(
                model = track.coverUrl,
                contentDescription = null,
                imageLoader = imageLoader,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(TRACK_ART_SIZE),
            )
        }
        Column(modifier = Modifier.padding(start = 16.dp)) {
            Text(track.title, style = MaterialTheme.typography.titleSmall)
            track.artistNames?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

/** `docs/design/screens/SEARCH.md` §3's "Result row art size"/"Result row art radius" — 52dp/8dp,
 * matching `UnifiedSearchScreen.kt`'s own `SEARCH_ROW_ART_SIZE`/`SEARCH_ROW_ART_RADIUS` exactly,
 * so the two search surfaces' track rows agree. Not imported from that file: both constants are
 * file-private there, by the same "do not widen [MusicRow]'s own default" reasoning this file's
 * `MusicRow` doc comment already gives — a screen-scoped value stays screen-scoped. */
private val TRACK_ART_SIZE = 52.dp
private val TRACK_ART_RADIUS = 8.dp
