package net.auralis.app.features.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.compose.AsyncImage
import net.auralis.app.AppContainer

/**
 * The signed-in landing screen: the first library's home shelves ("Continue listening",
 * "Recently added", etc.), each rendered as a horizontally-scrolling row of covers.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(container: AppContainer) {
    val viewModel: HomeViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { HomeViewModel(container.apiClient, container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Auralis") })
        },
    ) { innerPadding ->
        when (val state = uiState) {
            is HomeUiState.Loading ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            is HomeUiState.Error ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(state.message)
                }
            is HomeUiState.Loaded ->
                LazyColumn(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                    items(state.shelves, key = { it.id }) { shelf ->
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
                                            modifier = Modifier.size(120.dp),
                                            contentScale = ContentScale.Crop,
                                        )
                                        Text(
                                            text = item.title,
                                            maxLines = 1,
                                            modifier = Modifier.padding(top = 4.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
        }
    }
}
