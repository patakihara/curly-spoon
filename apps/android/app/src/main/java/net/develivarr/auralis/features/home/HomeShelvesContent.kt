package net.develivarr.auralis.features.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import net.develivarr.auralis.AppContainer

/**
 * The shelf-rendering body shared by [net.develivarr.auralis.features.home.HomeScreen] ("For you") and
 * [net.develivarr.auralis.features.books.BooksScreen] ("Books") — wave 12a-A1 extracted this out of
 * `HomeScreen` rather than duplicating it, since both screens read the exact same
 * [HomeViewModel] shelves today (see that ViewModel's own doc comment: there is no separate
 * "for you" data source yet, only the audiobook library home shelves). Each caller still owns
 * its own `Scaffold`/`topBar` — this is only the `innerPadding`-aware content slot.
 */
@Composable
fun HomeShelvesContent(
    uiState: HomeUiState,
    downloadStates: Map<String, DownloadActionState>,
    container: AppContainer,
    contentPadding: PaddingValues,
    onItemClick: (itemId: String) -> Unit,
    onDownloadClick: (itemId: String) -> Unit,
) {
    when (uiState) {
        is HomeUiState.Loading ->
            Box(
                modifier = Modifier.fillMaxSize().padding(contentPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        is HomeUiState.Error ->
            Box(
                modifier = Modifier.fillMaxSize().padding(contentPadding),
                contentAlignment = Alignment.Center,
            ) {
                Text(uiState.message)
            }
        is HomeUiState.Loaded ->
            LazyColumn(modifier = Modifier.fillMaxSize().padding(contentPadding)) {
                items(uiState.shelves, key = { it.id }) { shelf ->
                    Column(modifier = Modifier.padding(vertical = 8.dp)) {
                        Text(
                            text = shelf.label,
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                        LazyRow(modifier = Modifier.padding(top = 8.dp)) {
                            items(shelf.items, key = { it.id }) { item ->
                                Column(
                                    modifier =
                                        Modifier
                                            .width(120.dp)
                                            .padding(horizontal = 8.dp),
                                ) {
                                    AsyncImage(
                                        model = item.coverUrl,
                                        contentDescription = null,
                                        imageLoader = container.imageLoader,
                                        modifier =
                                            Modifier
                                                .size(120.dp)
                                                .clickable { onItemClick(item.id) },
                                        contentScale = ContentScale.Crop,
                                    )
                                    Text(
                                        text = item.title,
                                        maxLines = 1,
                                        modifier =
                                            Modifier
                                                .padding(top = 4.dp)
                                                .clickable { onItemClick(item.id) },
                                    )
                                    val downloadState = downloadStates[item.id] ?: DownloadActionState.IDLE
                                    Text(
                                        text = downloadActionLabel(downloadState),
                                        style = MaterialTheme.typography.labelSmall,
                                        color =
                                            if (downloadState == DownloadActionState.FAILED) {
                                                MaterialTheme.colorScheme.error
                                            } else {
                                                MaterialTheme.colorScheme.primary
                                            },
                                        modifier =
                                            Modifier
                                                .padding(top = 2.dp)
                                                .clickable(enabled = downloadActionClickable(downloadState)) {
                                                    onDownloadClick(item.id)
                                                },
                                    )
                                }
                            }
                        }
                    }
                }
            }
    }
}

/**
 * The four [DownloadEnqueueResult][net.develivarr.auralis.data.downloads.DownloadEnqueueResult]
 * outcomes (via [DownloadActionState]) each get a distinct, short label — moved here from
 * `HomeScreen.kt` (wave 12a-A1) since [BooksScreen][net.develivarr.auralis.features.books.BooksScreen]
 * needs the identical mapping and this is the one place both screens' content composable reads
 * it from.
 */
internal fun downloadActionLabel(state: DownloadActionState): String =
    when (state) {
        DownloadActionState.IDLE -> "Download"
        DownloadActionState.PENDING -> "Starting…"
        DownloadActionState.ENQUEUED -> "Queued"
        DownloadActionState.NO_PLAYABLE_TRACK -> "No track available"
        DownloadActionState.FAILED -> "Retry download"
        DownloadActionState.UNAVAILABLE -> "Downloads unavailable"
    }

/**
 * Whether tapping the label should retry [HomeViewModel.startDownload]. See the original
 * doc comment in `HomeScreen.kt`'s history for the full per-state reasoning; unchanged by the
 * wave 12a-A1 move.
 */
internal fun downloadActionClickable(state: DownloadActionState): Boolean =
    state == DownloadActionState.IDLE || state == DownloadActionState.FAILED
