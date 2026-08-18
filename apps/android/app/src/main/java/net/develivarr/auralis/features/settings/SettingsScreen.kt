package net.develivarr.auralis.features.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import net.develivarr.auralis.data.settings.ThemeMode
import net.develivarr.auralis.ui.theme.AuralisAppTokens

/**
 * Android's Settings screen (wave 16f-A-1 — `docs/ROADMAP.md` §16), closing the parity gap
 * `docs/HANDOVER.md` names: web has a working 17-swatch accent picker plus a light/dark/system
 * toggle, and Android could not be themed at all — [net.develivarr.auralis.ui.theme.AuralisTheme]
 * already accepted `accent`/`darkTheme` parameters with nothing but [MainActivity] as a call
 * site, and it passed neither.
 *
 * **Deliberately two controls only** — theme mode and accent — matching this wave's stated
 * scope. Server config, account/login, downloads and playback settings are not here; widening
 * this screen is a decision for whichever wave adds the next one, not this one.
 *
 * **Reached from the "For you" screen's top bar**, alongside its existing "Downloads"/"Requests"
 * text actions ([net.develivarr.auralis.features.home.ForYouScreen]) — not a sixth shell
 * destination. `AuralisShell`'s five destinations are the app's primary navigation; adding a
 * sixth for Settings would be a bigger, unscoped change to that surface than this wave owns, and
 * web's own placement (a compact chrome button, not a nav-bar tab) is the closer parity match
 * anyway.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(themeViewModel: ThemeViewModel) {
    val state by themeViewModel.state.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settings") }) },
    ) { innerPadding ->
        when (val current = state) {
            is ThemeUiState.Loading ->
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            is ThemeUiState.Ready ->
                SettingsContent(
                    mode = current.mode,
                    accent = current.accent,
                    onModeChange = themeViewModel::setMode,
                    onAccentChange = themeViewModel::setAccent,
                    modifier = Modifier.padding(innerPadding),
                )
        }
    }
}

/**
 * The screen's actual content, split out from [SettingsScreen] as a plain, state-hoisted
 * composable — no `ViewModel`, no `collectAsState` — so [ThemeUiState.Ready]'s two fields can be
 * rendered and asserted on directly in a Robolectric test without also having to pump a real
 * [ThemeViewModel]'s coroutines to reach a stable state first.
 */
@Composable
fun SettingsContent(
    mode: ThemeMode,
    accent: Color,
    onModeChange: (ThemeMode) -> Unit,
    onAccentChange: (Color) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Theme", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val tokens = AuralisAppTokens.current
                ThemeModeOptions.forEach { option ->
                    FilterChip(
                        selected = mode == option.mode,
                        onClick = { onModeChange(option.mode) },
                        label = { Text(option.label) },
                        // Wave 16f-A-2: the selected chip reads the accent, matching web's
                        // Chip.tsx checked state (`--accent` fill, `--accent-contrast` label) —
                        // this codebase's own "selected mode button" boundary. Unselected chips
                        // are left on FilterChipDefaults' own neutral colours untouched, matching
                        // Sonora's own primitives, which give the not-selected case no accent
                        // reference at all.
                        colors =
                            FilterChipDefaults.filterChipColors(
                                selectedContainerColor = tokens.accent,
                                selectedLabelColor = tokens.accentContrast,
                            ),
                        modifier = Modifier.testTag("theme-mode-${option.mode.name}"),
                    )
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Accent", style = MaterialTheme.typography.titleMedium)
            // Chunked plain Row/Column, matching this codebase's own established grid pattern
            // (`ForYouCarousel.kt`'s `QuickPickGrid`) rather than adding a `LazyVerticalGrid`
            // dependency this wave doesn't otherwise need.
            sonoraAccentPresetOptions.chunked(ACCENT_ROW_SIZE).forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    row.forEach { preset ->
                        AccentSwatch(
                            preset = preset,
                            selected = preset.color == accent,
                            onClick = { onAccentChange(preset.color) },
                        )
                    }
                }
            }
        }
    }
}

private const val ACCENT_ROW_SIZE = 6

private data class ThemeModeOption(val mode: ThemeMode, val label: String)

private val ThemeModeOptions =
    listOf(
        ThemeModeOption(ThemeMode.LIGHT, "Light"),
        ThemeModeOption(ThemeMode.DARK, "Dark"),
        ThemeModeOption(ThemeMode.SYSTEM, "System"),
    )

/**
 * One accent swatch. [androidx.compose.foundation.selection.selectable] (not a plain `clickable`)
 * is what gives this node its `selected`/`Role.RadioButton` semantics for free — matching
 * [ShellNavigationBarItems]'s underlying `NavigationBarItem` shape (mutually-exclusive choice,
 * exactly one selected) — with an explicit `testTag` on top, since
 * `ShellNavigationItemsTest`'s own doc comment already found that querying by merged
 * content description is unreliable in this Robolectric configuration; asserting by tag
 * sidesteps that question entirely rather than depending on it.
 *
 * Wave 16f-A-2: the selection ring reads [AuralisAppTokens.current]'s `accentInk` rather than
 * `MaterialTheme.colorScheme.onSurface` — the whole point of a picker is that choosing a swatch
 * repaints something, and the picker failing to repaint its own selection ring was the most
 * visibly wrong part of `16f-A-1`. `accentInk` (not raw `accent`) so the ring stays a readable
 * dark/light mark against every one of the 17 preset fills rather than tracking the *chosen*
 * accent, which would make the ring invisible against a same-colour swatch.
 */
@Composable
private fun AccentSwatch(
    preset: AccentPreset,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = AuralisAppTokens.current
    Box(
        modifier =
            Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(preset.color)
                .then(
                    if (selected) {
                        Modifier.border(3.dp, tokens.accentInk, CircleShape)
                    } else {
                        Modifier
                    },
                )
                .selectable(selected = selected, onClick = onClick, role = Role.RadioButton)
                .semantics { contentDescription = "${preset.label} accent" }
                .testTag("accent-preset-${preset.label}"),
    )
}
