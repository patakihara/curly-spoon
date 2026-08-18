package net.develivarr.auralis.features.books

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.ImageLoader
import coil.compose.AsyncImage
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.features.home.DownloadActionState
import net.develivarr.auralis.features.home.downloadActionClickable
import net.develivarr.auralis.features.home.downloadActionLabel
import net.develivarr.auralis.features.player.PlaybackProgress
import net.develivarr.auralis.features.player.PlayerUiState
import net.develivarr.auralis.features.player.PlayerViewModel

/**
 * One audiobook's cover, metadata, description and chapter list — Android had no book detail
 * screen at all before wave 16e-book-A (`docs/design/screens/BOOK_DETAIL.md` §2's own note; every
 * tap on a book anywhere in this app called `playerViewModel.playItem` directly). Structured
 * after [net.develivarr.auralis.features.podcasts.PodcastDetailScreen]/
 * [net.develivarr.auralis.features.music.AlbumDetailScreen] — the two existing detail-screen
 * precedents this wave follows rather than re-inventing.
 *
 * **Play/Resume** starts playback exactly as the old direct-tap behaviour did
 * ([PlayerViewModel.playItem], no seek) — see this file's own doc comment on why moving the tap
 * behind this screen doesn't change how playback itself starts.
 *
 * **Chapter taps** (§5 of the spec) branch on whether this screen's own [itemId] is the player's
 * *currently loaded* item, via [PlayerUiState.Playing.audiobookItemId]: already loaded means
 * "seek in place" ([PlayerViewModel.seekTo]); anything else (a different book, or nothing loaded)
 * means "load this book, then seek" ([PlayerViewModel.playItem]'s existing `seekToMsAfterLoad`
 * parameter — added for wave 12f's cross-book chapter queue, reused here rather than duplicated).
 * Active-chapter highlighting only applies in the first case, computed from
 * [PlayerViewModel.playbackProgressFlow] — never from stored progress, which is a point-in-time
 * position with no guaranteed chapter-boundary alignment (§5: "do not highlight a chapter based
 * on stored progress alone").
 *
 * **Download** wires the existing [net.develivarr.auralis.data.downloads.DownloadRepository]
 * machinery via [BookDetailViewModel.startDownload], the same permission-prompt-then-enqueue
 * shape [net.develivarr.auralis.features.books.BooksScreen]'s `startDownloadWithPermissionPrompt`
 * already uses for its own shelf-card download button.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookDetailScreen(
    container: AppContainer,
    playerViewModel: PlayerViewModel,
    itemId: String,
) {
    val viewModel: BookDetailViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer {
                        BookDetailViewModel(
                            container.apiClient,
                            container.serverConfigRepository,
                            container.downloadRepository,
                            itemId,
                        )
                    }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    val downloadState by viewModel.downloadState.collectAsState()
    val playerUiState by playerViewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    val notificationPermissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { /* no-op: download proceeds regardless */ }

    LaunchedEffect(itemId) { viewModel.load() }

    // The play-error case (§5): starting playback failed after the item loaded fine. Distinct
    // from a fetch failure (BookDetailUiState.Failed, handled below) — the rest of the page (cover,
    // chapters, description) stays visible, and only a snackbar reports the failure, matching
    // every other playback surface in this app (BooksScreen/PodcastDetailScreen/AlbumDetailScreen
    // all handle PlayerUiState.Error identically).
    LaunchedEffect(playerUiState) {
        val state = playerUiState
        if (state is PlayerUiState.Error) {
            snackbarHostState.showSnackbar(state.message)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.downloadMessages.collect { message -> snackbarHostState.showSnackbar(message) }
    }

    fun startDownloadWithPermissionPrompt() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted =
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                    PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        viewModel.startDownload()
    }

    val isThisBookLoaded = (playerUiState as? PlayerUiState.Playing)?.audiobookItemId == itemId

    Scaffold(
        topBar = {
            TopAppBar(title = { Text((uiState as? BookDetailUiState.Loaded)?.data?.title ?: "Book") })
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        when (val state = uiState) {
            is BookDetailUiState.Loading ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            is BookDetailUiState.Failed ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            is BookDetailUiState.NotABook ->
                Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                    Text("\"${state.title}\" isn't a book.", color = MaterialTheme.colorScheme.error)
                }
            is BookDetailUiState.Loaded -> {
                // Only sampled while this book is the loaded player item (§5: "no chapter is
                // marked active" otherwise) — collectAsState here only runs
                // playbackProgressFlow's polling loop while isThisBookLoaded is true, since a
                // Compose call site only collects for as long as it's actually reached in
                // composition (see PlayerViewModel.playbackProgressFlow's own doc comment on that
                // "runs only while collected" shape).
                val activeIndex: Int? =
                    if (isThisBookLoaded) {
                        val progress by
                            playerViewModel.playbackProgressFlow().collectAsState(initial = PlaybackProgress(0L, 0L))
                        activeChapterIndex(state.data.chapters, progress.positionMs)
                    } else {
                        null
                    }
                BookDetailContent(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    imageLoader = container.imageLoader,
                    data = state.data,
                    downloadState = downloadState,
                    activeChapterIndex = activeIndex,
                    onPlay = { playerViewModel.playItem(itemId) },
                    onDownload = { startDownloadWithPermissionPrompt() },
                    onChapterClick = { chapter ->
                        if (isThisBookLoaded) {
                            playerViewModel.seekTo(chapter.startMs)
                        } else {
                            playerViewModel.playItem(itemId, seekToMsAfterLoad = chapter.startMs)
                        }
                    },
                )
            }
        }
    }
}

