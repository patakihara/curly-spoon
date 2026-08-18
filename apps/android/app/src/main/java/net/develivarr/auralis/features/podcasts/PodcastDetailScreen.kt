package net.develivarr.auralis.features.podcasts

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.ImageLoader
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.features.player.PlayerUiState
import net.develivarr.auralis.features.player.PlayerViewModel
import net.develivarr.auralis.ui.components.MediaHeader
import net.develivarr.auralis.util.formatDuration
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * One podcast's cover, metadata and episode list — the podcast sibling of a book detail screen
 * this app doesn't have yet (there is currently no per-book detail route; shelf taps play
 * directly). Reached from [PodcastsScreen]'s "My podcasts" list. Mirrors
 * `apps/web/src/features/podcasts/PodcastDetailPage.tsx`'s layout and its "Newest first"/
 * "Oldest first" toggle.
 *
 * Episode taps go through the same [playerViewModel] every other playback surface in this app
 * shares (see [net.develivarr.auralis.navigation.AuralisNavHost]'s own doc comment on why it's
 * constructed once, at the nav host's scope) — [PlayerViewModel.playEpisode] is the podcast
 * counterpart to the shelf-tap [PlayerViewModel.playItem] path [net.develivarr.auralis.features.home
 * .HomeScreen] uses, and failures surface the same way: a snackbar driven by
 * [PlayerUiState.Error], matching that screen's own pattern exactly so a failed tap doesn't look
 * like nothing happened only on this one screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PodcastDetailScreen(
    container: AppContainer,
    playerViewModel: PlayerViewModel,
    itemId: String,
) {
    val viewModel: PodcastDetailViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer {
                        PodcastDetailViewModel(container.apiClient, container.serverConfigRepository, itemId)
                    }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    val playerUiState by playerViewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(itemId) { viewModel.load() }

    LaunchedEffect(playerUiState) {
        val state = playerUiState
        if (state is PlayerUiState.Error) {
            snackbarHostState.showSnackbar(state.message)
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Podcast") }) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        when (val state = uiState) {
            is PodcastDetailUiState.Loading ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            is PodcastDetailUiState.Failed ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            is PodcastDetailUiState.NotAPodcast ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("\"${state.title}\" isn't a podcast.", color = MaterialTheme.colorScheme.error)
                }
            is PodcastDetailUiState.Loaded ->
                PodcastDetailContent(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    imageLoader = container.imageLoader,
                    data = state.data,
                    order = state.order,
                    onOrderChange = viewModel::setOrder,
                    onPlayEpisode = { episodeId -> playerViewModel.playEpisode(itemId, episodeId) },
                )
        }
    }
}

@Composable
private fun PodcastDetailContent(
    modifier: Modifier,
    imageLoader: ImageLoader,
    data: PodcastDetailUiData,
    order: EpisodeOrder,
    onOrderChange: (EpisodeOrder) -> Unit,
    onPlayEpisode: (String) -> Unit,
) {
    LazyColumn(modifier = modifier.padding(16.dp)) {
        item {
            // Wave 16e-book-A-2: the shared MediaHeader, same composable BookDetailScreen and
            // AlbumDetailScreen adopt. No BOOK_DETAIL.md-equivalent spec exists for podcasts —
            // "Podcast" as the kind label and the muted-role author subtitle are this screen's
            // own reasonable extrapolation of the book screen's contract, not drawn from a
            // written podcast spec (none exists yet).
            MediaHeader(
                coverUrl = data.coverUrl,
                imageLoader = imageLoader,
                fallbackIcon = Icons.Filled.Podcasts,
                kindLabel = "Podcast",
                title = data.title,
                subtitle = data.author,
            )
            data.description?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 16.dp))
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Episodes", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                // Labeled as the action the tap performs, not the current state — a label
                // reading "Newest first" while sorted newest-first, that then sorts oldest-first
                // when tapped, describes what's already true and does the opposite of what it
                // says. The web reference sidesteps this with two selectable chips instead of
                // one toggle button; this stays a single control but names the destination.
                Button(
                    onClick = { onOrderChange(if (order == EpisodeOrder.NEWEST) EpisodeOrder.OLDEST else EpisodeOrder.NEWEST) },
                ) {
                    Text(if (order == EpisodeOrder.NEWEST) "Show oldest first" else "Show newest first")
                }
            }
            if (data.episodes.isEmpty()) {
                Text("This podcast has no episodes yet.")
            }
        }

        items(data.episodes, key = { it.id }) { episode ->
            EpisodeRow(episode = episode, onPlay = { onPlayEpisode(episode.id) })
        }
    }
}

@Composable
private fun EpisodeRow(
    episode: PodcastEpisodeUi,
    onPlay: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onPlay)
                .padding(vertical = 8.dp),
    ) {
        Text(episode.title, style = MaterialTheme.typography.titleSmall)
        Text(
            "${formatPublishedDate(episode.publishedAt)} • ${formatDuration(episode.durationSeconds)}${episodeProgressSuffix(episode.progressState)}",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

/** `null` (a malformed or missing feed entry) degrades to a dash rather than "Invalid Date" —
 * purely presentational, not decidable logic, so it lives here rather than in a tested pure
 * function; [sortEpisodes]/[episodeProgressState] are the parts of this screen actually worth
 * unit-testing (see `PodcastDetailViewModelTest`). */
private fun formatPublishedDate(publishedAtMs: Long?): String {
    if (publishedAtMs == null) return "—"
    val formatter = SimpleDateFormat("MMM d, yyyy", Locale.US)
    return formatter.format(Date(publishedAtMs))
}

private fun episodeProgressSuffix(state: EpisodeProgressState): String =
    when (state) {
        EpisodeProgressState.PLAYED -> " • Played"
        EpisodeProgressState.IN_PROGRESS -> " • In progress"
        EpisodeProgressState.UNPLAYED -> ""
    }
