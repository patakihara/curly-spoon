package net.auralis.app.features.player

import net.auralis.app.data.model.JellyfinLyricLine

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
 * [net.auralis.app.data.model.JellyfinLyrics.synced]'s own doc comment, for the verified source
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
