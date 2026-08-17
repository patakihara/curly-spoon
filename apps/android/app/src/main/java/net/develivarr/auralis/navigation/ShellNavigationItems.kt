package net.develivarr.auralis.navigation

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

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
 */
@Composable
internal fun RowScope.ShellNavigationBarItems(
    visibleDestinations: Set<ShellDestination>,
    activeDestination: ShellDestination?,
    onNavigate: (ShellDestination) -> Unit,
) {
    ShellDestination.entries.filter { it in visibleDestinations }.forEach { destination ->
        NavigationBarItem(
            selected = destination == activeDestination,
            onClick = { onNavigate(destination) },
            icon = { Icon(destination.icon, contentDescription = destination.label) },
            label = { Text(destination.label) },
            modifier = Modifier.testTag(destination.name),
        )
    }
}

/**
 * The [NavigationRailItem] counterpart of [ShellNavigationBarItems], filtered the same way but
 * reordered with Search first (the spec's rail ordering — the opposite of the bottom bar). Call
 * inside a [androidx.compose.material3.NavigationRail]'s content lambda, whose receiver is
 * [ColumnScope].
 */
@Composable
internal fun ColumnScope.ShellNavigationRailItems(
    visibleDestinations: Set<ShellDestination>,
    activeDestination: ShellDestination?,
    onNavigate: (ShellDestination) -> Unit,
) {
    val railOrder =
        listOf(ShellDestination.SEARCH) + ShellDestination.entries.filter { it != ShellDestination.SEARCH }
    railOrder.filter { it in visibleDestinations }.forEach { destination ->
        NavigationRailItem(
            selected = destination == activeDestination,
            onClick = { onNavigate(destination) },
            icon = { Icon(destination.icon, contentDescription = destination.label) },
            label = { Text(destination.label) },
        )
    }
}
