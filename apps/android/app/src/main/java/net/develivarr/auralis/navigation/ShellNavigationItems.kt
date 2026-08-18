package net.develivarr.auralis.navigation

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import net.develivarr.auralis.ui.theme.AuralisAppTokens

/**
 * Renders one [NavigationBarItem] per [ShellDestination] present in [visibleDestinations], in
 * [ShellDestination.entries] order (Search last, matching the spec's bottom-bar ordering).
 * Extracted out of [AuralisShell] so wave 16d-A-2's gating — hide a destination whose upstream
 * isn't configured rather than showing a tab that can only 404 — is directly Robolectric-
 * testable without constructing the whole shell (`NavHostController`, `PlayerViewModel`,
 * `ImageLoader`). Call inside a [androidx.compose.material3.NavigationBar]'s content lambda,
 * whose receiver is [RowScope].
 *
 * Each item carries `Modifier.testTag(destination.name)` so `ShellNavigationItemsTest` can find
 * it directly rather than through [Icon]'s `contentDescription` or the label [Text] — both sit
 * under `NavigationBarItem`'s own merged-semantics node, and querying by content description
 * there proved unreliable in Robolectric. A tag on the item's own modifier is unambiguous
 * regardless of how the icon/label semantics end up merging.
 *
 * Wave 16f-A-2: the active destination's indicator pill now reads [AuralisAppTokens.current] —
 * web's compact bottom nav does the same thing, a solid `--accent` fill with `--accent-contrast`
 * content (`Chip.tsx`'s checked state, which the bottom pill already copies per `16c-2-W-3`).
 * Unselected items are left on [NavigationBarItemDefaults]' own neutral colours untouched.
 */
@Composable
internal fun RowScope.ShellNavigationBarItems(
    visibleDestinations: Set<ShellDestination>,
    activeDestination: ShellDestination?,
    onNavigate: (ShellDestination) -> Unit,
) {
    val tokens = AuralisAppTokens.current
    val colors =
        NavigationBarItemDefaults.colors(
            selectedIconColor = tokens.accentContrast,
            selectedTextColor = tokens.accentContrast,
            indicatorColor = tokens.accent,
        )
    ShellDestination.entries.filter { it in visibleDestinations }.forEach { destination ->
        NavigationBarItem(
            selected = destination == activeDestination,
            onClick = { onNavigate(destination) },
            icon = { Icon(destination.icon, contentDescription = destination.label) },
            label = { Text(destination.label) },
            colors = colors,
            modifier = Modifier.testTag(destination.name),
        )
    }
}

/**
 * The [NavigationRailItem] counterpart of [ShellNavigationBarItems], filtered the same way but
 * reordered with Search first (the spec's rail ordering — the opposite of the bottom bar). Call
 * inside a [androidx.compose.material3.NavigationRail]'s content lambda, whose receiver is
 * [ColumnScope].
 *
 * Wave 16f-A-2: same accent-backed indicator as [ShellNavigationBarItems] — web's desktop rail
 * also repaints its active destination from the accent (`Shell.tsx`'s `RAIL_ACTIVE_LINK_STYLE`,
 * `--surface-card`/`--accent-ink`), so this is the rail half of the same documented boundary.
 * Android's rail and bottom bar are the same Material 3 pill-indicator shape at different
 * layouts (unlike web, which draws two visually distinct treatments), so both read the identical
 * solid-fill pairing rather than inventing a second, web-specific tint scheme with no Android
 * design precedent to match it against.
 */
@Composable
internal fun ColumnScope.ShellNavigationRailItems(
    visibleDestinations: Set<ShellDestination>,
    activeDestination: ShellDestination?,
    onNavigate: (ShellDestination) -> Unit,
) {
    val tokens = AuralisAppTokens.current
    val colors =
        NavigationRailItemDefaults.colors(
            selectedIconColor = tokens.accentContrast,
            selectedTextColor = tokens.accentContrast,
            indicatorColor = tokens.accent,
        )
    val railOrder =
        listOf(ShellDestination.SEARCH) + ShellDestination.entries.filter { it != ShellDestination.SEARCH }
    railOrder.filter { it in visibleDestinations }.forEach { destination ->
        NavigationRailItem(
            selected = destination == activeDestination,
            onClick = { onNavigate(destination) },
            icon = { Icon(destination.icon, contentDescription = destination.label) },
            label = { Text(destination.label) },
            colors = colors,
        )
    }
}
