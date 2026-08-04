package net.auralis.app.playback

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.MediaSession

/**
 * The one place in this project where a Media3 [MediaItem]/[MediaMetadata] gets built.
 *
 * `MediaItem.Builder().setUri(String)` and `MediaMetadata.Builder().setArtworkUri(Uri)` both
 * reach `android.net.Uri`, whose methods throw `RuntimeException` under this project's unit-test
 * setup — the stub `android.jar`, with no Robolectric and no
 * `testOptions.unitTests.isReturnDefaultValues` (see [PlaybackItemResolver]'s own doc comment).
 * So any code that constructs a `MediaItem` is unit-untestable here, by construction, and is
 * therefore isolated in this one file as pure mapping with no logic — everything decidable
 * (which id maps to what, which track is playable, which upstream call failed) lives in
 * [BrowseTreeRepository] and [PlaybackItemResolver], which are Media3-free and fully tested.
 *
 * Keep this file pure mapping: no branching beyond null-handling, no computation, no network.
 */

internal fun ResolvedPlayback.toMediaItem(): MediaItem {
    val metadata =
        MediaMetadata.Builder()
            .setTitle(title)
            .setIsPlayable(true)
            .setIsBrowsable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK)
            .apply {
                artist?.let { setArtist(it) }
                subtitle?.let { setSubtitle(it) }
                artworkUrl?.let { setArtworkUri(Uri.parse(it)) }
            }
            .build()
    return MediaItem.Builder()
        .setMediaId(mediaId)
        .setUri(uri)
        .setMediaMetadata(metadata)
        .build()
}

/**
 * The single-item playlist [MediaSession.Callback.onPlaybackResumption] hands back to Android
 * Auto after a reboot: this [ResolvedPlayback] as its only item, starting at its own
 * `startPositionMs` rather than 0 — the whole point of resumption being "pick up where you left
 * off", not "start over". `startIndex = 0` because there is exactly one item; confirmed against
 * the pinned Media3 1.5.1 tag (`MediaSession.java`'s `MediaItemsWithStartPosition` constructor:
 * `(List<MediaItem>, int startIndex, long startPositionMs)`) rather than assumed.
 */
internal fun ResolvedPlayback.toMediaItemsWithStartPosition(): MediaSession.MediaItemsWithStartPosition =
    MediaSession.MediaItemsWithStartPosition(
        listOf(toMediaItem()),
        0,
        startPositionMs,
    )

internal fun BrowseNode.toMediaItem(): MediaItem =
    when (this) {
        is BrowseFolder -> folderMediaItem(id, title)
        is BrowseBook -> {
            // `subtitle` carries the author string (see BrowseTreeRepository.toBrowseBook) — set
            // as `artist` too so a browse row and the same item's now-playing metadata agree,
            // matching ResolvedPlayback.subtitle's author fallback in PlaybackItemResolver.
            val metadata =
                MediaMetadata.Builder()
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setTitle(title)
                    .apply {
                        subtitle?.let {
                            setSubtitle(it)
                            setArtist(it)
                        }
                        coverUrl?.let { setArtworkUri(Uri.parse(it)) }
                    }
                    .build()
            MediaItem.Builder()
                .setMediaId(id)
                .setMediaMetadata(metadata)
                .build()
        }
    }

internal fun folderMediaItem(
    id: String,
    title: String,
): MediaItem {
    val metadata =
        MediaMetadata.Builder()
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
            .setTitle(title)
            .build()
    return MediaItem.Builder()
        .setMediaId(id)
        .setMediaMetadata(metadata)
        .build()
}
