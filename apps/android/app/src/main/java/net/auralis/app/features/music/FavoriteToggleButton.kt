package net.auralis.app.features.music

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * The favourite toggle shared by every place this wave adds one: an album's track rows, an
 * album's own header, an artist's own header, and [FavoritesScreen]. Mirrors
 * `apps/web/src/features/music/FavoriteToggle.tsx`'s accessible-name copy exactly ("Remove X
 * from favourites" / "Add X to favourites") so both clients describe the same action the same
 * way, but renders as a plain [TextButton] rather than that file's icon-only `IconButton`.
 *
 * That's a deliberate, existing-precedent choice, not an oversight: `MiniPlayerBar.kt`'s own doc
 * comment already established that this app's bundled icon set (`material-icons-core`, a
 * transitive dependency of `material3` at this project's pinned Compose BOM) was never confirmed
 * to include the glyphs a two-state toggle would need, and `HomeScreen.kt`'s top-bar actions made
 * the same call for the same reason — this toggle follows that same, already-reviewed reasoning
 * rather than reopening it.
 *
 * Accessibility note, stated plainly because it is a real gap and not a compliant-by-construction
 * toggle: a [TextButton] whose own visible label already names the current state and what
 * tapping it does is announced to accessibility services as *its text content*, the same way
 * [MiniPlayerBar]'s play/pause toggle and `PodcastDetailScreen`'s episode-order toggle already
 * are — not the same thing as an accessibility-service-visible checked/unchecked toggle role
 * (`Modifier.semantics`/`Role.Switch`/`toggleable`), which nothing in this app uses anywhere yet
 * (grepped: no existing `Modifier.semantics` or `toggleable` usage) and was not introduced here
 * for that reason. See this wave's own final report for the deviation and why it was accepted
 * rather than papered over with an icon-based toggle whose dependency wasn't confirmed either.
 */
@Composable
internal fun FavoriteToggleButton(
    favorite: Boolean,
    itemName: String,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TextButton(onClick = onToggle, modifier = modifier) {
        Text(if (favorite) "Remove $itemName from favourites" else "Add $itemName to favourites")
    }
}
