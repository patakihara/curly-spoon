package net.develivarr.auralis.features.music

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import coil.ImageLoader
import net.develivarr.auralis.ui.theme.AuralisTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16e-album-A: proves [AlbumDetailContent] — the album detail screen's stateless half —
 * renders `docs/design/screens/ALBUM_DETAIL.md` §2/§3/§5/§6/§10/§11's content inventory, and that
 * tapping the artist subtitle, Play, Shuffle or a track row reports the right thing back. Follows
 * [net.develivarr.auralis.features.podcasts.PodcastDetailContentTest]'s established pattern:
 * exercise the stateless content composable directly, not [AlbumDetailScreen] itself, which pumps
 * a real [AlbumDetailViewModel]'s and [net.develivarr.auralis.features.player.PlayerViewModel]'s
 * coroutines through `collectAsState`.
 *
 * This is `AlbumDetailScreen`'s **first** Robolectric coverage — `HANDOVER.md` and
 * `docs/design/screens/ALBUM_DETAIL.md` both record that it had none before this wave, confirmed
 * by directory listing before this file was added (the last of the three detail screens).
 *
 * **What this proves, and what it does not** — the same ceiling every Robolectric test in this
 * repo carries: it confirms a node with the given tag/text/contentDescription exists and that a
 * click reports the expected value; it says nothing about what the screen looks like, what
 * TalkBack actually announces, or what is reachable by touch. There is no device or emulator
 * here. No `captureToImage()` — this repo has no working precedent for it.
 *
 * Fixture values are the real `fakeJellyfin.ts` ones (`Driftwave`/`The Nebula Collective`/2021/
 * Synthwave/"Tidal Lines" 3:34/"Static Coast" 3:18), so the composed meta line
 * ("2021 · Synthwave · 2 tracks · 7 m") and the merged track announcements
 * ("Tidal Lines, 3:34" / "Static Coast, 3:18, Playing") are the spec's own literal examples, not
 * invented ones — checkable against `docs/design/screens/ALBUM_DETAIL.md` §5/§11 directly. Every
 * fixture field is a distinct literal (no shared strings between the two tracks), per the
 * `16e-podcast-A` review's own caught trap: a shared string makes `onNodeWithText` ambiguous.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AlbumDetailContentTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val imageLoader = ImageLoader.Builder(ApplicationProvider.getApplicationContext()).build()

    private val twoTracks =
        listOf(
            MusicTrackUi(id = "track-1", title = "Tidal Lines", position = "1", durationSeconds = 214L, favorite = false),
            MusicTrackUi(id = "track-2", title = "Static Coast", position = "2", durationSeconds = 198L, favorite = false),
        )

    private fun sampleState(
        tracks: List<MusicTrackUi> = twoTracks,
        total: Int = tracks.size,
        albumArtistId: String? = "artist-nebula",
        productionYear: Int? = 2021,
        genre: String? = "Synthwave",
    ) = AlbumDetailUiState.Loaded(
        albumName = "Driftwave",
        artistName = "The Nebula Collective",
        coverUrl = null,
        tracks = tracks,
        total = total,
        albumArtistId = albumArtistId,
        productionYear = productionYear,
        genre = genre,
    )

    /**
     * Wiring the meta line and Play/Shuffle into `MediaHeader`'s previously-empty `meta`/
     * `actions` slots (§10 of the spec) makes the header taller than the empty slots left it —
     * the exact same failure mode `BookDetailContentTest`'s and `PodcastDetailContentTest`'s own
     * doc comments already document for their own header-adoption/wiring waves. So every
     * assertion below on a track row scrolls to its target first rather than assuming it's
     * already composed.
     */
    private fun scrollToTag(tag: String) {
        composeRule
            .onNode(SemanticsMatcher.keyIsDefined(SemanticsActions.ScrollToIndex))
            .performScrollToNode(hasTestTag(tag))
    }

    private fun scrollToDescription(description: String) {
        composeRule
            .onNode(SemanticsMatcher.keyIsDefined(SemanticsActions.ScrollToIndex))
            .performScrollToNode(hasContentDescription(description))
    }

    /**
     * The track row's own click action lives on `TrackContextMenu`'s inner `combinedClickable`
     * `Box` — a *descendant* of the `album-track-<id>`-tagged `Row` (`TrackRow`'s own `Row`, per
     * §10's instruction to wrap the *inner* content `Row` with `semantics(mergeDescendants =
     * true)` rather than the whole `TrackRow`), not the same node. `TrackContextMenu` is shared
     * by `PlaylistDetailScreen`/`FavoritesScreen` too, so it's out of this wave's scope to add a
     * caller-supplied tag directly onto its clickable `Box`. This walks the *unmerged* tree
     * (bypassing any ambiguity in how a `mergeDescendants = true` descendant behaves under a
     * clickable ancestor — genuinely uncertain and unverified without a compiler, see this wave's
     * report) for the first clickable descendant of the tagged row — `TrackContextMenu`'s `Box`
     * is composed before the trailing "Add"/favourite buttons, so it is always first.
     */
    private fun clickTrackRow(trackId: String) {
        composeRule
            .onAllNodes(hasClickAction() and hasAnyAncestor(hasTestTag("album-track-$trackId")), useUnmergedTree = true)
            .onFirst()
            .performClick()
    }

    @Test
    fun `renders the header's kind label, title, subtitle, meta line and Play + Shuffle actions`() {
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = null,
                    onTrackClick = {},
                    onPlayAlbum = {},
                    onShuffleAlbum = {},
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = {},
                )
            }
        }

        composeRule.onNodeWithText("ALBUM").assertExists()
        composeRule.onNodeWithText("Driftwave").assertExists()
        composeRule.onNodeWithText("The Nebula Collective").assertExists()
        composeRule.onNodeWithText("2021 · Synthwave · 2 tracks · 7 m").assertExists()
        composeRule.onNodeWithTag("album-play-button").assertExists()
        composeRule.onNodeWithText("Play").assertExists()
        composeRule.onNodeWithTag("album-shuffle-button").assertExists()
        composeRule.onNodeWithText("Shuffle").assertExists()
        // The regression 16e-book-P found: a missing cover rendered an empty box on every
        // MediaHeader caller. Pins that the fallback icon is unconditionally in the tree here too.
        composeRule.onNodeWithTag("media-header-art-fallback").assertExists()
    }

    @Test
    fun `omits the meta line and Play + Shuffle actions when the album has zero tracks and no year or genre`() {
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(tracks = emptyList(), total = 0, productionYear = null, genre = null),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = null,
                    onTrackClick = {},
                    onPlayAlbum = {},
                    onShuffleAlbum = {},
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = {},
                )
            }
        }

        composeRule.onNodeWithTag("media-header-meta").assertDoesNotExist()
        composeRule.onNodeWithTag("album-play-button").assertDoesNotExist()
        composeRule.onNodeWithTag("album-shuffle-button").assertDoesNotExist()
        composeRule.onNodeWithText("No tracks found for this album.").assertExists()
    }

    /** §5's fallback table doesn't spell this edge case out explicitly — track count is "always
     * shown", the whole line is omitted only when there is *also* no year/genre — so an empty
     * album that still has a year must show "0 tracks" rather than omitting the line entirely. */
    @Test
    fun `still shows the meta line with 0 tracks when the album is empty but has a year`() {
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(tracks = emptyList(), total = 0, genre = null),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = null,
                    onTrackClick = {},
                    onPlayAlbum = {},
                    onShuffleAlbum = {},
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = {},
                )
            }
        }

        composeRule.onNodeWithText("2021 · 0 tracks").assertExists()
    }

    @Test
    fun `tapping the artist subtitle reports the album's artist id, not just any tap`() {
        var goneToArtist: String? = null
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(albumArtistId = "artist-nebula"),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = null,
                    onTrackClick = {},
                    onPlayAlbum = {},
                    onShuffleAlbum = {},
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = { goneToArtist = it },
                )
            }
        }

        composeRule.onNodeWithTag("media-header-subtitle").performClick()

        assertEquals("artist-nebula", goneToArtist)
    }

    @Test
    fun `the artist subtitle carries no click action when the album has no artist id`() {
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(albumArtistId = null),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = null,
                    onTrackClick = {},
                    onPlayAlbum = {},
                    onShuffleAlbum = {},
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = {},
                )
            }
        }

        composeRule.onNodeWithTag("media-header-subtitle").assertHasNoClickAction()
    }

    @Test
    fun `tapping Play and Shuffle each report distinctly, not the same callback`() {
        var played = false
        var shuffled = false
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = null,
                    onTrackClick = {},
                    onPlayAlbum = { played = true },
                    onShuffleAlbum = { shuffled = true },
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = {},
                )
            }
        }

        composeRule.onNodeWithTag("album-play-button").performClick()
        assertTrue(played)
        assertFalse(shuffled)

        composeRule.onNodeWithTag("album-shuffle-button").performClick()
        assertTrue(shuffled)
    }

    @Test
    fun `the Now playing label appears on exactly the active track's row and nowhere else`() {
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = "track-2",
                    onTrackClick = {},
                    onPlayAlbum = {},
                    onShuffleAlbum = {},
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = {},
                )
            }
        }

        scrollToTag("album-track-track-1")
        composeRule.onNodeWithTag("album-track-track-1-now-playing").assertDoesNotExist()
        scrollToTag("album-track-track-2")
        composeRule.onNodeWithTag("album-track-track-2-now-playing").assertExists()
        composeRule.onNodeWithText("Now playing").assertExists()
    }

    /**
     * Proves the merged-semantics grouping (§11 of the spec: "must announce, at minimum: its
     * title, its duration, and whether it's the one currently playing") end to end, not just as
     * a pure function in isolation — the same shape `BookDetailContentTest`'s active-chapter test
     * and `PodcastDetailContentTest`'s episode-row test both use. Literal examples straight from
     * §11: `"Tidal Lines, 3:34"`, and `"Tidal Lines, 3:34, Playing"` when active — here checked
     * against "Static Coast" instead, since track-2 is the one made active.
     */
    @Test
    fun `each track row's merged content description carries its title, duration and active state`() {
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = "track-2",
                    onTrackClick = {},
                    onPlayAlbum = {},
                    onShuffleAlbum = {},
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = {},
                )
            }
        }

        scrollToDescription("Tidal Lines, 3:34")
        composeRule.onNodeWithContentDescription("Tidal Lines, 3:34").assertExists()
        scrollToDescription("Static Coast, 3:18, Playing")
        composeRule.onNodeWithContentDescription("Static Coast, 3:18, Playing").assertExists()
    }

    @Test
    fun `tapping a track row reports that exact track, not just any tap`() {
        var tapped: MusicTrackUi? = null
        composeRule.setContent {
            AuralisTheme {
                AlbumDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    state = sampleState(),
                    onLoadMore = {},
                    albumId = "album-driftwave",
                    activeTrackId = null,
                    onTrackClick = { tapped = it },
                    onPlayAlbum = {},
                    onShuffleAlbum = {},
                    onToggleAlbumFavorite = {},
                    onToggleTrackFavorite = {},
                    onAddTrackToPlaylist = {},
                    onAddAlbumToPlaylist = {},
                    onPlayNext = {},
                    onPlayLast = {},
                    onGoToAlbum = {},
                    onGoToArtist = {},
                )
            }
        }

        scrollToTag("album-track-track-2")
        clickTrackRow("track-2")

        assertEquals("track-2", tapped?.id)
    }
}
