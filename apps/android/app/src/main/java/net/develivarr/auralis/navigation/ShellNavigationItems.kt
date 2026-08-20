package net.develivarr.auralis.navigation

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
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

/**
 * The rail-footer Settings entry wave 16e-settings-A adds
 * (`docs/design/screens/SETTINGS.md` §6.1) — closing the gap `16d-P` named: web's rail has always
 * had a `nav-rail-settings` footer link (`Shell.tsx`), and Android's Settings screen was
 * reachable only from the For You screen's own `TopAppBar` ([ShellDestination] has no SETTINGS
 * member, and does not gain one — Settings is not one of the five primary destinations, so it is
 * a separate rail item rather than a sixth [ShellDestination] entry).
 *
 * **Wide-window (`NavigationRail`) only, per the spec** — the compact bottom-`NavigationBar`
 * case is a real, named, deliberately deferred gap (§6.1/§7 of the spec): giving every
 * compact-mode screen a persistent Settings affordance would mean touching five screens'
 * `TopAppBar`s, out of this triple's scope. There is no [ShellNavigationBarItems] counterpart.
 *
 * Call as the LAST thing inside a [androidx.compose.material3.NavigationRail]'s content lambda,
 * after [ShellNavigationRailItems] — the `Modifier.weight(1f)` [Spacer] above the item pushes it
 * to the rail's bottom edge, below the five primary destinations, and composing it last also
 * places it last in keyboard/switch-access focus order (§11's requirement), for free, with no
 * separate focus-order wiring.
 *
 * **Purely additive.** Does not read or touch [ShellNavigationRailItems]'s own `tokens.accent`/
 * `.accentContrast` indicator expressions — this is a new call site with its own [AuralisAppTokens]
 * read for its own [NavigationRailItemDefaults.colors], not an edit to the existing ones.
 * `testTag("shell-nav-rail-settings")` for the same reason [ShellNavigationRailItems] tags by
 * `destination.name` rather than depending on a merged `contentDescription` query
 * (`ShellNavigationItemsTest`'s own doc comment: merged-content-description queries are
 * unreliable in this Robolectric configuration).
 */
@Composable
internal fun ColumnScope.ShellNavigationRailSettingsItem(
    selected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = AuralisAppTokens.current
    Spacer(modifier = Modifier.weight(1f))
    NavigationRailItem(
        selected = selected,
        onClick = onClick,
        icon = { Icon(Icons.Filled.Settings, contentDescription = "Settings") },
        label = { Text("Settings") },
        colors =
            NavigationRailItemDefaults.colors(
                selectedIconColor = tokens.accentContrast,
                selectedTextColor = tokens.accentContrast,
                indicatorColor = tokens.accent,
            ),
        modifier = Modifier.testTag("shell-nav-rail-settings"),
    )
}