/** `internal`, not `private` — [BookDetailContentTest] (`src/testDebug`) exercises this stateless
 * half directly, the same "test the content composable, not the ViewModel-backed screen" pattern
 * `SettingsContentTest` already establishes, so a Robolectric test isn't also exercising
 * `collectAsState`/the ViewModel factory for logic that doesn't live there. */
@Composable
internal fun BookDetailContent(
    modifier: Modifier,
    imageLoader: ImageLoader,
    data: BookDetailUiData,
    downloadState: DownloadActionState,
    activeChapterIndex: Int?,
    onPlay: () -> Unit,
    onDownload: () -> Unit,
    onChapterClick: (BookChapterUi) -> Unit,
) {
    LazyColumn(modifier = modifier.padding(16.dp)) {
        item {
            Row {
                // Decorative — duplicates the title text right next to it (§6 of the spec).
                AsyncImage(
                    model = data.coverUrl,
                    contentDescription = null,
                    imageLoader = imageLoader,
                    modifier = Modifier.size(96.dp),
                )
                Column(modifier = Modifier.padding(start = 16.dp)) {
                    Text("Audiobook", style = MaterialTheme.typography.labelSmall)
                    Text(data.title, style = MaterialTheme.typography.titleLarge)
                    data.subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                    // Plain, non-interactive text on Android — no author screen this wave builds
                    // (§4/§5/§7 of the spec; see BookDetailUiData.authorNames's own doc comment).
                    data.authorNames?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                    data.metaLine?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
            Row(modifier = Modifier.padding(top = 16.dp)) {
                // The button's own Text child gives it its accessible name (§6: "Play/Resume
                // state must be announced as what it does, not just its icon") — no separate
                // contentDescription needed, matching every other text-labelled Button in this app.
                Button(onClick = onPlay, modifier = Modifier.testTag("book-play-button")) { Text(data.playLabel) }
                OutlinedButton(
                    onClick = onDownload,
                    enabled = downloadActionClickable(downloadState),
                    modifier = Modifier.padding(start = 8.dp).testTag("book-download-button"),
                ) {
                    Text(downloadActionLabel(downloadState))
                }
            }
            data.description?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 16.dp))
            }
        }

        // A book with no chapter markers is a normal, common case (a single-file audiobook), not
        // an error — the whole section is omitted, not an empty list with a heading (§5).
        if (data.chapters.isNotEmpty()) {
            item {
                Text(
                    "Chapters",
                    style = MaterialTheme.typography.titleMedium,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 24.dp, bottom = 8.dp)
                            .testTag("book-chapters-heading"),
                )
            }
            items(data.chapters, key = { it.index }) { chapter ->
                BookChapterRow(
                    chapter = chapter,
                    active = chapter.index == activeChapterIndex,
                    onClick = { onChapterClick(chapter) },
                )
            }
        }
    }
}

@Composable
private fun BookChapterRow(
    chapter: BookChapterUi,
    active: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .testTag("book-chapter-${chapter.index}")
                .clickable(onClick = onClick)
                .padding(vertical = 8.dp)
                // Merges title/time/active-state into one announcement rather than three separate
                // nodes a screen reader would step through — §6 of the spec: "must announce, at
                // minimum: its title, its position/duration, and whether it is the currently-active
                // chapter", "not conveyed by colour alone".
                .semantics(mergeDescendants = true) { contentDescription = chapterAnnouncement(chapter, active) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "${chapter.index}.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(end = 8.dp),
        )
        Text(chapter.title, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(
            chapter.timeLabel,
            style = MaterialTheme.typography.bodySmall,
            color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
