package net.develivarr.auralis.features.books

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavHostController
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.features.home.HomeShelvesContent
import net.develivarr.auralis.features.home.HomeViewModel
import net.develivarr.auralis.features.player.PlayerUiState
import net.develivarr.auralis.features.player.PlayerViewModel
import net.develivarr.auralis.navigation.Routes

/**
 * The "Books" shell destination (`docs/ROADMAP.md` §12a). Wave 12a-A1 needed a real, separate
 * `Routes.BOOKS` destination so `shellDestinationFor` has exactly one owner per route — but there
 * is no book-specific data source or ViewModel yet, only [HomeViewModel]'s audiobook-library
 * shelves, which "For you" ([net.develivarr.auralis.features.home.HomeScreen]) already reads. So this
 * screen owns its **own** [HomeViewModel] instance (a fresh load, not a shared one — the two
 * destinations are independent nav-graph nodes with independent ViewModelStores) and renders the
 * exact same [HomeShelvesContent] body. A real "For you" recommendation mix that actually differs
 * from the shelf list is later product work (see `docs/HANDOVER.md`'s phase 12a note); until
 * then the two destinations are intentionally the same shelves under a different tab and title.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BooksScreen(
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

    val notificationPermissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { /* no-op: download proceeds regardless */ }

    LaunchedEffect(playerUiState) {
        val state = playerUiState
        if (state is PlayerUiState.Error) {
            snackbarHostState.showSnackbar(state.message)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.downloadEvents.collect { event ->
            snackbarHostState.showSnackbar(event.message)
        }
    }

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
            TopAppBar(title = { Text("Books") })
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        HomeShelvesContent(
            uiState = uiState,
            downloadStates = downloadStates,
            container = container,
            contentPadding = innerPadding,
            // Android wave 16e-book-A: a tap now opens the book detail screen rather than
            // playing immediately — see docs/design/screens/BOOK_DETAIL.md §5. Playback is still
            // one tap away, from that screen's own Play/Resume button.
            onItemClick = { itemId -> navController.navigate(Routes.bookDetail(itemId)) },
            onDownloadClick = { itemId -> startDownloadWithPermissionPrompt(itemId) },
        )
    }
}
