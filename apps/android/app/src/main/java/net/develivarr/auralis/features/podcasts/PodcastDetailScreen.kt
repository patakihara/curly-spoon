package net.develivarr.auralis.features.podcasts

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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

    // Wave 16e-podcast-A. Mirrors web's own local `pendingEpisodeId` state
    // (`apps/web/src/features/podcasts/PodcastDetailPage.tsx`) — set the moment a tap is
    // dispatched, cleared once the player settles one way or the other. `playEpisode` itself is
    // fire-and-forget from this call site (it launches its own coroutine and returns
    // immediately, see its own doc comment), so there's no completion signal to await directly;
    // observing the next [playerUiState] change — [PlayerUiState.Playing] on success,
    // [PlayerUiState.Error] on failure — is the same signal the existing error-snackbar
    // LaunchedEffect below already keys off, so this reuses it rather than inventing a second.
    var pendingEpisodeId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(itemId) { viewModel.load() }

    LaunchedEffect(playerUiState) {
        val state = playerUiState
        pendingEpisodeId = null
        if (state is PlayerUiState.Error) {
            snackbarHostState.showSnackbar(state.message)
        }
    }

    fun playEpisode(episodeId: String) {
        pendingEpisodeId = episodeId
        playerViewModel.playEpisode(itemId, episodeId)
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
                    pendingEpisodeId = pendingEpisodeId,
                    onOrderChange = viewModel::setOrder,
                    onPlayEpisode = { episodeId -> playEpisode(episodeId) },
                )
        }
    }
}

/** `internal`, not `private` — [PodcastDetailContentTest] (`src/testDebug`) exercises this
 * stateless half directly, the same "test the content composable, not the ViewModel-backed
 * screen" pattern [net.develivarr.auralis.features.books.BookDetailContent] already establishes,
 * so a Robolectric test isn't also exercising `collectAsState`/the ViewModel factory for logic
 * that doesn't live there. */
@Composable
internal fun PodcastDetailContent(
    modifier: Modifier,
    imageLoader: ImageLoader,
    data: PodcastDetailUiData,
    order: EpisodeOrder,
    pendingEpisodeId: String?,
    onOrderChange: (EpisodeOrder) -> Unit,
    onPlayEpisode: (String) -> Unit,
) {
    // Read once into a local val, not repeatedly through `data.playLatestEpisodeId` — a local
    // val (rather than a property access) is what keeps the null check below smart-cast-stable
    // inside the nested `actions` lambda, which is built here but invoked later during
    // composition.
    val playLatestId = data.playLatestEpisodeId

    LazyColumn(modifier = modifier.padding(16.dp)) {
        item {
            // Wave 16e-book-A-2 built the shared MediaHeader, adopted here already; wave
            // 16e-podcast-A (docs/design/screens/PODCAST_DETAIL.md §3/§10) wires its `meta` and
            // `actions` slots, which this screen had left empty until now.
            MediaHeader(
                coverUrl = data.coverUrl,
                imageLoader = imageLoader,
                fallbackIcon = Icons.Filled.Podcasts,
                kindLabel = "Podcast",
                title = data.title,
                subtitle = data.author,
                meta = data.meta,
                actions =
                    if (playLatestId != null) {
                        {
                            // §6: "Play latest" sorts newest-first, takes the first, and calls
                            // the exact same episode-play path every episode row already calls —
                            // no new "play the show" concept, just sugar over onPlayEpisode.
                            // §5: omitted entirely when there are no episodes — playLatestId is
                            // only non-null when there's at least one, so this `if` is the
                            // fallback contract, not an extra check.
                            val isPending = pendingEpisodeId == playLatestId
                            Button(
                                onClick = { onPlayEpisode(playLatestId) },
                                enabled = !isPending,
                                modifier = Modifier.testTag("podcast-play-latest-button"),
                            ) {
                                if (isPending) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(18.dp).testTag("podcast-play-latest-progress"),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                } else {
                                    // The button's own Text child gives it its accessible name
                                    // (§11: "must announce what it does, via its own text
                                    // label") — no separate contentDescription needed, matching
                                    // every other text-labelled Button in this app.
                                    Text("Play latest")
                                }
                            }
                        }
                    } else {
                        null
                    },
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
                Text(
                    "Episodes",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f).testTag("podcast-episodes-heading"),
                )
                // Labeled as the action the tap performs, not the current state — a label
                // reading "Newest first" while sorted newest-first, that then sorts oldest-first
                // when tapped, describes what's already true and does the opposite of what it
                // says. The web reference sidesteps this with two selectable chips instead of
                // one toggle button; this stays a single control but names the destination.
                // §6: this divergence is deliberate and already reviewed — not something to
                // unify with web's two-chip shape.
                Button(
                    onClick = { onOrderChange(if (order == EpisodeOrder.NEWEST) EpisodeOrder.OLDEST else EpisodeOrder.NEWEST) },
                    modifier = Modifier.testTag("podcast-order-toggle"),
                ) {
                    Text(if (order == EpisodeOrder.NEWEST) "Show oldest first" else "Show newest first")
                }
            }
            if (data.episodes.isEmpty()) {
                Text("This podcast has no episodes yet.", modifier = Modifier.testTag("podcast-empty-episodes"))
            }
        }

        items(data.episodes, key = { it.id }) { episode ->
            EpisodeRow(
                episode = episode,
                isPending = episode.id == pendingEpisodeId,
                onPlay = { onPlayEpisode(episode.id) },
            )
        }
    }
}

