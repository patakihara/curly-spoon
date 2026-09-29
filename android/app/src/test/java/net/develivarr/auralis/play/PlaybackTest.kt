package net.develivarr.auralis.play

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.test.utils.FakeMediaSource
import androidx.media3.test.utils.FakeTimeline
import androidx.media3.test.utils.robolectric.RobolectricUtil
import androidx.media3.test.utils.robolectric.ShadowMediaCodecConfig
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import net.develivarr.auralis.api.ApiClient
import net.develivarr.auralis.api.ApiJson
import net.develivarr.auralis.api.FakeServer
import net.develivarr.auralis.api.ServerConfig
import net.develivarr.auralis.auth.MemoryTokenStore
import net.develivarr.auralis.auth.Session
import net.develivarr.auralis.generated.api.MediaRef
import net.develivarr.auralis.generated.api.MediaSource
import net.develivarr.auralis.generated.api.PlayBody
import net.develivarr.auralis.generated.api.PlaybackPlan
import net.develivarr.auralis.generated.api.PlaybackTrack
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLog

@OptIn(UnstableApi::class)
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class PlaybackTest {
    // Robolectric has no codecs of its own; this gives the audio renderer one per audio format.
    @get:Rule
    val codecs: ShadowMediaCodecConfig = ShadowMediaCodecConfig.forAllSupportedMimeTypes()

    private val server = FakeServer()
    private val api = ApiClient(
        ServerConfig("http://127.0.0.1:8787/".toHttpUrl()),
        Session(MemoryTokenStore(token = "bearer-1", deviceId = "device-1")),
        server.client(),
    )

    // Unconfined runs the plan's fetch and the player's start in the test's own (main) thread.
    private val playback = Playback(
        ApplicationProvider.getApplicationContext(),
        api,
        CoroutineScope(Dispatchers.Unconfined),
        Dispatchers.Unconfined,
    )

    @After
    fun release() = playback.player.release()

    @Test
    fun `playing a ref asks the server for its plan, with the bearer`() {
        server.answer = { if (it.url.encodedPath == "/api/play") 200 to PLAN_JSON else 404 to "" }
        playback.play(REF)
        val asked = server.seen.first()
        assertEquals("POST", asked.request.method)
        assertEquals("/api/play", asked.request.url.encodedPath)
        assertEquals("Bearer bearer-1", asked.request.header("Authorization"))
        assertEquals(PlayBody(REF), ApiJson.decodeFromString(PlayBody.serializer(), asked.body!!))
        assertEquals(1, playback.player.mediaItemCount)
    }

    @Test
    fun `the plan's tracks become the player's playlist, starting at startAt`() {
        playback.start(
            PlaybackPlan(
                tracks = listOf(track(0, duration = 600.0, offset = 0.0), track(1, duration = 400.0, offset = 600.0)),
                chapters = emptyList(),
                startAt = 700.0,
            ),
        )
        val player = playback.player
        assertEquals(2, player.mediaItemCount)
        val second = player.getMediaItemAt(1).localConfiguration!!
        assertEquals("http://127.0.0.1:8787/api/media/abs:item-1/tracks/1", second.uri.toString())
        assertEquals(MimeTypes.AUDIO_MP4, second.mimeType)
        assertEquals(1, player.currentMediaItemIndex)
        assertEquals(100_000L, player.currentPosition)
        assertTrue(player.playWhenReady)
    }

    @Test
    fun `the player is built with audio renderers only`() {
        val player = playback.player
        assertTrue(player.rendererCount > 0)
        val types = (0 until player.rendererCount).map(player::getRendererType).toSet()
        assertEquals(setOf(C.TRACK_TYPE_AUDIO), types)
    }

    @Test
    fun `a track request carries the bearer and asks for a range`() {
        server.answer = { 206 to "audio" }
        val source = playback.dataSources.createDataSource()
        source.open(
            DataSpec.Builder()
                .setUri(api.resolve("/api/media/abs:item-1/tracks/0").toString())
                .setPosition(1000)
                .build(),
        )
        source.close()
        val request = server.seen.single().request
        assertEquals("Bearer bearer-1", request.header("Authorization"))
        assertEquals("bytes=1000-", request.header("Range"))
    }

    @Test
    fun `only an Audiobookshelf key names a playable ref`() {
        assertEquals(MediaRef(MediaSource.ABS, "item-1"), Playback.refOf("abs:item-1"))
        assertNull(Playback.refOf("salt-in-the-ledger"))
        assertNull(Playback.refOf("abs:../admin"))
    }

    @Test
    fun `a track in a video container is queued like any other, for its soundtrack`() {
        playback.start(
            PlaybackPlan(
                tracks = listOf(track(0, duration = 60.0, offset = 0.0).copy(mime = MimeTypes.VIDEO_MP4)),
                chapters = emptyList(),
                startAt = 0.0,
            ),
        )
        assertEquals(1, playback.player.mediaItemCount)
        assertEquals(MimeTypes.VIDEO_MP4, playback.player.getMediaItemAt(0).localConfiguration!!.mimeType)
    }

    @Test
    fun `a stream carrying video and audio plays the audio, and its video goes nowhere`() {
        val player = playback.player
        player.setMediaSource(FakeMediaSource(FakeTimeline(), VIDEO, AUDIO))
        player.prepare()
        RobolectricUtil.runMainLooperUntil { !player.currentTracks.isEmpty || player.playerError != null }
        assertNull(player.playerError)
        val tracks = player.currentTracks
        assertTrue(tracks.containsType(C.TRACK_TYPE_VIDEO))
        assertTrue(tracks.isTypeSelected(C.TRACK_TYPE_AUDIO))
        assertFalse(tracks.isTypeSelected(C.TRACK_TYPE_VIDEO))
    }

    @Test
    fun `a key that names nothing playable plays nothing, and says so`() {
        assertNull(playback.play("salt-in-the-ledger"))
        assertEquals(emptyList<FakeServer.Seen>(), server.seen)
        assertEquals(0, playback.player.mediaItemCount)
        assertTrue(said("not a playable ref: salt-in-the-ledger"))
    }

    @Test
    fun `a plan with no tracks plays nothing, and says so`() {
        server.answer = { 200 to """{"tracks":[],"chapters":[],"startAt":0}""" }
        playback.play("abs:item-1")
        assertEquals(0, playback.player.mediaItemCount)
        assertTrue(said("nothing to play for abs:item-1"))
    }

    @Test
    fun `a plan the server refuses plays nothing, and says so`() {
        server.answer = { 404 to """{"error":"not_found"}""" }
        playback.play(REF)
        assertEquals(0, playback.player.mediaItemCount)
        assertTrue(said("no plan for abs:item-1"))
    }

    @Test
    fun `no Media3 module that brings a video renderer or a video view is on the app's classpath`() {
        val present = VIDEO_CLASSES.filter {
            runCatching { Class.forName(it, false, javaClass.classLoader) }.isSuccess
        }
        assertEquals(emptyList<String>(), present)
    }

    private fun said(message: String) = ShadowLog.getLogsForTag("Auralis").any { it.msg == message }

    private fun track(n: Int, duration: Double, offset: Double) =
        PlaybackTrack(url = "/api/media/abs:item-1/tracks/$n", mime = "audio/mp4", duration = duration, offset = offset)

    private companion object {
        val REF = MediaRef(MediaSource.ABS, "item-1")
        const val PLAN_JSON =
            """{"tracks":[{"url":"/api/media/abs:item-1/tracks/0","mime":"audio/mp4","duration":20,"offset":0}],"chapters":[],"startAt":0}"""

        val VIDEO: Format = Format.Builder().setSampleMimeType(MimeTypes.VIDEO_H264).setWidth(64).setHeight(64).build()
        val AUDIO: Format =
            Format.Builder().setSampleMimeType(MimeTypes.AUDIO_AAC).setChannelCount(2).setSampleRate(44_100).build()

        /** One class from each Media3 module that adds video decoding or showing video. */
        val VIDEO_CLASSES = listOf(
            "androidx.media3.ui.PlayerView",
            "androidx.media3.decoder.vp9.LibvpxVideoRenderer",
            "androidx.media3.decoder.av1.Libgav1VideoRenderer",
            "androidx.media3.decoder.ffmpeg.ExperimentalFfmpegVideoRenderer",
            "androidx.media3.effect.DefaultVideoFrameProcessor",
            "androidx.media3.transformer.Transformer",
        )
    }
}
