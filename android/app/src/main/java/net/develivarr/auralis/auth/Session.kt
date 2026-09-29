package net.develivarr.auralis.auth

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import net.develivarr.auralis.generated.api.AppToken

/** Where the app keeps its bearer token and its device id between runs. */
interface TokenStore {
    fun loadToken(): String?

    fun saveToken(token: String?)

    fun loadDeviceId(): String?

    fun saveDeviceId(id: String)
}

/**
 * Whether the app is signed in. [token] is what the gate watches: none shows Sign in. The device
 * id outlives a sign-out, so signing in again reuses the same device on the server.
 */
class Session(private val store: TokenStore) {
    private val current = MutableStateFlow(store.loadToken())

    val token: StateFlow<String?> = current.asStateFlow()

    val deviceId: String? get() = store.loadDeviceId()

    fun signedIn(token: AppToken) {
        store.saveDeviceId(token.deviceId)
        store.saveToken(token.token)
        current.value = token.token
    }

    fun signedOut() {
        store.saveToken(null)
        current.value = null
    }
}