@Composable
private fun EpisodeRow(
    episode: PodcastEpisodeUi,
    isPending: Boolean,
    onPlay: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .testTag("podcast-episode-${episode.id}")
                .clickable(onClick = onPlay, enabled = !isPending)
                .padding(vertical = 8.dp)
                // Merges title/date/duration/progress into one announcement rather than four
                // separate nodes a screen reader would step through — §11 of the spec: "must
                // announce, at minimum: its title, its publish date, its duration, and its
                // played/in-progress/unplayed state", mirroring BookChapterRow's own
                // `semantics(mergeDescendants = true)` pattern (BookDetailScreen.kt:298).
                .semantics(mergeDescendants = true) { contentDescription = episodeAnnouncement(episode) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // §6: "a real Android gap to close" — web already shows a check icon (played), play
        // icon (unplayed/in-progress) or a loading indicator (pending) per row; Android showed
        // none of it. §11: this icon must not be the only signal of played state — the text
        // suffix below still carries it, so contentDescription = null here is correct: the same
        // information already lives in this row's merged announcement above.
        if (isPending) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp).testTag("podcast-episode-${episode.id}-progress"),
                strokeWidth = 2.dp,
            )
        } else {
            Icon(
                imageVector = if (episode.progressState == EpisodeProgressState.PLAYED) Icons.Filled.Check else Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(modifier = Modifier.padding(start = 16.dp)) {
            Text(episode.title, style = MaterialTheme.typography.titleSmall)
            Text(
                "${formatPublishedDate(episode.publishedAt)} • ${formatDuration(episode.durationSeconds)}${episodeProgressSuffix(episode.progressState)}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

/** Merges an episode row's title, publish date, duration and played/in-progress/unplayed state
 * into one screen-reader announcement (§11 of the spec) — the podcast counterpart to
 * [net.develivarr.auralis.features.books.chapterAnnouncement]. `internal`, not `private`, so
 * [PodcastDetailContentTest] can assert on it directly rather than hardcoding a second copy of
 * the format. */
internal fun episodeAnnouncement(episode: PodcastEpisodeUi): String {
    val stateLabel =
        when (episode.progressState) {
            EpisodeProgressState.PLAYED -> "played"
            EpisodeProgressState.IN_PROGRESS -> "in progress"
            EpisodeProgressState.UNPLAYED -> "unplayed"
        }
    return "${episode.title}, ${formatPublishedDate(episode.publishedAt)}, ${formatDuration(episode.durationSeconds)}, $stateLabel"
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
