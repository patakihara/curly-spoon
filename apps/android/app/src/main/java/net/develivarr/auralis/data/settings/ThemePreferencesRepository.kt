package net.develivarr.auralis.data.settings

import androidx.compose.ui.graphics.Color
import net.develivarr.auralis.data.network.KeyValueStore
import net.develivarr.auralis.ui.theme.SonoraDefaultAccent
import kotlin.math.roundToInt

/**
 * Persists the two Settings-screen values wave 16f-A-1 adds — [ThemeMode] and the user's picked
 * accent [Color] — over the same [KeyValueStore] seam [ServerConfigRepository] already
 * established, rather than a new persistence mechanism.
 *
 * The accent is stored as an 8-hex-digit ARGB string built from [Color]'s own `red`/`green`/
 * `blue`/`alpha` `Float` channels (§[toHexArgb]) rather than [androidx.compose.ui.graphics.toArgb],
 * deliberately: those channel properties and the four-`Float` [Color] constructor are plain
 * arithmetic with no `android.graphics` call underneath, which is what makes this class (and its
 * test) runnable as a bare JVM unit test with no Robolectric — the same ceiling
 * [ServerConfigRepositoryTest] already sits at.
 */
class ThemePreferencesRepository(private val store: KeyValueStore) {
    suspend fun getMode(): ThemeMode = ThemeMode.fromStorageKeyOrDefault(store.getString(MODE_KEY))

    suspend fun setMode(mode: ThemeMode) = store.putString(MODE_KEY, mode.storageKey)

    suspend fun getAccent(): Color = store.getString(ACCENT_KEY)?.let(::hexArgbToColorOrNull) ?: SonoraDefaultAccent

    suspend fun setAccent(color: Color) = store.putString(ACCENT_KEY, color.toHexArgb())

    private companion object {
        const val MODE_KEY = "theme_mode"
        const val ACCENT_KEY = "theme_accent"
    }
}

/** `AARRGGBB`, each channel 0–255. Package-visible so the round-trip can be unit tested directly
 * as well as through [ThemePreferencesRepository]. */
internal fun Color.toHexArgb(): String {
    fun Float.toChannel() = (this * 255f).roundToInt().coerceIn(0, 255)
    return "%02X%02X%02X%02X".format(alpha.toChannel(), red.toChannel(), green.toChannel(), blue.toChannel())
}

/** Inverse of [toHexArgb]. `null` on anything that isn't exactly 8 hex digits — a corrupt or
 * foreign value degrades to the caller's own default rather than throwing. */
internal fun hexArgbToColorOrNull(hex: String): Color? {
    if (hex.length != 8) return null
    val argb = hex.toLongOrNull(16) ?: return null
    val a = ((argb shr 24) and 0xFF) / 255f
    val r = ((argb shr 16) and 0xFF) / 255f
    val g = ((argb shr 8) and 0xFF) / 255f
    val b = (argb and 0xFF) / 255f
    return Color(red = r, green = g, blue = b, alpha = a)
}
