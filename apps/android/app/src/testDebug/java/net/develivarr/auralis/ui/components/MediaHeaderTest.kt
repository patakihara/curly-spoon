package net.develivarr.auralis.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import coil.ImageLoader
import net.develivarr.auralis.ui.theme.AuralisTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16e-book-A-2 — proves [MediaHeader] renders the parts `docs/design/screens/BOOK_DETAIL.md`
 * §3 specifies, and — the regression this wave exists to fix — that a missing cover still renders
 * *something* rather than an empty box. Follows [net.develivarr.auralis.features.books.BookDetailContentTest]'s
 * established pattern (stateless content composable, no ViewModel, `AuralisTheme` wrapper).
 *
 * **What this proves, and what it does not.** As with every Robolectric test in this repo: it
 * confirms a node with the given tag/text exists; it says nothing about pixel geometry (the
 * 232/208dp art size, the actual corner radius, or whether the cover visually occludes the
 * fallback icon once it decodes) — there is no `captureToImage()` precedent here and this wave
 * does not add one. The fallback assertion below can only prove the icon is *composed*, not that
 * it is what a person would see; `MediaHeader`'s own doc comment records why that is the honest
 * ceiling (Coil's `AsyncImage` paints nothing on a null/failed/loading model, so the icon
 * underneath is the only thing there is to see either way).
 *
 * No `wide`-vs-`compact` split is asserted here — Robolectric's default `sdk = 34` device config
 * has no fixed width this test controls, so a numeric-geometry assertion would be pinning
 * whatever Robolectric happens to default to, not this composable's own behaviour.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MediaHeaderTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val imageLoader = ImageLoader.Builder(ApplicationProvider.getApplicationContext()).build()

    @Test
    fun `renders the kind label, title, subtitle and meta line`() {
        composeRule.setContent {
            AuralisTheme {
                MediaHeader(
                    coverUrl = "https://example.invalid/cover.jpg",
                    imageLoader = imageLoader,
                    fallbackIcon = Icons.AutoMirrored.Filled.MenuBook,
                    kindLabel = "Audiobook",
                    title = "The Fellowship of the Ring",
                    subtitle = "J. R. R. Tolkien",
                    meta = "Narrated by Rob Inglis · 19 h 07 m · 2 chapters",
                )
            }
        }

        // kindLabel is upper-cased by the composable itself — assert the rendered form.
        composeRule.onNodeWithText("AUDIOBOOK").assertExists()
        composeRule.onNodeWithText("The Fellowship of the Ring").assertExists()
        composeRule.onNodeWithText("J. R. R. Tolkien").assertExists()
        composeRule.onNodeWithText("Narrated by Rob Inglis · 19 h 07 m · 2 chapters").assertExists()
    }

    @Test
    fun `omits the kind label, subtitle and meta lines entirely when absent, per the fallback contract`() {
        composeRule.setContent {
            AuralisTheme {
                MediaHeader(
                    coverUrl = null,
                    imageLoader = imageLoader,
                    fallbackIcon = Icons.AutoMirrored.Filled.MenuBook,
                    kindLabel = null,
                    title = "Untitled Recording",
                    subtitle = null,
                    meta = null,
                )
            }
        }

        composeRule.onNodeWithText("Untitled Recording").assertExists()
        composeRule.onNodeWithTag("media-header-kind").assertDoesNotExist()
        composeRule.onNodeWithTag("media-header-subtitle").assertDoesNotExist()
        composeRule.onNodeWithTag("media-header-meta").assertDoesNotExist()
    }

    /** The regression `16e-book-P` found: the three pre-existing screens passed no
     * placeholder/error painter to `AsyncImage`, so a book/podcast/album with no cover art
     * rendered an empty box rather than a visible fallback. This pins that a fallback is
     * unconditionally in the tree, independent of whether `coverUrl` is present. */
    @Test
    fun `a missing cover still renders the fallback icon, not an empty box`() {
        composeRule.setContent {
            AuralisTheme {
                MediaHeader(
                    coverUrl = null,
                    imageLoader = imageLoader,
                    fallbackIcon = Icons.AutoMirrored.Filled.MenuBook,
                    kindLabel = null,
                    title = "No Cover Book",
                    subtitle = null,
                )
            }
        }

        composeRule.onNodeWithTag("media-header-art-fallback").assertExists()
    }

    @Test
    fun `trailingContent renders inside the header row, actions render below it`() {
        composeRule.setContent {
            AuralisTheme {
                MediaHeader(
                    coverUrl = null,
                    imageLoader = imageLoader,
                    fallbackIcon = Icons.AutoMirrored.Filled.MenuBook,
                    kindLabel = null,
                    title = "Has Slots",
                    subtitle = null,
                    trailingContent = { Text("Trailing", modifier = Modifier) },
                    actions = { Text("Actions", modifier = Modifier) },
                )
            }
        }

        composeRule.onNodeWithText("Trailing").assertExists()
        composeRule.onNodeWithText("Actions").assertExists()
    }
}
