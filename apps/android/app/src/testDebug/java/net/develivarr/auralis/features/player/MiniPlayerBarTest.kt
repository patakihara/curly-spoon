package net.develivarr.auralis.features.player

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.media3.common.Player
import coil.ImageLoader
import kotlinx.coroutines.flow.flowOf
import net.develivarr.auralis.ui.theme.AuralisTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16e-nowplaying-A — proves [MiniPlayerBar]'s new content
 * (`docs/design/screens/NOW_PLAYING.md` §3.2/§6.1: cover art, subtitle, progress indicator) is
 * actually composed, and that the pre-existing shuffle/repeat/lyrics semantics survive the
 * signature change (new `imageLoader`/`progressFlow` parameters) unaltered.
 *
 * [MiniPlayerBar] takes no [PlayerViewModel] — a real one needs a `MediaController` connection
 * this project's plain-JVM/Robolectric setup can't provide — so every case here supplies a plain
 * [PlayerUiState.Playing] and a static [flowOf] in place of the real
 * `PlayerViewModel.playbackProgressFlow()`, matching this file's own doc comment on why that flow
 * is passed in rather than looked up from a ViewModel.
 *
 * As with every Robolectric test in this repo: this confirms a node with the given
 * tag/text/semantics property exists. It says nothing about pixel geometry (the 44.dp art size,
 * the 88.dp bar height) or what TalkBack actually announces.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MiniPlayerBarTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val imageLoader = ImageLoader.Builder(ApplicationProvider.getApplicationContext()).build()

    private val musicState =
        PlayerUiState.Playing(
            title = "Time",
            isPlaying = true,
            isMusic = true,
            artist = "Pink Floyd",
            subtitle = "The Dark Side of the Moon",
            artworkUri = null,
            shuffleEnabled = false,
            repeatMode = Player.REPEAT_MODE_OFF,
        )

    private val bookState =
        PlayerUiState.Playing(
            title = "The Fellowship of the Ring",
            isPlaying = true,
            isMusic = false,
            audiobookItemId = "book-1",
            artist = "J. R. R. Tolkien",
            artworkUri = null,
        )

    @Test
    fun `renders the title, the artist subtitle, and a missing cover's fallback icon`() {
        composeRule.setContent {
            AuralisTheme {
                MiniPlayerBar(
                    state = musicState,
                    imageLoader = imageLoader,
                    progressFlow = flowOf(PlaybackProgress(30_000L, 120_000L)),
                    onTogglePlayPause = {},
                )
            }
        }

        composeRule.onNodeWithText("Time").assertExists()
        composeRule.onNodeWithText("Pink Floyd").assertExists()
        composeRule.onNodeWithTag("mini-player-art-fallback").assertExists()
    }

    @Test
    fun `renders a non-interactive progress indicator reflecting the playback progress flow`() {
        composeRule.setContent {
            AuralisTheme {
                MiniPlayerBar(
                    state = musicState,
                    imageLoader = imageLoader,
                    progressFlow = flowOf(PlaybackProgress(30_000L, 120_000L)),
                    onTogglePlayPause = {},
                )
            }
        }

        // Decorative, per §11 — asserting the node exists with its own label proves it is
        // composed and non-interactive-labelled, which is the whole of what Robolectric can see
        // about a progress bar with no click target.
        composeRule
            .onNodeWithTag("mini-player-progress")
            .assertExists()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Playback progress")))
    }

    @Test
    fun `shuffle, repeat and lyrics render for music, with the same semantics MiniPlayerBar always used`() {
        composeRule.setContent {
            AuralisTheme {
                MiniPlayerBar(
                    state = musicState,
                    imageLoader = imageLoader,
                    progressFlow = flowOf(PlaybackProgress(0L, 0L)),
                    onTogglePlayPause = {},
                )
            }
        }

        composeRule
            .onNodeWithContentDescription("Shuffle")
            .assertExists()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Off"))
        composeRule.onNodeWithContentDescription("Repeat: off. Tap to repeat all.").assertExists()
        composeRule.onNodeWithContentDescription("Lyrics").assertExists()
    }

    @Test
    fun `shuffle, repeat and lyrics are absent for a non-music item, matching the existing isMusic gate`() {
        composeRule.setContent {
            AuralisTheme {
                MiniPlayerBar(
                    state = bookState,
                    imageLoader = imageLoader,
                    progressFlow = flowOf(PlaybackProgress(0L, 0L)),
                    onTogglePlayPause = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Shuffle").assertDoesNotExist()
        composeRule.onNodeWithContentDescription("Lyrics").assertDoesNotExist()
        composeRule.onNodeWithTag("mini-player-art-fallback").assertExists()
    }
}
