package net.develivarr.auralis.features.player

import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.data.model.JellyfinLyricLine

/**
 * How long after the user's own touch-drag ends before auto-scroll resumes following the active
 * line, in milliseconds. Long enough that reading a few lines ahead (the reason a listener would
 * scroll manually in the first place) isn't immediately yanked back by the next tick; short
 * enough that idle inaction doesn't leave the view stuck away from what's actually playing.
 */
private const val MANUAL_SCROLL_PAUSE_MS = 3_000L

/**
 * A dedicated lyrics screen (Android wave J), navigated to from [MiniPlayerBar]'s "Lyrics"
 * action. There is no full Now Playing surface in this app yet — only [MiniPlayerBar] — so this
 * is deliberately the smaller of the two options the wave's spec offered: a standalone screen
 * that reads the currently-playing track straight off [PlayerViewModel.uiState], rather than
 * folding lyrics into a Now Playing surface that would have to be built from scratch first.
 *
 * Reads the current music item id from [PlayerViewModel.uiState] rather than a nav argument, so
 * if the user skips to a different track while this screen is open, [LyricsViewModel.ensureLoaded]
 * picks that up on the next recomposition (its own id-keyed guard, not this screen, decides
 * whether that means a new request) instead of the screen showing a stale track's lyrics.
 *
 * Every branch worth getting wrong (which line is active as playback advances) lives in
 * [activeLineIndex], a pure function tested on its own — this composable only wires that logic to
 * [PlayerViewModel.lyricsPositionMsFlow] and [LyricsViewModel.uiState] and renders the result,
 * matching `apps/web/src/features/player/LyricsView.tsx`'s own "deliberately thin" split.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LyricsScreen(
    container: AppContainer,
    playerViewModel: PlayerViewModel,
) {
    val lyricsViewModel: LyricsViewModel =
        viewModel(
            factory = viewModelFactory { initializer { LyricsViewModel(container.musicRepository) } },
        )

    val playerState by playerViewModel.uiState.collectAsState()
    val playing = playerState as? PlayerUiState.Playing
    val itemId = playing?.musicItemId

    LaunchedEffect(itemId) {
        itemId?.let { lyricsViewModel.ensureLoaded(it) }
    }

    val uiState by lyricsViewModel.uiState.collectAsState()

    // The finer-grained position source (Android wave J) — a cold flow that only runs for as
    // long as this composable collects it, so leaving this screen stops the ticker with no
    // manual bookkeeping. See PlayerViewModel.lyricsPositionMsFlow's own doc comment.
    // `remember`ed so the same Flow instance survives recomposition: collectAsState restarts
    // its collection whenever the Flow it's given is a new object, and lyricsPositionMsFlow()
    // returns a fresh one on every call — without this, every position update would itself
    // trigger a recomposition that tore down and rebuilt the ticker it was reporting from.
    val positionFlow = remember(playerViewModel) { playerViewModel.lyricsPositionMsFlow() }
    val positionMs by positionFlow.collectAsState(initial = 0L)

    Scaffold(
        topBar = { TopAppBar(title = { Text("Lyrics") }) },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                playing == null || !playing.isMusic ->
                    // Reached only if playback stops or switches away from music while this
                    // screen is still open (e.g. the user backgrounds the app and a book resumes)
                    // — MiniPlayerBar's own "Lyrics" action is already gated on isMusic, so this
                    // is a reachable-but-rare state, not the normal entry path.
                    CenteredMessage("Not playing music right now.")

                uiState is LyricsUiState.Loading ->
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }

                uiState is LyricsUiState.Failed -> CenteredMessage("Couldn't load lyrics.")

                else -> {
                    val lyrics = (uiState as LyricsUiState.Loaded).lyrics
                    if (lyrics == null || lyrics.lines.isEmpty()) {
                        // The common case for most of a library — Jellyfin having no lyrics for
                        // a track is not an error, so this is plain text, not an alert.
                        CenteredMessage("No lyrics for this track.")
                    } else {
                        LyricsList(
                            lines = lyrics.lines,
                            synced = lyrics.synced,
                            positionSeconds = positionMs / 1000.0,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CenteredMessage(text: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text)
    }
}

/**
 * The scrollable lyric-line list, synced or plain. [synced] gates whether any line is ever
 * highlighted or auto-scrolled to at all — an unsynced response degrades to a plain, static,
 * scrollable list, matching `LyricsView.tsx`'s own `lyrics.synced` gate.
 *
 * Auto-scroll rule: [activeLineIndex]'s current answer is followed automatically
 * (`animateScrollToItem`) unless the user is actively dragging the list, or has stopped dragging
 * within the last [MANUAL_SCROLL_PAUSE_MS] — tracked via [rememberLazyListState]'s own
 * `interactionSource`, which only reports genuine touch drags, not the programmatic scrolls this
 * function issues itself, so the two can't be confused with each other. This lets a listener
 * read ahead of the highlighted line without every tick yanking the view back mid-read, while
 * still resuming automatic follow once they stop interacting.
 *
 * Each line's style is [lyricLineRole]'s three-way split (`docs/design/screens/NOW_PLAYING.md`
 * §3.5, wave 16e-nowplaying-A) — [LyricLineRole.ACTIVE] (bold, primary), [LyricLineRole.PASSED]
 * (muted, `onSurfaceVariant`) and [LyricLineRole.UPCOMING] (full emphasis, plain `onSurface`) —
 * where this screen previously had only one "inactive" bucket for both passed and upcoming lines.
 *
 * Accessibility: the active line is marked by weight *and* size, not colour alone, and the
 * passed/upcoming split keeps that same weight pairing (§11) — 700 (bold) for active, 500
 * (medium) for the other two — rather than distinguishing "passed" from "upcoming" by colour
 * alone, since neither is the state a screen-reader or low-vision user needs to find quickly. No
 * live region is attached anywhere in this list: the active line changes every few seconds while
 * a track plays, and a live region would re-announce a new line to a screen reader on every
 * change — exactly the announcement spam this list must not produce. Every line is plain,
 * ordinarily-readable `Text`, so a screen-reader user can read through the lyrics at their own
 * pace the same way a sighted listener reads ahead on screen, rather than being interrupted or
 * having focus stolen by auto-scroll.
 */
