package net.auralis.app.features.music

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription

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
 * rather than reopening it. That reasoning is about the *icon*, though, and doesn't bear on
 * accessibility semantics: [Role.Switch] and `stateDescription` below live in
 * `androidx.compose.ui.semantics`, part of the same `androidx.compose.ui:ui` artifact this file
 * already pulls in for [Modifier] — no icon dependency involved at all.
 *
 * Exposes proper toggle semantics via [Modifier.semantics]: [Role.Switch] tells an accessibility
 * service this is a two-state control, and `stateDescription` announces "on"/"off" as a state
 * change, distinct from [Text]'s own visible label. Without this, a screen reader hears only the
 * label's changing text — the same gap [MiniPlayerBar]'s play/pause toggle and
 * `PodcastDetailScreen`'s episode-order toggle still have, left alone here for the same
 * least-surprise reason: fixing every existing toggle in one pass is out of scope for this file.
 */
@Composable
internal fun FavoriteToggleButton(
    favorite: Boolean,
    itemName: String,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TextButton(
        onClick = onToggle,
        modifier =
            modifier.semantics {
                role = Role.Switch
                stateDescription = if (favorite) "On" else "Off"
            },
    ) {
        Text(if (favorite) "Remove $itemName from favourites" else "Add $itemName to favourites")
    }
}
