package net.develivarr.auralis.api

import android.os.Bundle
import net.develivarr.auralis.BuildConfig
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl

/** Which Auralis server the app talks to. */
data class ServerConfig(val baseUrl: HttpUrl) {
    companion object {
        /** The instrumentation argument an instrumented test names its server with. */
        const val ARGUMENT = "auralisServer"

        /** The server [arguments] name, else the build's default (`-PauralisServer`). */
        fun from(arguments: Bundle?): ServerConfig =
            ServerConfig((arguments?.getString(ARGUMENT) ?: BuildConfig.AURALIS_SERVER).toHttpUrl())
    }
}
