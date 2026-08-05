package net.auralis.app.features.musicrequests

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import net.auralis.app.AppContainer
import net.auralis.app.data.model.MusicCandidate
import net.auralis.app.data.model.MusicRequest
import java.util.Locale

/**
 * Search the configured music provider (slskd) for a track and turn a result into a
 * `MusicRequest`. Mirrors `features/requests/RequestsScreen`, the book-request equivalent
 * this wave is modelled on — same layout (search fields, a results list, a "your requests"
 * list below), minus the "request anyway" section: `POST /music-requests` requires a
 * candidate, so there is nothing to queue without one. See
 * `MusicRequestsViewModel`/`CandidateRequestState`'s doc comments for why.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicRequestsScreen(container: AppContainer) {
    val viewModel: MusicRequestsViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { MusicRequestsViewModel(container.apiClient) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadRequests() }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Music requests") })
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp)) {
            OutlinedTextField(
                value = uiState.searchTerm,
                onValueChange = viewModel::onSearchTermChange,
                label = { Text("Track, album or artist") },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = viewModel::submitSearch,
                modifier = Modifier.padding(top = 8.dp),
            ) {
                Text("Search")
            }

            when (val searchState = uiState.searchState) {
                is MusicSearchUiState.Idle -> Unit
                is MusicSearchUiState.Loading ->
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                is MusicSearchUiState.Failed ->
                    Text(
                        text = searchState.message,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                    )
                is MusicSearchUiState.Results ->
                    Column(modifier = Modifier.fillMaxWidth().weight(1f, fill = false).padding(top = 16.dp)) {
                        // Rendered alongside whatever candidates came back, never in place of
                        // them — same reasoning as `RequestsScreen`'s indexer errors.
                        searchState.errors.forEach { error ->
                            Text(error.message, color = MaterialTheme.colorScheme.error)
                        }
                        if (searchState.candidates.isEmpty()) {
                            Text("No results for \"${uiState.submittedTerm}\".", modifier = Modifier.padding(top = 8.dp))
                        } else {
                            LazyColumn(modifier = Modifier.fillMaxWidth().weight(1f, fill = false)) {
                                items(searchState.candidates, key = { it.guid }) { candidate ->
                                    CandidateRow(
                                        candidate = candidate,
                                        state = uiState.candidateRequestStates[candidate.guid] ?: CandidateRequestState.Idle,
                                        onRequest = { viewModel.requestCandidate(candidate) },
                                    )
                                }
                            }
                        }
                    }
            }

            Text(
                "Your requests",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 24.dp),
            )
            when (val listState = uiState.requestListState) {
                is MusicRequestListUiState.Loading ->
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                is MusicRequestListUiState.Failed ->
                    Text(
                        text = listState.message,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                is MusicRequestListUiState.Loaded ->
                    if (listState.requests.isEmpty()) {
                        Text("No requests yet.", modifier = Modifier.padding(top = 8.dp))
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxWidth().weight(1f)) {
                            items(listState.requests, key = { it.id }) { request ->
                                MusicRequestRow(
                                    request = request,
                                    actionState = uiState.requestActionStates[request.id] ?: MusicRequestActionState.Idle,
                                    onRetry = { viewModel.retryRequest(request.id) },
                                    onDelete = { viewModel.deleteRequest(request.id) },
                                )
                            }
                        }
                    }
            }
        }
    }
}

@Composable
private fun CandidateRow(
    candidate: MusicCandidate,
    state: CandidateRequestState,
    onRequest: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = candidate.title,
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f),
            )
        }
        listOfNotNull(candidate.artist, candidate.album).takeIf { it.isNotEmpty() }?.let {
            Text(it.joinToString(" • "))
        }
        Text("${candidate.sourceName} • ${formatSize(candidate.sizeBytes)}${formatBitrate(candidate.bitrateKbps)}")
        when (state) {
            is CandidateRequestState.Idle ->
                Button(onClick = onRequest, modifier = Modifier.padding(top = 4.dp)) {
                    Text("Request")
                }
            is CandidateRequestState.Pending ->
                Button(onClick = {}, enabled = false, modifier = Modifier.padding(top = 4.dp)) {
                    Text("Requesting…")
                }
            is CandidateRequestState.Requested ->
                Text("Requested", modifier = Modifier.padding(top = 4.dp))
            is CandidateRequestState.Failed -> {
                Text(
                    text = state.message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Button(onClick = onRequest, modifier = Modifier.padding(top = 4.dp)) {
                    Text("Request")
                }
            }
        }
    }
}

/**
 * Below 1 KB shows as whole bytes; above, repeatedly divides by 1024 and labels KB/MB/GB/TB,
 * one decimal place. Mirrors `RequestsScreen.formatBytes` exactly, including its null case —
 * `MusicCandidate.sizeBytes` is nullable here too (a provider that doesn't report size).
 */
private fun formatSize(bytes: Long?): String {
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

/** Empty string when the provider didn't report a bitrate — appended after [formatSize], so
 * the caller doesn't need a separate conditional row for it. */
private fun formatBitrate(kbps: Int?): String = if (kbps == null) "" else " • ${kbps}kbps"

@Composable
private fun MusicRequestRow(
    request: MusicRequest,
    actionState: MusicRequestActionState,
    onRetry: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = request.title,
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f),
            )
            Text(statusLabel(request.status))
        }
        request.author?.let { Text("by $it") }

        if (request.status == "downloading") {
            LinearProgressIndicator(
                progress = { request.progress.toFloat() },
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )
        }
        if (request.status == "failed" && request.statusDetail != null) {
            Text(request.statusDetail, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 4.dp))
        }
        if (actionState is MusicRequestActionState.Failed) {
            Text(actionState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 4.dp))
        }

        Row(modifier = Modifier.padding(top = 4.dp)) {
            if (request.status == "failed") {
                Button(
                    onClick = onRetry,
                    enabled = actionState !is MusicRequestActionState.Pending,
                    modifier = Modifier.padding(end = 8.dp),
                ) {
                    Text(if (actionState is MusicRequestActionState.Pending) "Retrying…" else "Retry")
                }
            }
            Button(onClick = onDelete, enabled = actionState !is MusicRequestActionState.Pending) {
                Text(if (actionState is MusicRequestActionState.Pending) "Deleting…" else "Delete")
            }
        }
    }
}

/**
 * Mirrors `RequestsScreen.statusLabel`, plus `importRequested` — the music-only terminal
 * status past `downloading` (see `MusicRequest`'s doc comment). Falls back to the raw status,
 * capitalised, for anything else this app doesn't yet know about — `MusicRequest.status` is a
 * plain `String` deliberately, so this must render *something* readable, not throw.
 */
private fun statusLabel(status: String): String =
    when (status) {
        "pending" -> "Pending"
        "approved" -> "Approved"
        "rejected" -> "Rejected"
        "searching" -> "Searching"
        "downloading" -> "Downloading"
        "importing" -> "Importing"
        "completed" -> "Completed"
        "importRequested" -> "Import requested"
        "failed" -> "Failed"
        else -> status.replaceFirstChar { it.uppercase() }
    }
