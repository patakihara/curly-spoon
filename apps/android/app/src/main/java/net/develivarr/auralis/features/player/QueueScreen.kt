package net.develivarr.auralis.features.player

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ClearAll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch

/**
 * The queue view (Android wave 12f) — a mirror of web's `QueueView.tsx` in *product* behaviour,
 * deliberately not in data plumbing: only one content type's queue is ever "live" at once, tracked
 * by [PlayerViewModel.currentContentTypeFlow], and this screen shows that one queue. Podcast and
 * audiobook rows come straight off the matching [QueueStore]; music rows come from
 * [PlayerViewModel.musicQueueRowsFlow] instead, which reads Media3's own real playlist through
 * [PlaybackHandle] — **not** [PlayerViewModel.musicQueue], which is write-once and read-never (see
 * that property's own doc comment on [PlayerViewModel] for the full account of why a queue view
 * built on it would render an empty list forever while music plays).
 *
 * Reached from [NowPlayingScreen]'s queue button, via `Routes.QUEUE` — see
 * `net.develivarr.auralis.navigation.AuralisNavHost`'s registration and
 * `net.develivarr.auralis.navigation.AuralisShell`'s `onOpenQueue` wiring, matching the existing
 * `onOpenLyrics` -> `Routes.LYRICS` pattern.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueScreen(playerViewModel: PlayerViewModel) {
    val coroutineScope = rememberCoroutineScope()
    val contentType by playerViewModel.currentContentTypeFlow.collectAsState()
    val podcastState by playerViewModel.podcastQueue.state.collectAsState()
    val audiobookState by playerViewModel.audiobookQueue.state.collectAsState()

    // Only polls while the live content type is music -- keyed on contentType so switching away
    // (or nothing playing at all) cancels the previous collection rather than stacking a second
    // one, the same LaunchedEffect(key) restart-on-change idiom LyricsScreen's own position flow
    // uses.
    var musicRows by remember { mutableStateOf(emptyList<QueueRowUi>()) }
    LaunchedEffect(contentType) {
        if (contentType == QueueContentType.MUSIC) {
            playerViewModel.musicQueueRowsFlow().collect { musicRows = it }
        } else {
            musicRows = emptyList()
        }
    }

    val rows =
        when (contentType) {
            QueueContentType.PODCAST -> podcastQueueRows(podcastState)
            QueueContentType.AUDIOBOOK -> audiobookQueueRows(audiobookState)
            QueueContentType.MUSIC -> musicRows
            null -> emptyList()
        }

    // Names which queue is empty rather than rendering a blank box -- distinct wording per
    // content type (and for "nothing is playing at all"), matching this file's own header on why
    // this screen mirrors web's product behaviour rather than a single generic empty state.
    val emptyMessage =
        when (contentType) {
            QueueContentType.PODCAST -> "Nothing queued after this episode."
            QueueContentType.AUDIOBOOK -> "Nothing queued after this book."
            QueueContentType.MUSIC -> "Nothing queued after this track."
            null -> "Nothing is playing."
        }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Queue") },
                actions = {
                    IconButton(
                        onClick = { coroutineScope.launch { playerViewModel.clearActiveQueue() } },
                        enabled = rows.isNotEmpty(),
                    ) {
                        Icon(Icons.Filled.ClearAll, contentDescription = "Clear queue")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            if (rows.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(emptyMessage, style = MaterialTheme.typography.bodyLarge)
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(rows, key = { it.id }) { row ->
                        ListItem(
                            headlineContent = { Text(row.title) },
                            supportingContent = row.subtitle?.let { subtitle -> { Text(subtitle) } },
                            trailingContent =
                                if (row.isCurrent) {
                                    { Text("Now playing", style = MaterialTheme.typography.labelMedium) }
                                } else {
                                    null
                                },
                        )
                    }
                }
            }
        }
    }
}
