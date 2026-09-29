package net.develivarr.auralis.auth

/** A [TokenStore] held in memory, for tests off the device's Keystore. */
class MemoryTokenStore(
    private var token: String? = null,
    private var deviceId: String? = null,
) : TokenStore {
    override fun loadToken(): String? = token

    override fun saveToken(token: String?) {
        this.token = token
    }

    override fun loadDeviceId(): String? = deviceId

    override fun saveDeviceId(id: String) {
        deviceId = id
    }
}
