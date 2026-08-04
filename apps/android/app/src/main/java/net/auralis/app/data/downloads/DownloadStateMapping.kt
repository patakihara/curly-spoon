package net.auralis.app.data.downloads

/**
 * Maps Media3's `Download.STATE_*` `Int` constants to this package's Media3-free [DownloadState],
 * as a **pure function taking an `Int`** rather than the real `androidx.media3.exoplayer.offline
 * .Download` type — so this mapping is fully unit-testable without a single Media3 import,
 * matching [MediaItemConversions]'s doc comment on why any `androidx.media3`/`android.*` import
 * makes a file unit-untestable under this project's stub-`android.jar` test setup. Wave F2's real
 * `DownloadEngine` (backed by Media3's `DownloadManager`) is the only place this function's `Int`
 * argument should come from `download.state` — a thin, logic-free call site, not tested here.
 *
 * Values read directly from `Download.java` in `androidx/media` on GitHub, at the `1.5.1` tag
 * pinned in `apps/android/gradle/libs.versions.toml` (`libraries/exoplayer/src/main/java/
 * androidx/media3/exoplayer/offline/Download.java`), not guessed:
 *
 * ```
 * STATE_QUEUED      = 0
 * STATE_STOPPED     = 1
 * STATE_DOWNLOADING = 2
 * STATE_COMPLETED   = 3
 * STATE_FAILED      = 4
 * STATE_REMOVING    = 5
 * // 6 is not defined upstream — skipped in Download.java's own numbering.
 * STATE_RESTARTING  = 7
 * ```
 *
 * `STATE_STOPPED` maps to [DownloadState.PAUSED]: it's Media3's own name for a download halted
 * by a stop reason (typically user-initiated), and this project's domain type spells that
 * `PAUSED` instead, matching the vocabulary the rest of the app already uses for a
 * user-controlled halt (see the player's own pause/play naming).
 *
 * `STATE_REMOVING` and `STATE_RESTARTING` both mean "the download manager is actively doing
 * something to this download right now" rather than idle or finished — mapped to
 * [DownloadState.DOWNLOADING] as the closest existing bucket. A dedicated "removing"/
 * "restarting" UI state is not worth the added complexity this wave would need to justify it;
 * revisit if Wave F2's UI needs to tell them apart.
 *
 * Any value outside the set above (a future Media3 upgrade adding a state this project hasn't
 * seen yet, or simply bad input) degrades to [DownloadState.FAILED] rather than throwing: a
 * total function must return *something*, and reporting an unrecognised state as progressing
 * normally would be more misleading than flagging it as failed.
 */
fun downloadStateFromMedia3(state: Int): DownloadState =
    when (state) {
        0 -> DownloadState.QUEUED
        1 -> DownloadState.PAUSED
        2 -> DownloadState.DOWNLOADING
        3 -> DownloadState.COMPLETED
        4 -> DownloadState.FAILED
        5, 7 -> DownloadState.DOWNLOADING
        else -> DownloadState.FAILED
    }
