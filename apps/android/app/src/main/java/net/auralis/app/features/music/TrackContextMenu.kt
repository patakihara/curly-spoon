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
import net.auralis.app.features.player.PlayerViewModel
import net.auralis.app.playback.ResolvedPlayback

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
 * The minimal per-track shape [resolvePlaybackFor] needs to build a real, insertable Media3
 * item — deliberately not any one screen's own UI model ([MusicTrackUi],
 * [MusicPlaylistEntryUi], [net.auralis.app.features.music.MusicFavoriteTrackUi]), since an
 * album row, a playlist row and a favourites row each carry the same information in a
 * different shape. Each call site (`AlbumDetailScreen.kt`/`PlaylistDetailScreen.kt`/
 * `FavoritesScreen.kt`) builds one from whatever it already has on hand rather than this file
 * depending on three unrelated screen-local types.
 */
data class EnqueueableTrack(
    val itemId: String,
    val title: String,
    val artist: String?,
    val albumOrPlaylistName: String?,
    val artworkUrl: String?,
)

/**
 * Resolves [track] into the [ResolvedPlayback] that [PlayerViewModel.enqueueTrackNext]/
 * [PlayerViewModel.enqueueTrackLast] insert into Media3's real playlist — the same
 * `mediaId = "track:$id"` scheme [albumPlaybackQueue] uses, so a track enqueued from a context
 * menu is indistinguishable, once playing, from one queued the ordinary "tap to play" way (the
 * `isMusicMediaId`/Jellyfin-progress-reporting gate in `PlayerViewModel.kt` keys off that same
 * prefix). [MusicRepository.trackStreamUrl] never awaits a network response (see that method's
 * own doc comment) — this is `suspend` only because that method's signature is, matching every
 * other queue builder in this app ([AlbumDetailViewModel.buildQueueFrom] etc.) that calls it the
 * same way.
 */
suspend fun resolvePlaybackFor(
    musicRepository: MusicRepository,
    track: EnqueueableTrack,
): ResolvedPlayback =
    ResolvedPlayback(
        mediaId = "track:${track.itemId}",
        uri = musicRepository.trackStreamUrl(track.itemId),
        title = track.title,
        artist = track.artist,
        subtitle = track.albumOrPlaylistName,
        artworkUrl = track.artworkUrl,
        startPositionMs = 0L,
    )

/**
 * The Compose-facing "insert [track] into Media3's real playlist, or refuse" action every
 * [TrackContextMenu] call site wires its `onPlayNext`/`onPlayLast` to. Replaces a shipped
 * defect: the previous version of this function inserted into
 * [net.auralis.app.features.player.PlayerViewModel.musicQueue] instead of into Media3, which
 * nothing ever reads back into playback — the action reported success and queued nothing (see
 * that field's own doc comment for the full account). This version resolves [track] and hands
 * it to [PlayerViewModel.enqueueTrackNext]/`enqueueTrackLast`, which insert into the actual
 * playlist and refuse (with [onMessage] still reporting it) when there is no music playlist to
 * insert into — see those methods' own doc comments for the refusal rule.
 *
 * `suspend`, not a plain callback: both resolving [track] (a `MusicRepository.trackStreamUrl`
 * call) and inserting it are suspend calls. Every call site wraps this in its own
 * `coroutineScope.launch`, and [onMessage] is itself `suspend` so a call site can show the
 * result via `SnackbarHostState.showSnackbar` directly, without a second nested `launch`.
 */
suspend fun enqueueTrackViaMediaController(
    playerViewModel: PlayerViewModel,
    musicRepository: MusicRepository,
    track: EnqueueableTrack,
    position: TrackMenuAction,
    onMessage: suspend (String) -> Unit,
) {
    val resolved = resolvePlaybackFor(musicRepository, track)
    val inserted =
        when (position) {
            TrackMenuAction.PLAY_NEXT -> playerViewModel.enqueueTrackNext(resolved)
            TrackMenuAction.PLAY_LAST -> playerViewModel.enqueueTrackLast(resolved)
            else -> return
        }
    onMessage(
        if (inserted) {
            val positionLabel = if (position == TrackMenuAction.PLAY_NEXT) "next" else "last"
            "Added \"${track.title}\" to play $positionLabel."
        } else {
            "Nothing is playing — play a track before adding \"${track.title}\" to the queue."
        },
    )
}
