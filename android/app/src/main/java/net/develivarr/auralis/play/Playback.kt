package net.develivarr.auralis.play

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.RenderersFactory
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.audio.MediaCodecAudioRenderer
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.metadata.MetadataOutput
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.text.TextOutput
import androidx.media3.exoplayer.video.VideoRendererEventListener
import java.io.IOException
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.develivarr.auralis.api.ApiClient
import net.develivarr.auralis.generated.api.HLS_MIME
import net.develivarr.auralis.generated.api.MediaRef
import net.develivarr.auralis.generated.api.MediaSource as Source
import net.develivarr.auralis.generated.api.Ok
import net.develivarr.auralis.generated.api.PlayBody
import net.develivarr.auralis.generated.api.PlaybackPlan
import net.develivarr.auralis.generated.api.PlaybackTrack

/**
 * The player: asks the server for an item's [PlaybackPlan] and plays the whole plan on one Media3
 * [ExoPlayer], every track one item of its playlist, so the next file starts the moment the last
 * one ends. A transcode's HLS track plays through Media3's HLS source. The player has audio
 * renderers only (09-arch.md: Android builds Media3 with no video renderer), and fetches tracks
 * over OkHttp with the app's bearer, through [ApiClient.authorized]. [position] is on the whole
 * item's timeline, so chapters and progress work across files, as on the web.
 *
 * [player] belongs to the main thread; plans are fetched, and sessions closed, on [background].
 */
@OptIn(UnstableApi::class)
class Playback(
    context: Context,
    private val api: ApiClient,
    private val background: CoroutineScope,
    private val main: CoroutineContext = Dispatchers.Main,
) {
    private val context = context.applicationContext

    /** Where the player reads tracks from: the server, with the app's bearer on every request. */
    internal val dataSources: DataSource.Factory = OkHttpDataSource.Factory(api.authorized)

    /** Makes each track's source: HLS for a transcode's playlist, progressive for a file. */
    private val sources = DefaultMediaSourceFactory(dataSources)

    private val built = lazy {
        ExoPlayer.Builder(this.context, AudioOnlyRenderers(this.context))
            .setMediaSourceFactory(sources)
            .setLooper(Looper.getMainLooper())
            .build()
    }
    val player: ExoPlayer by built

    /** Set by [release], on the main thread: nothing plays after it. */
    private var released = false

    /** The plan playing, whose tracks' offsets place [position]; null before the first. */
    var plan: PlaybackPlan? = null
        private set

    /**
     * Seconds from the item's start: the current track's offset plus the time within it, no further
     * than its planned end, where the next track starts, so the position never goes back.
     */
    val position: Double
        get() {
            val plan = plan ?: return 0.0
            val track = plan.tracks.getOrNull(player.currentMediaItemIndex) ?: return plan.startAt
            return track.offset + minOf(player.currentPosition / 1000.0, track.duration)
        }

    /**
     * Plays the item a page's `<Play>` key names (`abs:<id>`). A key that names nothing playable,
     * such as a canvas placeholder, plays nothing and says so in the log; the result is then null.
     */
    fun play(key: String): Job? {
        val ref = refOf(key)
        if (ref == null) Log.w(TAG, "not a playable ref: $key")
        return ref?.let { play(it) }
    }

    /**
     * Fetches [ref]'s plan and plays it; a plan the server refuses plays nothing, and says so. A plan
     * that comes after [release] plays nothing either, and its session is closed.
     */
    fun play(ref: MediaRef): Job = background.launch {
        val plan = try {
            api.post("api/play", PlayBody(ref), PlayBody.serializer(), PlaybackPlan.serializer())
        } catch (e: IOException) {
            Log.w(TAG, "no plan for ${keyOf(ref)}", e)
            return@launch
        }
        if (plan.tracks.isEmpty()) {
            Log.w(TAG, "nothing to play for ${keyOf(ref)}")
            return@launch
        }
        withContext(main) {
            if (!released) return@withContext start(plan)
            Log.w(TAG, "released before its plan came: ${keyOf(ref)}")
            close(plan)
        }
    }

    /**
     * Plays [plan], which holds at least one track, from its `startAt`: the track that time falls
     * in, at that time within it. A track in a video container plays its soundtrack; the player
     * has nowhere to send its video.
     */
    fun start(plan: PlaybackPlan) {
        require(plan.tracks.isNotEmpty()) { "a plan with no tracks" }
        check(!released) { "a released player plays nothing" }
        this.plan?.let(::close)
        this.plan = plan
        val index = plan.tracks.indexOfLast { it.offset <= plan.startAt }.coerceAtLeast(0)
        val within = ((plan.startAt - plan.tracks[index].offset) * 1000).toLong().coerceAtLeast(0)
        player.setMediaSources(plan.tracks.map(::sourceOf), index, within)
        player.prepare()
        player.play()
    }

    /** [track]'s Media3 source, reading from the server: an HLS source for a transcode's playlist. */
    internal fun sourceOf(track: PlaybackTrack): MediaSource =
        sources.createMediaSource(
            MediaItem.Builder()
                .setUri(api.resolve(track.url).toString())
                .setMimeType(if (track.mime == HLS_MIME) MimeTypes.APPLICATION_M3U8 else track.mime)
                .build(),
        )

    /**
     * Stops, lets go of the player, and closes the plan's open playback session on the server if it
     * has one, ending its transcode. Nothing plays after it, not even a plan already on its way.
     * Releasing twice does nothing more.
     */
    fun release() {
        plan?.let(::close)
        plan = null
        if (released) return
        released = true
        if (built.isInitialized()) {
            player.clearMediaItems()
            player.release()
        }
    }

    /** Closes [plan]'s open playback session, if it has one; a refusal is only logged. */
    private fun close(plan: PlaybackPlan) {
        val playId = plan.progressTarget?.playId ?: return
        background.launch {
            try {
                api.post("api/play/$playId/close", Ok.serializer())
            } catch (e: IOException) {
                Log.w(TAG, "could not close play $playId", e)
            }
        }
    }

    companion object {
        private const val TAG = "Auralis"
        private val KEY = Regex("""^abs:([\w-]{1,64})$""")

        /** The ref a page's `<Play>` key names, `abs:<id>` (schema's `MediaRefKey`), or null. */
        fun refOf(key: String): MediaRef? =
            KEY.matchEntire(key)?.let { MediaRef(Source.ABS, it.groupValues[1]) }

        private fun keyOf(ref: MediaRef) = "${ref.source.name.lowercase()}:${ref.id}"
    }
}

/** Media3's renderers, audio only: nothing that could decode or show video is ever created. */
@OptIn(UnstableApi::class)
internal class AudioOnlyRenderers(private val context: Context) : RenderersFactory {
    override fun createRenderers(
        eventHandler: Handler,
        videoRendererEventListener: VideoRendererEventListener,
        audioRendererEventListener: AudioRendererEventListener,
        textRendererOutput: TextOutput,
        metadataRendererOutput: MetadataOutput,
    ): Array<Renderer> = arrayOf(
        MediaCodecAudioRenderer(
            context,
            MediaCodecSelector.DEFAULT,
            eventHandler,
            audioRendererEventListener,
            DefaultAudioSink.Builder(context).build(),
        ),
    )
}
