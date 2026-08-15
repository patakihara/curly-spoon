package net.develivarr.auralis.features.podcasts

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
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
import coil.ImageLoader
import coil.compose.AsyncImage
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.data.model.PodcastDirectoryResult
import net.develivarr.auralis.navigation.Routes

/**
 * Subscribed podcasts, plus discover-and-subscribe: search the directory (or paste an RSS
 * feed URL), preview the real feed, then subscribe. Mirrors
 * `apps/web/src/features/podcasts/PodcastDiscoverPage.tsx` + `PodcastFeedPreview.tsx`'s flow,
 * folded into one screen alongside the subscribed list rather than a separate "add podcast"
 * destination — this app has no podcast-library-scoped page yet for a nav entry to live on the
 * way the web version's does (`LibraryPage.tsx`), so [net.develivarr.auralis.features.home.HomeScreen]
 * is this feature's only natural entry point, and one screen keeps that entry point singular.
 *
 * A single top-level [LazyColumn] holds every section — including both of the screen's two
 * potentially-long lists (subscribed podcasts, directory search results) as their own `items`
 * blocks within it, rather than as nested `LazyColumn`s inside a plain `Column`. A nested
 * scrollable is exactly the shape of bug `docs/HANDOVER.md` records for wave D2b's
 * `RequestsScreen`: an unweighted sibling silently squeezed a second list to zero height. One
 * scrollable list per screen sidesteps that whole class of bug rather than budgeting `weight()`
 * between two lists that can each independently grow long.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PodcastsScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: PodcastsViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { PodcastsViewModel(container.apiClient, container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadMyPodcasts() }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Podcasts") }) },
    ) { innerPadding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
            item { Text("My podcasts", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp)) }
            myPodcastsSection(
                state = uiState.myPodcastsState,
                imageLoader = container.imageLoader,
                onOpen = { itemId -> navController.navigate(Routes.podcastDetail(itemId)) },
            )

            item {
                Text(
                    "Add a podcast",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 24.dp),
                )
                OutlinedTextField(
                    value = uiState.searchTerm,
                    onValueChange = viewModel::onSearchTermChange,
                    label = { Text("Podcast name") },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                Button(onClick = viewModel::submitSearch, modifier = Modifier.padding(top = 8.dp)) {
                    Text("Search")
                }
            }
            directorySearchSection(
                state = uiState.searchState,
                onPick = { result -> result.feedUrl?.let { viewModel.startPreview(result, it) } },
            )

            item {
                OutlinedTextField(
                    value = uiState.rssUrl,
                    onValueChange = viewModel::onRssUrlChange,
                    label = { Text("Or paste an RSS feed URL") },
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                )
                Button(
                    onClick = { viewModel.startPreview(null, uiState.rssUrl.trim()) },
                    enabled = uiState.rssUrl.isNotBlank(),
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    Text("Preview feed")
                }

                FeedPreviewSection(
                    previewState = uiState.previewState,
                    subscribeState = uiState.subscribeState,
                    onSubscribe = viewModel::subscribe,
                    onDismiss = viewModel::dismissPreview,
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

private fun LazyListScope.myPodcastsSection(
    state: MyPodcastsUiState,
    imageLoader: ImageLoader,
    onOpen: (String) -> Unit,
) {
    when (state) {
        is MyPodcastsUiState.Loading ->
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        is MyPodcastsUiState.NoLibrary ->
            item {
                Text("No podcast library configured on this server yet.", modifier = Modifier.padding(top = 8.dp))
            }
        is MyPodcastsUiState.Failed ->
            item {
                Text(state.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
            }
        is MyPodcastsUiState.Loaded ->
            if (state.podcasts.isEmpty()) {
                item { Text("No podcasts yet — add one below.", modifier = Modifier.padding(top = 8.dp)) }
            } else {
                items(state.podcasts, key = { "mypodcast:${it.id}" }) { podcast ->
                    Row(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .clickable { onOpen(podcast.id) }
                                .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AsyncImage(
                            model = podcast.coverUrl,
                            contentDescription = null,
                            imageLoader = imageLoader,
                            modifier = Modifier.size(56.dp),
                        )
                        Column(modifier = Modifier.padding(start = 16.dp)) {
                            Text(podcast.title, style = MaterialTheme.typography.titleSmall)
                            podcast.author?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }
            }
    }
}

private fun LazyListScope.directorySearchSection(
    state: DirectorySearchUiState,
    onPick: (PodcastDirectoryResult) -> Unit,
) {
    when (state) {
        is DirectorySearchUiState.Idle -> Unit
        is DirectorySearchUiState.Loading ->
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        is DirectorySearchUiState.Failed ->
            item {
                Text(state.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
            }
        is DirectorySearchUiState.Results ->
            if (state.results.isEmpty()) {
                item { Text("No podcasts found.", modifier = Modifier.padding(top = 8.dp)) }
            } else {
                items(state.results, key = { "search:${it.itunesId}" }) { result ->
                    Column(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .clickable(enabled = result.feedUrl != null) { onPick(result) }
                                .padding(vertical = 8.dp),
                    ) {
                        Text(result.title, style = MaterialTheme.typography.titleSmall)
                        result.artistName?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
    }
}

@Composable
private fun FeedPreviewSection(
    previewState: FeedPreviewUiState,
    subscribeState: SubscribeUiState,
    onSubscribe: () -> Unit,
    onDismiss: () -> Unit,
) {
    when (previewState) {
        is FeedPreviewUiState.Idle -> Unit
        is FeedPreviewUiState.Loading ->
            Box(modifier = Modifier.fillMaxWidth().padding(top = 16.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        is FeedPreviewUiState.Failed ->
            Text(
                previewState.message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 16.dp),
            )
        is FeedPreviewUiState.Loaded ->
            Column(modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) {
                Text(previewState.preview.title ?: "Untitled podcast", style = MaterialTheme.typography.titleMedium)
                previewState.preview.author?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                Text("${previewState.preview.numEpisodes} episodes", style = MaterialTheme.typography.bodySmall)
                when (subscribeState) {
                    is SubscribeUiState.Idle ->
                        Row(modifier = Modifier.padding(top = 8.dp)) {
                            Button(onClick = onSubscribe) { Text("Subscribe") }
                            Button(onClick = onDismiss, modifier = Modifier.padding(start = 8.dp)) {
                                Text("Cancel")
                            }
                        }
                    is SubscribeUiState.Pending ->
                        Button(onClick = {}, enabled = false, modifier = Modifier.padding(top = 8.dp)) {
                            Text("Subscribing…")
                        }
                    is SubscribeUiState.Subscribed ->
                        Text("Subscribed", modifier = Modifier.padding(top = 8.dp))
                    is SubscribeUiState.Failed ->
                        Column(modifier = Modifier.padding(top = 8.dp)) {
                            Text(subscribeState.message, color = MaterialTheme.colorScheme.error)
                            Button(onClick = onSubscribe, modifier = Modifier.padding(top = 8.dp)) {
                                Text("Subscribe")
                            }
                        }
                    is SubscribeUiState.CannotSubscribe ->
                        Text(
                            "This server has no podcast library to subscribe into.",
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                }
            }
    }
}
