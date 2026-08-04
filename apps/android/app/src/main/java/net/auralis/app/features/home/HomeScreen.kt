package net.auralis.app.features.home

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import net.auralis.app.AppContainer
import net.auralis.app.features.player.MiniPlayerBar
import net.auralis.app.features.player.PlayerUiState
import net.auralis.app.features.player.PlayerViewModel
import net.auralis.app.navigation.Routes

/**
 * The signed-in landing screen: the first library's home shelves ("Continue listening",
 * "Recently added", etc.), each rendered as a horizontally-scrolling row of covers. Tapping a
 * shelf item starts it playing via [playerViewModel]; a [MiniPlayerBar] renders at the bottom
 * once something is playing. Each item also carries a download action (Wave F2b) — see
 * [HomeViewModel]'s own doc comment for why it lives here rather than a book-detail screen that
 * doesn't exist yet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    container: AppContainer,
    playerViewModel: PlayerViewModel,
    navController: NavHostController,
) {
    val viewModel: HomeViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer {
                        HomeViewModel(container.apiClient, container.serverConfigRepository, container.downloadRepository)
                    }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    val downloadStates by viewModel.downloadStates.collectAsState()
    val playerUiState by playerViewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    // Android 13+ requires POST_NOTIFICATIONS to be requested at runtime before
    // AuralisDownloadService's progress notification can show (it's declared in the manifest
    // already — see AndroidManifest.xml's own comment — but declaring alone isn't enough from
    // API 33 on). The result is intentionally ignored: a refusal must not block the download
    // itself, only its notification — see startDownloadWithPermissionPrompt below.
    val notificationPermissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { /* no-op: download proceeds regardless */ }

    // Surfaces player-side failures (no playable track, a network error, a failed
    // MediaController connection) as a snackbar. Without this, PlayerUiState.Error is set
    // correctly by the ViewModel but nothing ever renders it, so a failed tap looks like
    // nothing happened at all.
    LaunchedEffect(playerUiState) {
        val state = playerUiState
        if (state is PlayerUiState.Error) {
            snackbarHostState.showSnackbar(state.message)
        }
    }

    // Surfaces every download outcome as a snackbar — all four DownloadEnqueueResult cases
    // produce a distinct message (see HomeViewModel.startDownload). A SharedFlow, not
    // downloadStates itself, because collect never completes: LaunchedEffect(Unit) is correct
    // here precisely because this effect is meant to run for the composable's whole lifetime.
    LaunchedEffect(Unit) {
        viewModel.downloadEvents.collect { event ->
            snackbarHostState.showSnackbar(event.message)
        }
    }

    /**
     * Requests notification permission the first time this item is downloaded — not at app
     * launch, matching Android's own guidance to ask in context rather than up front — then
     * starts the download regardless of what the user picks.
     */
    fun startDownloadWithPermissionPrompt(itemId: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted =
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                    PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        viewModel.startDownload(itemId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Auralis") },
                actions = {
                    // A stock Material 3 icon set is not a confirmed dependency here — see
                    // MiniPlayerBar.kt's header comment on why even icons believed to be in the
                    // bundled core set were left unverified. A text action avoids that risk.
                    TextButton(onClick = { navController.navigate(Routes.DOWNLOADS) }) {
                        Text("Downloads")
                    }
                    TextButton(onClick = { navController.navigate(Routes.REQUESTS) }) {
                        Text("Requests")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            val playing = playerUiState
            if (playing is PlayerUiState.Playing) {
                MiniPlayerBar(state = playing, onTogglePlayPause = playerViewModel::togglePlayPause)
            }
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
                                            modifier =
                                                Modifier
                                                    .size(120.dp)
                                                    .clickable { playerViewModel.playItem(item.id) },
                                            contentScale = ContentScale.Crop,
                                        )
                                        Text(
                                            text = item.title,
                                            maxLines = 1,
                                            modifier =
                                                Modifier
                                                    .padding(top = 4.dp)
                                                    .clickable { playerViewModel.playItem(item.id) },
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
                                                        startDownloadWithPermissionPrompt(item.id)
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
}

/**
 * The four [DownloadEnqueueResult] outcomes (via [DownloadActionState]) each get a distinct,
 * short label here — the requirement this wave's spec calls out explicitly: a user must be able
 * to tell "queued", "nothing to download", "the server call failed" and "downloads don't work on
 * this build" apart at a glance, not just from the one-shot snackbar. The snackbar (see
 * `HomeViewModel.downloadEvents`) carries the fuller message; this is the persistent label.
 */
private fun downloadActionLabel(state: DownloadActionState): String =
    when (state) {
        DownloadActionState.IDLE -> "Download"
        DownloadActionState.PENDING -> "Starting…"
        DownloadActionState.ENQUEUED -> "Queued"
        DownloadActionState.NO_PLAYABLE_TRACK -> "No track available"
        DownloadActionState.FAILED -> "Retry download"
        DownloadActionState.UNAVAILABLE -> "Downloads unavailable"
    }

/**
 * Whether tapping the label should retry [HomeViewModel.startDownload]. Not clickable while a
 * request is already in flight ([DownloadActionState.PENDING]) to avoid a duplicate enqueue from
 * a double tap, and not for [DownloadActionState.NO_PLAYABLE_TRACK]/[DownloadActionState
 * .UNAVAILABLE] — neither outcome changes by retrying the exact same request: the item still
 * won't have a playable track, and the build still won't have a working download engine.
 * [DownloadActionState.ENQUEUED] stays non-clickable too — a duplicate enqueue of an
 * already-queued item has no defined behaviour worth relying on here (see `DownloadEngine
 * .enqueue`'s own contract, which doesn't cover being called twice for the same track).
 */
private fun downloadActionClickable(state: DownloadActionState): Boolean =
    state == DownloadActionState.IDLE || state == DownloadActionState.FAILED
