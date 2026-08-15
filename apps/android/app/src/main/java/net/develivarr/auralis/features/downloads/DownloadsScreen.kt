package net.develivarr.auralis.features.downloads

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
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
import coil.ImageLoader
import coil.compose.AsyncImage
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.data.downloads.DownloadState

/**
 * What's downloaded or downloading, with per-item progress and cancel/remove. Mirrors
 * `RequestsScreen`'s list+per-item-action structure. Progress updates live while this screen is
 * visible — see [DownloadsViewModel]'s own doc comment for why polling, not a listener, backs
 * that.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadsScreen(container: AppContainer) {
    val viewModel: DownloadsViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer {
                        DownloadsViewModel(container.apiClient, container.serverConfigRepository, container.downloadRepository)
                    }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.startPolling() }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Downloads") }) },
    ) { innerPadding ->
        when (val state = uiState) {
            is DownloadsUiState.Loading ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            is DownloadsUiState.Error ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            is DownloadsUiState.Loaded ->
                if (state.items.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize().padding(innerPadding),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("No downloads yet.")
                    }
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                        items(state.items, key = { it.itemId }) { item ->
                            DownloadRow(
                                item = item,
                                imageLoader = container.imageLoader,
                                onCancel = { viewModel.cancel(item.itemId) },
                            )
                        }
                    }
                }
        }
    }
}

@Composable
private fun DownloadRow(
    item: DownloadListItemUi,
    imageLoader: ImageLoader,
    onCancel: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = item.coverUrl,
            contentDescription = null,
            imageLoader = imageLoader,
            modifier = Modifier.size(56.dp),
        )
        Column(modifier = Modifier.weight(1f).padding(start = 16.dp)) {
            Text(text = item.title, style = MaterialTheme.typography.titleSmall, maxLines = 1)
            Text(text = downloadStateLabel(item.state), style = MaterialTheme.typography.bodySmall)
            if (item.state == DownloadState.DOWNLOADING || item.state == DownloadState.QUEUED) {
                LinearProgressIndicator(
                    progress = { item.progress },
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                )
            }
        }
        Button(
            onClick = onCancel,
            enabled = item.cancelState !is DownloadCancelState.Pending,
        ) {
            Text(if (item.cancelState is DownloadCancelState.Pending) "Removing…" else "Remove")
        }
    }
}

/**
 * [DownloadState.FAILED] renders here without a `failureReason`-derived detail: `DownloadSummary`
 * — what this screen actually reads — rolls every track up to one state per item (see
 * `summarizeDownloads`'s own doc comment) and deliberately doesn't carry `DownloadedItem
 * .failureReason` through that rollup, so there is nothing more specific to show yet.
 */
private fun downloadStateLabel(state: DownloadState): String =
    when (state) {
        DownloadState.QUEUED -> "Queued"
        DownloadState.DOWNLOADING -> "Downloading"
        DownloadState.COMPLETED -> "Downloaded"
        DownloadState.FAILED -> "Failed"
        DownloadState.PAUSED -> "Paused"
    }
