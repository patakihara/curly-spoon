package net.develivarr.auralis

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.auth.KeystoreTokenStore
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/** The token store on a real device, where the Android Keystore exists. */
@RunWith(AndroidJUnit4::class)
class KeystoreTokenStoreTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @After
    fun signOut() {
        KeystoreTokenStore(context).saveToken(null)
    }

    @Test
    fun aTokenOutlivesTheStoreThatSavedItAndIsNeverKeptInTheClear() {
        KeystoreTokenStore(context).saveToken(TOKEN)
        assertEquals(TOKEN, KeystoreTokenStore(context).loadToken())
        val kept = context.getSharedPreferences(KeystoreTokenStore.PREFS, Context.MODE_PRIVATE).all
        assertFalse(kept.values.any { it.toString().contains(TOKEN) })
    }

    @Test
    fun signingOutForgetsTheTokenButKeepsTheDevice() {
        val store = KeystoreTokenStore(context)
        store.saveDeviceId("device-1")
        store.saveToken(TOKEN)
        store.saveToken(null)
        assertNull(KeystoreTokenStore(context).loadToken())
        assertEquals("device-1", KeystoreTokenStore(context).loadDeviceId())
    }

    private companion object {
        const val TOKEN = "a-bearer-token-for-this-test-only"
    }
}
