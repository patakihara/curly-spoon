package net.auralis.app.features.requests

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
import net.auralis.app.AppContainer
import net.auralis.app.data.model.Release
import java.util.Locale

/**
 * Search AudiobookBay/indexer releases for a title and turn one into a `BookRequest`; when the
 * search comes back with zero releases, offer "request anyway" to queue the typed title with no
 * release attached instead. Mirrors the flow in
 * `apps/web/src/features/requests/AskForBookPanel.tsx`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RequestsScreen(container: AppContainer) {
    val viewModel: RequestsViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { RequestsViewModel(container.apiClient) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Requests") })
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp)) {
            OutlinedTextField(
                value = uiState.searchTerm,
                onValueChange = viewModel::onSearchTermChange,
                label = { Text("Title") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = uiState.searchAuthor,
                onValueChange = viewModel::onSearchAuthorChange,
                label = { Text("Author (optional)") },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
            Button(
                onClick = viewModel::submitSearch,
                modifier = Modifier.padding(top = 8.dp),
            ) {
                Text("Search")
            }

            when (val searchState = uiState.searchState) {
                is SearchUiState.Idle -> Unit
                is SearchUiState.Loading ->
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                is SearchUiState.Failed ->
                    Column(modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) {
                        Text(
                            text = searchState.message,
                            color = MaterialTheme.colorScheme.error,
                        )
                        // A hard search failure still offers "request anyway" — an indexer or
                        // BFF outage is exactly when queuing the bare title matters most. See
                        // `RequestsUiState.offerRequestAnyway`'s doc comment.
                        if (uiState.offerRequestAnyway) {
                            RequestAnywaySection(
                                term = uiState.submittedTerm,
                                state = uiState.titleRequestState,
                                onRequestAnyway = viewModel::requestAnyway,
                            )
                        }
                    }
                is SearchUiState.Results ->
                    Column(modifier = Modifier.fillMaxSize().padding(top = 16.dp)) {
                        // Rendered alongside whatever releases came back, never in place of them
                        // — a broken indexer must not look identical to "nothing exists".
                        searchState.errors.forEach { error ->
                            Text(error.message, color = MaterialTheme.colorScheme.error)
                        }
                        if (uiState.offerRequestAnyway) {
                            RequestAnywaySection(
                                term = uiState.submittedTerm,
                                state = uiState.titleRequestState,
                                onRequestAnyway = viewModel::requestAnyway,
                            )
                        } else {
                            LazyColumn(modifier = Modifier.fillMaxSize()) {
                                items(searchState.releases, key = { it.guid }) { release ->
                                    ReleaseRow(
                                        release = release,
                                        state = uiState.releaseRequestStates[release.guid] ?: ReleaseRequestState.Idle,
                                        onRequest = { viewModel.requestRelease(release) },
                                    )
                                }
                            }
                        }
                    }
            }
        }
    }
}

@Composable
private fun RequestAnywaySection(
    term: String,
    state: TitleRequestState,
    onRequestAnyway: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text("No releases found for \"$term\".")
        when (state) {
            is TitleRequestState.Idle ->
                Button(onClick = onRequestAnyway, modifier = Modifier.padding(top = 8.dp)) {
                    Text("Request anyway")
                }
            is TitleRequestState.Pending ->
                Button(onClick = {}, enabled = false, modifier = Modifier.padding(top = 8.dp)) {
                    Text("Requesting…")
                }
            is TitleRequestState.Requested ->
                Text("Requested", modifier = Modifier.padding(top = 8.dp))
            is TitleRequestState.Failed -> {
                Text(
                    text = state.message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Button(onClick = onRequestAnyway, modifier = Modifier.padding(top = 8.dp)) {
                    Text("Request anyway")
                }
            }
        }
    }
}

@Composable
private fun ReleaseRow(
    release: Release,
    state: ReleaseRequestState,
    onRequest: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = release.title,
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f),
            )
        }
        Text("${release.sourceName} • ${formatBytes(release.sizeBytes)} • ${release.seeders} seeders")
        when (state) {
            is ReleaseRequestState.Idle ->
                Button(onClick = onRequest, modifier = Modifier.padding(top = 4.dp)) {
                    Text("Request")
                }
            is ReleaseRequestState.Pending ->
                Button(onClick = {}, enabled = false, modifier = Modifier.padding(top = 4.dp)) {
                    Text("Requesting…")
                }
            is ReleaseRequestState.Requested ->
                Text("Requested", modifier = Modifier.padding(top = 4.dp))
            is ReleaseRequestState.Failed -> {
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
 * Below 1 KB shows as whole bytes; above, repeatedly divides by 1024 and labels KB/MB/GB/TB, one
 * decimal place. Mirrors `apps/web/src/features/requests/format.ts`'s `formatBytes` exactly,
 * including its null case — `Release.sizeBytes` is nullable here (an indexer that doesn't report
 * size), which the web reference also models as `number | null`.
 */
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