@Composable
private fun LyricsList(
    lines: List<JellyfinLyricLine>,
    synced: Boolean,
    positionSeconds: Double,
) {
    val listState = rememberLazyListState()
    val isDragged by listState.interactionSource.collectIsDraggedAsState()
    var resumeAutoScrollAt by remember { mutableLongStateOf(0L) }

    LaunchedEffect(isDragged) {
        resumeAutoScrollAt =
            if (isDragged) {
                // Still being dragged — keep auto-scroll paused for as long as this stays true;
                // re-evaluated the moment isDragged flips back to false, below.
                Long.MAX_VALUE
            } else {
                System.currentTimeMillis() + MANUAL_SCROLL_PAUSE_MS
            }
    }

    val activeIndex = if (synced) activeLineIndex(lines, positionSeconds) else null

    LaunchedEffect(activeIndex) {
        if (activeIndex != null && System.currentTimeMillis() >= resumeAutoScrollAt) {
            listState.animateScrollToItem(activeIndex)
        }
    }

    LazyColumn(state = listState, modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp)) {
        items(lines.size) { index ->
            // Unsynced lyrics never compute an activeIndex at all (it's null above), so every
            // line already reaches lyricLineRole with activeIndex = null and reads back UPCOMING
            // — matching §3.5's "keep rendering every line in the not-yet-reached role" rule
            // without a separate branch here.
            val role = lyricLineRole(index, activeIndex)
            Text(
                text = lines[index].text,
                modifier = Modifier.padding(vertical = 8.dp),
                style =
                    if (role == LyricLineRole.ACTIVE) {
                        MaterialTheme.typography.titleLarge
                    } else {
                        MaterialTheme.typography.bodyLarge
                    },
                fontWeight = if (role == LyricLineRole.ACTIVE) FontWeight.Bold else FontWeight.Medium,
                color =
                    when (role) {
                        LyricLineRole.ACTIVE -> MaterialTheme.colorScheme.primary
                        LyricLineRole.PASSED -> MaterialTheme.colorScheme.onSurfaceVariant
                        LyricLineRole.UPCOMING -> MaterialTheme.colorScheme.onSurface
                    },
            )
        }
    }
}
