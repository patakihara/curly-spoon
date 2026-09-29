package net.develivarr.auralis.play

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
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
import net.develivarr.auralis.generated.api.MediaRef
import net.develivarr.auralis.generated.api.MediaSource
import net.develivarr.auralis.generated.api.PlayBody
import net.develivarr.auralis.generated.api.PlaybackPlan

/**
 * The player: asks the server for an item's [PlaybackPlan] and hands its tracks to one Media3
 * [ExoPlayer] as a playlist, starting at the plan's `startAt`. The player has audio renderers only
 * (10-arch.md: Android builds Media3 with no video renderer), and fetches tracks over OkHttp with
 * the app's bearer, through [ApiClient.authorized]. M0 plays one direct-play track; M1.play grows
 * this into the player core in place.
 *
 * [player] belongs to the main thread; plans are fetched on [background].
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

    val player: ExoPlayer by lazy {
        ExoPlayer.Builder(this.context, AudioOnlyRenderers(this.context))
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSources))
            .setLooper(Looper.getMainLooper())
            .build()
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

    /** Fetches [ref]'s plan and plays it; a plan the server refuses plays nothing, and says so. */
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
        withContext(main) { start(plan) }
    }

    /**
     * Plays [plan], which holds at least one track, from its `startAt`: the track that time falls
     * in, at that time within it. A track in a video container plays its soundtrack; the player
     * has nowhere to send its video.
     */
    fun start(plan: PlaybackPlan) {
        require(plan.tracks.isNotEmpty()) { "a plan with no tracks" }
        val items = plan.tracks.map { track ->
            MediaItem.Builder()
                .setUri(api.resolve(track.url).toString())
                .setMimeType(track.mime)
                .build()
        }
        val index = plan.tracks.indexOfLast { it.offset <= plan.startAt }.coerceAtLeast(0)
        val within = ((plan.startAt - plan.tracks[index].offset) * 1000).toLong().coerceAtLeast(0)
        player.setMediaItems(items, index, within)
        player.prepare()
        player.play()
    }

    companion object {
        private const val TAG = "Auralis"
        private val KEY = Regex("""^abs:([\w-]{1,64})$""")

        /** The ref a page's `<Play>` key names, `abs:<id>` (schema's `MediaRefKey`), or null. */
        fun refOf(key: String): MediaRef? =
            KEY.matchEntire(key)?.let { MediaRef(MediaSource.ABS, it.groupValues[1]) }

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
