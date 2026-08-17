package net.develivarr.auralis.data.settings

import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.test.runTest
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.ui.theme.SonoraAccentPresets
import net.develivarr.auralis.ui.theme.SonoraDefaultAccent
import org.junit.Assert.assertEquals
import org.junit.Test

class ThemePreferencesRepositoryTest {
    @Test
    fun `getMode defaults to SYSTEM when nothing has been set`() =
        runTest {
            val repository = ThemePreferencesRepository(FakeKeyValueStore())

            assertEquals(ThemeMode.SYSTEM, repository.getMode())
        }

    @Test
    fun `setMode then getMode round-trips LIGHT`() =
        runTest {
            val repository = ThemePreferencesRepository(FakeKeyValueStore())

            repository.setMode(ThemeMode.LIGHT)

            assertEquals(ThemeMode.LIGHT, repository.getMode())
        }

    @Test
    fun `setMode then getMode round-trips DARK`() =
        runTest {
            val repository = ThemePreferencesRepository(FakeKeyValueStore())

            repository.setMode(ThemeMode.DARK)

            assertEquals(ThemeMode.DARK, repository.getMode())
        }

    @Test
    fun `setMode then getMode round-trips SYSTEM explicitly`() =
        runTest {
            val repository = ThemePreferencesRepository(FakeKeyValueStore())
            repository.setMode(ThemeMode.LIGHT)

            repository.setMode(ThemeMode.SYSTEM)

            assertEquals(ThemeMode.SYSTEM, repository.getMode())
        }

    @Test
    fun `a corrupt stored mode falls back to SYSTEM rather than throwing`() =
        runTest {
            val store = FakeKeyValueStore()
            store.putString("theme_mode", "not-a-real-mode")
            val repository = ThemePreferencesRepository(store)

            assertEquals(ThemeMode.SYSTEM, repository.getMode())
        }

    @Test
    fun `getAccent defaults to SonoraDefaultAccent when nothing has been set`() =
        runTest {
            val repository = ThemePreferencesRepository(FakeKeyValueStore())

            assertEquals(SonoraDefaultAccent, repository.getAccent())
        }

    @Test
    fun `setAccent then getAccent round-trips every preset's channels`() =
        runTest {
            // Compared channel-by-channel (with a rounding tolerance) rather than via Color's
            // own equals(): Color's Float-channel constructor and its 0xAARRGGBB hex
            // constructor are not guaranteed to pack an identical-looking color into the same
            // underlying `value`, so structural equality is the wrong tool here even though
            // both represent the same visible color.
            val repository = ThemePreferencesRepository(FakeKeyValueStore())

            for (preset in SonoraAccentPresets) {
                repository.setAccent(preset)
                val roundTripped = repository.getAccent()
                assertEquals(preset.red, roundTripped.red, 0.01f)
                assertEquals(preset.green, roundTripped.green, 0.01f)
                assertEquals(preset.blue, roundTripped.blue, 0.01f)
                assertEquals(preset.alpha, roundTripped.alpha, 0.01f)
            }
        }

    @Test
    fun `a corrupt stored accent falls back to SonoraDefaultAccent rather than throwing`() =
        runTest {
            val store = FakeKeyValueStore()
            store.putString("theme_accent", "not-hex")
            val repository = ThemePreferencesRepository(store)

            assertEquals(SonoraDefaultAccent, repository.getAccent())
        }

    @Test
    fun `toHexArgb round-trips through hexArgbToColorOrNull for an arbitrary color`() {
        val color = Color(red = 0.2f, green = 0.5f, blue = 0.8f, alpha = 1f)

        val decoded = hexArgbToColorOrNull(color.toHexArgb())

        assertEquals(color.red, decoded!!.red, 0.01f)
        assertEquals(color.green, decoded.green, 0.01f)
        assertEquals(color.blue, decoded.blue, 0.01f)
        assertEquals(color.alpha, decoded.alpha, 0.01f)
    }
}
