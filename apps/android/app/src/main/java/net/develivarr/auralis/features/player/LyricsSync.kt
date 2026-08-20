package net.develivarr.auralis.features.player

import net.develivarr.auralis.data.model.JellyfinLyricLine

/**
 * Pure logic for the synced lyrics view (Android wave J) — mirrors
 * `apps/web/src/features/music/lyrics.ts`'s `activeLineIndex` decisions exactly (see that
 * file's own doc comment for the full reasoning this ports, not reinvents). Kept free of any
 * Android/Compose type, same reasoning `nextRepeatMode`/`isMusicMediaId` in `PlayerControls.kt`
 * already establish in this file's neighbour: this is where everything worth getting wrong
 * lives, and it is unit-testable with no player, no network, no Compose.
 *
 * Unlike the web version, this needs no separate queue-to-track position mapping.
 * `androidx.media3.common.Player.getCurrentPosition` already reports a position relative to the
 * *current* media item, not a cumulative queue timeline the way a browser `<audio>` element's
 * single `currentTime` does under `apps/web`'s synthesized multi-track queue — Media3 resets
 * `currentPosition` per item itself. So a caller (`LyricsViewModel`/
 * `PlayerViewModel.lyricsPositionMsFlow`) passes the controller's own `currentPosition` straight
 * through; there is no `resolveQueuePosition`-equivalent walk to reuse or re-derive here.
 */

/**
 * The index of the *active* line: the last line whose `startSeconds` is `<=` [positionSeconds].
 * Before the first timestamped line's start, no line is active (`null`) — never "the first
 * line", which would misrepresent a track's intro/instrumental lead-in as already being on line
 * one.
 *
 * Lines with a `null` `startSeconds` (unsynced) are skipped, never selected and never reset the
 * running "last one `<=` position" answer — so a hypothetical mixed-timestamp response degrades
 * to "skip the untimed lines" rather than crashing or mis-highlighting. In practice this never
 * happens: Jellyfin's two lyric parsers are mutually exclusive per response (see
 * `@auralis/jellyfin-client`'s `normalizeLyrics` doc comment, mirrored on
 * [net.develivarr.auralis.data.model.JellyfinLyrics.synced]'s own doc comment, for the verified source
 * citation) — either every line has a timestamp or none do.
 *
 * Line order is trusted as given, not re-sorted — same reasoning and same source citation as
 * `normalizeLyrics`: the parser that produces synced output already sorts by start time
 * server-side, and the one that produces unsynced output has no timestamp to sort by, so its
 * only meaningful order is the source file's own line order, which re-sorting has no correct way
 * to preserve.
 */
fun activeLineIndex(
    lines: List<JellyfinLyricLine>,
    positionSeconds: Double,
): Int? {
    var active: Int? = null
    for (i in lines.indices) {
        val start = lines[i].startSeconds
        if (start == null) continue
        if (start <= positionSeconds) {
            active = i
        } else {
            break
        }
    }
    return active
}

/**
 * Sonora's three-way lyric line treatment (`docs/design/screens/NOW_PLAYING.md` §3.5), keyed to
 * a line's position relative to [activeIndex] rather than the plain active/inactive boolean this
 * screen had before this wave. [ACTIVE] is the currently-sung line; [PASSED] is a line already
 * sung ([activeIndex] is non-null and the line's own index is smaller); [UPCOMING] is everything
 * not yet reached — including, deliberately, every line while [activeIndex] is `null` (unsynced
 * lyrics, or a synced position before the first timestamped line's start), matching §3.5's "keep
 * rendering every line in the 'not yet reached' role" instruction for the unsynced case.
 */
enum class LyricLineRole { ACTIVE, PASSED, UPCOMING }

/**
 * Maps one line's [index] to its [LyricLineRole] given the track's current [activeIndex] (from
 * [activeLineIndex], or `null` for an unsynced track). Pure so the mapping is directly
 * unit-testable without [LyricsScreen]'s Compose rendering — the render side only has to look up
 * the style/weight/colour triple for whichever role this returns.
 */
fun lyricLineRole(
    index: Int,
    activeIndex: Int?,
): LyricLineRole =
    when {
        activeIndex == null -> LyricLineRole.UPCOMING
        index == activeIndex -> LyricLineRole.ACTIVE
        index < activeIndex -> LyricLineRole.PASSED
        else -> LyricLineRole.UPCOMING
    }
