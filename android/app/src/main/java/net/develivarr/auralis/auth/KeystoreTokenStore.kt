package net.develivarr.auralis.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The bearer token, encrypted with AES-GCM under a key that never leaves the Android Keystore, in
 * the app's private preferences. A token that no longer decrypts (a backup restored onto another
 * device, say) reads as none, so the app asks to sign in again. The device id is no credential
 * and is kept in the clear.
 */
class KeystoreTokenStore(context: Context) : TokenStore {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun loadToken(): String? {
        val sealed = prefs.getString(TOKEN, null) ?: return null
        return try {
            val bytes = Base64.getDecoder().decode(sealed)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
            String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
        } catch (e: GeneralSecurityException) {
            prefs.edit().remove(TOKEN).apply()
            null
        } catch (e: IllegalArgumentException) {
            prefs.edit().remove(TOKEN).apply()
            null
        }
    }

    override fun saveToken(token: String?) {
        if (token == null) {
            prefs.edit().remove(TOKEN).commit()
            return
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        prefs.edit().putString(TOKEN, Base64.getEncoder().encodeToString(sealed)).commit()
    }

    override fun loadDeviceId(): String? = prefs.getString(DEVICE_ID, null)

    override fun saveDeviceId(id: String) {
        prefs.edit().putString(DEVICE_ID, id).commit()
    }

    private fun key(): SecretKey {
        val keystore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keystore.getKey(ALIAS, null) as SecretKey?)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(spec)
        return generator.generateKey()
    }

    companion object {
        /** The preferences file; an instrumented test reads it to check no token is in the clear. */
        const val PREFS = "auralis_auth"
        private const val TOKEN = "token"
        private const val DEVICE_ID = "device_id"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val ALIAS = "auralis_token"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_BYTES = 12
        private const val TAG_BITS = 128
    }
}
