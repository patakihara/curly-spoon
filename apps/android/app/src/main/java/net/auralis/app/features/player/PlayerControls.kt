package net.auralis.app.features.player

import androidx.media3.common.Player

/**
 * Shuffle and repeat for music playback (Android wave H). Deliberately thin: Media3/ExoPlayer
 * already owns shuffle and repeat state and behaviour (`Player.setShuffleModeEnabled`/
 * `getShuffleModeEnabled`, `Player.setRepeatMode`/`getRepeatMode`) — see
 * `apps/web/src/features/player/`'s own shuffle/repeat, which had to build a permutation and a
 * cursor from scratch because a browser `<audio>` element has no queue concept at all. Android's
 * player does, so this file holds only the two bits of logic that don't already live on
 * [Player]: which mode comes next when the user taps the repeat control, and what to tell a
 * screen reader about it.
 */

/**
 * Cycles [Player]'s repeat mode off -> all -> one -> off on each tap. A pure function so the
 * cycle order is unit-testable without a real or fake [Player] — see [PlayerViewModel] for the
 * only caller, which reads the controller's current [Player.getRepeatMode] and writes the result
 * of this function back via [Player.setRepeatMode].
 */
fun nextRepeatMode(current: Int): Int =
    when (current) {
        Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
        Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
        Player.REPEAT_MODE_ONE -> Player.REPEAT_MODE_OFF
        // Player.repeatMode is an @Player.RepeatMode Int, not a sealed type, so a value outside
        // the three known constants is reachable in principle (a future Media3 addition, or a
        // caller passing an arbitrary Int). Treat the unknown *current* value as REPEAT_MODE_OFF
        // and return what OFF maps to, rather than throwing — matches this project's
        // total-function house style. Returning OFF here instead would make the tap a no-op from
        // a state the user can already see is not "off", which reads as a dead control.
        else -> Player.REPEAT_MODE_ALL
    }

/**
 * Whether [mediaId] identifies a Jellyfin music item — the same rule [PlayerViewModel] uses to
 * decide whether shuffle/repeat controls should even be shown. Reuses
 * [jellyfinItemIdFromMediaId] rather than re-deriving the `track:` prefix check a second time:
 * that function is already the single gating point that keeps audiobook/podcast playback silent
 * to Jellyfin, and the "is this music" question shuffle/repeat needs is the identical question,
 * asked for a different purpose.
 */
fun isMusicMediaId(mediaId: String?): Boolean = jellyfinItemIdFromMediaId(mediaId) != null

/**
 * The accessible description for the repeat control. A screen reader can't tell three states
 * apart from a boolean toggle role the way [FavoriteToggleButton]'s two-state
 * `Role.Switch`/`stateDescription` can, so this control instead carries a fully-worded
 * `contentDescription` that names the state directly — the Android counterpart to
 * `apps/web/src/features/player/`'s repeat button needing more than `aria-pressed` for the same
 * reason.
 */
fun repeatModeContentDescription(repeatMode: Int): String =
    when (repeatMode) {
        Player.REPEAT_MODE_ALL -> "Repeat all: on. Tap to repeat one."
        Player.REPEAT_MODE_ONE -> "Repeat one: on. Tap to turn repeat off."
        else -> "Repeat: off. Tap to repeat all."
    }
