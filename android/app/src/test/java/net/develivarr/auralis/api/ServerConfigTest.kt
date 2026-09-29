package net.develivarr.auralis.api

import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.BuildConfig
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class ServerConfigTest {

    @Test
    fun `an instrumentation argument names the server`() {
        val arguments = Bundle().apply { putString(ServerConfig.ARGUMENT, "http://10.0.2.2:8787") }
        assertEquals("http://10.0.2.2:8787/".toHttpUrl(), ServerConfig.from(arguments).baseUrl)
    }

    @Test
    fun `without one, the build's default does`() {
        assertEquals(BuildConfig.AURALIS_SERVER.toHttpUrl(), ServerConfig.from(Bundle()).baseUrl)
        assertEquals(BuildConfig.AURALIS_SERVER.toHttpUrl(), ServerConfig.from(null).baseUrl)
    }
}
