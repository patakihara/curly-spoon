package net.auralis.app.features.music

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import net.auralis.app.features.player.MusicQueueEntry
import net.auralis.app.features.player.QueueStore

/**
 * The long-press context menu for a song row (`docs/ROADMAP.md` §12e) — Play next, Play last,
 * Go to album, Go to artist. Mirrors `apps/web/src/features/music/trackContextMenu.ts` /
 * `TrackContextMenu.tsx`: [TrackMenuContext] and [buildTrackMenuItems] are the pure,
 * JVM-testable half (which items appear, given what the track actually carries), matching that
 * split so the branching logic is unit-testable without Compose. [TrackContextMenu] below is the
 * composable half — the long-press gesture and the [DropdownMenu] itself.
 *
 * Unlike web, where Mantine's `Menu.ContextMenu` already implements long-press/right-click, this
 * is the *first* use of [combinedClickable]/[DropdownMenu] anywhere in this app (see
 * `docs/HANDOVER.md`'s 12e claim note) — there is nothing existing to extend.
 */
data class TrackMenuContext(
    /** `null` when this track has no album (a single) — omits "Go to album". */
    val albumId: String?,
    /**
     * `null` when this track's artist id is unknown — omits "Go to artist". Matches
     * `apps/web/src/features/music/trackContextMenu.ts`'s `TrackMenuContext.artistId`: a track
     * read directly off [net.auralis.app.data.model.JellyfinTrack] carries `artistNames` but no
     * `artistId` at all, so every call site *except* [net.auralis.app.features.music.AlbumDetailScreen]'s
     * (which has a real per-album artist id, fetched via [AlbumDetailViewModel.load]'s existing
     * favourite-state fetch — see [AlbumDetailUiState.Loaded.albumArtistId]'s own doc comment)
     * passes `null` here rather than guessing.
     */
    val artistId: String?,
)

/** One row of the menu — a stable, ordered enum rather than a free-form string key, since unlike
 *  web's `MenuItemDescriptor` (which carries an `onSelect` closure per item) this project's
 *  Compose call site dispatches on the action itself, so the two need to agree on identity. */
enum class TrackMenuAction { PLAY_NEXT, PLAY_LAST, GO_TO_ALBUM, GO_TO_ARTIST }

data class TrackMenuItem(val action: TrackMenuAction, val label: String)

/**
 * Builds the ordered list of menu rows for [context]. Pure and Compose-free so the "which items
 * appear" branching — the part with real logic — is testable with a plain JUnit test, matching
 * `trackContextMenu.test.ts`'s reason for existing as its own module. "Play next"/"Play last"
 * always appear (the *availability* of a music queue to insert into is a runtime concern handled
 * by the caller's `onPlayNext`/`onPlayLast` callbacks — see [TrackContextMenu]'s doc comment —
 * not a reason to hide the menu item itself, mirroring web's identical choice not to hide those
 * two items when `queue` is `null`).
 */
fun buildTrackMenuItems(context: TrackMenuContext): List<TrackMenuItem> {
    val items =
        mutableListOf(
            TrackMenuItem(TrackMenuAction.PLAY_NEXT, "Play next"),
            TrackMenuItem(TrackMenuAction.PLAY_LAST, "Play last"),
        )
    if (context.albumId != null) {
        items += TrackMenuItem(TrackMenuAction.GO_TO_ALBUM, "Go to album")
    }
    if (context.artistId != null) {
        items += TrackMenuItem(TrackMenuAction.GO_TO_ARTIST, "Go to artist")
    }
    return items
}

/** Opens/closes one row's context menu — a small piece of state a row needs to hold itself
 *  (via [rememberTrackContextMenuState]), since long-press has to flip it and [TrackContextMenu]
 *  has to read it. Kept as its own tiny holder rather than a bare `MutableState<Boolean>` so a
 *  call site can't accidentally wire one row's `expanded` flag to another row's menu. */
class TrackContextMenuState internal constructor() {
    var expanded by mutableStateOf(false)
        internal set

    fun show() {
        expanded = true
    }

    fun dismiss() {
        expanded = false
    }
}

@Composable
fun rememberTrackContextMenuState(): TrackContextMenuState = remember { TrackContextMenuState() }

/**
 * Wraps a track row's normal tap area with long-press support and the [DropdownMenu] itself.
 * [rowModifier] is applied to the tappable [Box] area (the row's own layout, e.g. `weight(1f)`);
 * this composable adds [combinedClickable] on top of it rather than requiring the caller to,
 * because the long-press target and the menu's anchor must be the same [Box] — see
 * `AlbumDetailScreen.kt`'s `TrackRow` for the call-site shape (a `Box` this replaces a bare
 * `Modifier.clickable` inside).
 *
 * **`onPlayNext`/`onPlayLast` may refuse.** Neither is disabled or hidden when nothing safe to
 * enqueue exists — see [buildTrackMenuItems]'s doc comment — so the caller decides what
 * "refuse" means (a snackbar today; see `AlbumDetailScreen.kt`'s wiring) rather than this
 * composable owning any user-facing messaging itself.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TrackContextMenu(
    state: TrackContextMenuState,
    context: TrackMenuContext,
    onClick: () -> Unit,
    onPlayNext: () -> Unit,
    onPlayLast: () -> Unit,
    onGoToAlbum: (String) -> Unit,
    onGoToArtist: (String) -> Unit,
    rowModifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(modifier = rowModifier) {
        Box(
            modifier =
                Modifier.combinedClickable(
                    onClick = onClick,
                    onLongClick = { state.show() },
                ),
        ) {
            content()
        }
        DropdownMenu(expanded = state.expanded, onDismissRequest = { state.dismiss() }) {
            buildTrackMenuItems(context).forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.label) },
                    onClick = {
                        state.dismiss()
                        when (item.action) {
                            TrackMenuAction.PLAY_NEXT -> onPlayNext()
                            TrackMenuAction.PLAY_LAST -> onPlayLast()
                            TrackMenuAction.GO_TO_ALBUM -> context.albumId?.let(onGoToAlbum)
                            TrackMenuAction.GO_TO_ARTIST -> context.artistId?.let(onGoToArtist)
                        }
                    },
                )
            }
        }
    }
}

/**
 * The shared "insert into the music queue, or refuse" behaviour every call site needs —
 * mirrors `apps/web/src/features/music/TrackContextMenu.tsx`'s `enqueue` closure exactly: a
 * `null` [net.auralis.app.features.player.QueueStore.state] means either nothing is playing or
 * something non-music is playing, and this function can't and doesn't need to tell those apart —
 * either way there is nothing safe to enqueue into, so it reports failure through [onMessage]
 * rather than starting a fresh one-track queue that would risk silently interrupting a book or
 * podcast (see that file's doc comment for the full reasoning this mirrors, including why a
 * future queue-model change might revisit it).
 */
fun enqueueMusicTrack(
    musicQueue: QueueStore<MusicQueueEntry>,
    entry: MusicQueueEntry,
    position: TrackMenuAction,
    onMessage: (String) -> Unit,
) {
    if (musicQueue.state.value == null) {
        onMessage("Nothing is playing — play a track before adding \"${entry.title}\" to the queue.")
        return
    }
    when (position) {
        TrackMenuAction.PLAY_NEXT -> musicQueue.enqueueNext(entry)
        TrackMenuAction.PLAY_LAST -> musicQueue.enqueueLast(entry)
        else -> return
    }
    val positionLabel = if (position == TrackMenuAction.PLAY_NEXT) "next" else "last"
    onMessage("Added \"${entry.title}\" to play $positionLabel.")
}
