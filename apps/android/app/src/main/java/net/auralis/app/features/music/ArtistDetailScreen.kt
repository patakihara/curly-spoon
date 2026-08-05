package net.auralis.app.features.music

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import net.auralis.app.AppContainer
import net.auralis.app.navigation.Routes

/**
 * One artist's albums (`music/artist/{artistId}`). Reached from [MusicLibraryScreen]'s
 * artists list. The Jellyfin-music sibling of
 * [net.auralis.app.features.podcasts.PodcastDetailScreen], scoped to one list rather than a
 * metadata-header-plus-list shape — see [ArtistDetailViewModel]'s own doc comment for why
 * there is no per-artist metadata section here yet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtistDetailScreen(
    container: AppContainer,
    navController: NavHostController,
    artistId: String,
) {
    val viewModel: ArtistDetailViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer {
                        ArtistDetailViewModel(container.musicRepository, container.serverConfigRepository, artistId)
                    }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(artistId) { viewModel.load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text((uiState as? ArtistDetailUiState.Loaded)?.artistName ?: "Artist") },
                actions = {
                    (uiState as? ArtistDetailUiState.Loaded)?.let { loaded ->
                        FavoriteToggleButton(
                            favorite = loaded.artistFavorite,
                            itemName = loaded.artistName,
                            onToggle = viewModel::toggleArtistFavorite,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        when (val state = uiState) {
            is ArtistDetailUiState.Loading ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            // Calm, deliberately not an error and deliberately no retry button — see
            // MusicLibraryScreen's identical treatment of this same state for why.
            is ArtistDetailUiState.Unconfigured ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Text("No Jellyfin server connected yet.")
                }
            is ArtistDetailUiState.Failed ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.message, color = MaterialTheme.colorScheme.error)
                        Button(onClick = viewModel::load, modifier = Modifier.padding(top = 8.dp)) {
                            Text("Retry")
                        }
                    }
                }
            is ArtistDetailUiState.Loaded ->
                if (state.albums.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize().padding(innerPadding),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("This artist has no albums yet.")
                    }
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
                        items(state.albums, key = { it.id }) { album ->
                            MusicRow(
                                title = album.name,
                                subtitle = null,
                                coverUrl = album.coverUrl,
                                imageLoader = container.imageLoader,
                                onClick = { navController.navigate(Routes.musicAlbumDetail(album.id)) },
                            )
                        }
                        if (state.hasMore) {
                            item {
                                Box(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (state.loadingMore) {
                                        CircularProgressIndicator()
                                    } else {
                                        Button(onClick = viewModel::loadMoreAlbums) { Text("Load more") }
                                    }
                                }
                            }
                        }
                    }
                }
        }
    }
}
