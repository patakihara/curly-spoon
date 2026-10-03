package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.AccountButtonProps
import net.develivarr.auralis.generated.ui.ArtistCardProps
import net.develivarr.auralis.generated.ui.BottomNavItem
import net.develivarr.auralis.generated.ui.BottomNavProps
import net.develivarr.auralis.generated.ui.ButtonGroupItem
import net.develivarr.auralis.generated.ui.ButtonGroupProps
import net.develivarr.auralis.generated.ui.ButtonProps
import net.develivarr.auralis.generated.ui.EpisodeRowProps
import net.develivarr.auralis.generated.ui.ExpandableTextProps
import net.develivarr.auralis.generated.ui.ExpanderRowProps
import net.develivarr.auralis.generated.ui.FeatureCardProps
import net.develivarr.auralis.generated.ui.FieldRowProps
import net.develivarr.auralis.generated.ui.FollowButtonProps
import net.develivarr.auralis.generated.ui.IconButtonProps
import net.develivarr.auralis.generated.ui.LyricsPageProps
import net.develivarr.auralis.generated.ui.MediaCardProps
import net.develivarr.auralis.generated.ui.MediaHeaderProps
import net.develivarr.auralis.generated.ui.MiniPlayerProps
import net.develivarr.auralis.generated.ui.NowPlayingPageProps
import net.develivarr.auralis.generated.ui.NowPlayingPlayer
import net.develivarr.auralis.generated.ui.NowPlayingProps
import net.develivarr.auralis.generated.ui.OverflowMenuItem
import net.develivarr.auralis.generated.ui.OverflowMenuProps
import net.develivarr.auralis.generated.ui.PreviewButtonProps
import net.develivarr.auralis.generated.ui.QueuePageProps
import net.develivarr.auralis.generated.ui.QuickPickProps
import net.develivarr.auralis.generated.ui.ResultRowProps
import net.develivarr.auralis.generated.ui.SearchFieldProps
import net.develivarr.auralis.generated.ui.SectionProps
import net.develivarr.auralis.generated.ui.SettingRowProps
import net.develivarr.auralis.generated.ui.SortFilterBarProps
import net.develivarr.auralis.generated.ui.StatusBannerProps
import net.develivarr.auralis.generated.ui.TabBarItem
import net.develivarr.auralis.generated.ui.TabBarProps
import net.develivarr.auralis.generated.ui.ValueRowProps
import net.develivarr.auralis.generated.ui.ViewToggleProps

/** How a states drawing is made: its actions bound, none at all, or bound with `disabled` set. */
enum class Variant { BOUND, NONE, DISABLED }

/**
 * One interactive Sonora component, drawn for the states screenshots (the Android twin of web's
 * `states-list.ts`): [draw] binds every action for [Variant.BOUND], none for [Variant.NONE], and
 * sets `disabled` for [Variant.DISABLED] when the component [declaresDisabled].
 */
class StateEntry(
    val name: String,
    val declaresDisabled: Boolean = false,
    val draw: @Composable (Variant) -> Unit,
) {
    override fun toString() = name
}

/** An action for [v]: a bound one unless the drawing has none. */
private fun act(v: Variant): (() -> Unit)? = if (v == Variant.NONE) null else ({})

private fun <T> pick(v: Variant): ((T) -> Unit)? = if (v == Variant.NONE) null else ({ _ -> })

private fun <A, B> pick2(v: Variant): ((A, B) -> Unit)? = if (v == Variant.NONE) null else ({ _, _ -> })

private fun off(v: Variant): Boolean? = if (v == Variant.DISABLED) true else null

/** Every interactive Compose component in `ui/sonora`, by name. */
val sonoraStates: List<StateEntry> = listOf(
    StateEntry("AccountButton") { v -> AccountButton(AccountButtonProps(label = "Account", onClick = act(v))) },
    StateEntry("ArtistCard") { v -> ArtistCard(ArtistCardProps(title = "Artist", onClick = act(v))) },
    StateEntry("BottomNav") { v ->
        BottomNav(
            BottomNavProps(
                items = listOf(BottomNavItem("home", "Home", "home"), BottomNavItem("music", "Music", "music_note")),
                active = "home",
                onChange = pick(v),
            ),
        )
    },
    StateEntry("Button", declaresDisabled = true) { v ->
        Button(ButtonProps(children = { SonoraIcon("play_arrow") }, onClick = act(v), disabled = off(v)))
    },
    StateEntry("ButtonGroup") { v ->
        ButtonGroup(
            ButtonGroupProps(
                items = listOf(ButtonGroupItem("all", "All"), ButtonGroupItem("books", "Books")),
                value = "all",
                onChange = pick(v),
            ),
        )
    },
    StateEntry("EpisodeRow") { v -> EpisodeRow(EpisodeRowProps(title = "Episode", onClick = act(v), onPlay = act(v))) },
    // Controlled, as web's fixture draws it: left uncontrolled it is enabled with no action.
    StateEntry("ExpandableText") { v ->
        ExpandableText(ExpandableTextProps(text = "A long description.", expanded = false, onToggle = pick(v)))
    },
    StateEntry("ExpanderRow") { v -> ExpanderRow(ExpanderRowProps(label = "Chapters", onToggle = pick(v))) },
    StateEntry("FeatureCard") { v ->
        FeatureCard(FeatureCardProps(title = "Feature", onPlay = act(v), onSave = act(v), onMore = act(v)))
    },
    StateEntry("FieldRow") { v -> FieldRow(FieldRowProps(label = "Server", value = "auralis", onChange = pick(v))) },
    StateEntry("FollowButton") { v -> FollowButton(FollowButtonProps(onChange = pick(v))) },
    StateEntry("IconButton", declaresDisabled = true) { v ->
        IconButton(IconButtonProps(label = "Close", icon = "close", onClick = act(v), disabled = off(v)))
    },
    StateEntry("LyricsPage") { v ->
        LyricsPage(LyricsPageProps(title = "Track", lines = listOf("A line"), onClose = act(v), onSyncModeChange = pick(v)))
    },
    StateEntry("MediaCard") { v ->
        MediaCard(MediaCardProps(title = "Album", onClick = act(v), onPlay = act(v), onMore = act(v), onRequest = act(v)))
    },
    StateEntry("MediaHeader") { v ->
        MediaHeader(
            MediaHeaderProps(
                title = "Album",
                onPlay = act(v),
                onPlayNext = act(v),
                onPlayLast = act(v),
                onDownload = act(v),
                onAdd = act(v),
            ),
        )
    },
    StateEntry("MiniPlayer") { v ->
        MiniPlayer(
            MiniPlayerProps(
                title = "Track",
                artist = "Artist",
                onOpen = act(v),
                onTogglePlay = act(v),
                onPrev = act(v),
                onNext = act(v),
            ),
        )
    },
    StateEntry("NowPlaying") { v ->
        NowPlaying(
            NowPlayingProps(
                tab = "now",
                onClose = act(v),
                onMore = act(v),
                onTabChange = pick(v),
                player = NowPlayingPlayer(onTogglePlay = act(v)),
            ),
        )
    },
    StateEntry("NowPlayingPage") { v ->
        NowPlayingPage(NowPlayingPageProps(title = "Track", onTogglePlay = act(v), onPrev = act(v), onNext = act(v)))
    },
    StateEntry("OverflowMenu") { v ->
        OverflowMenu(OverflowMenuProps(items = listOf(OverflowMenuItem("share", "Share")), label = "More", onSelect = pick(v)))
    },
    StateEntry("PreviewButton", declaresDisabled = true) { v ->
        PreviewButton(PreviewButtonProps(label = "Preview", onClick = act(v), disabled = off(v)))
    },
    StateEntry("QueuePage") { v ->
        QueuePage(QueuePageProps(heading = "Queue", onClear = act(v), onClose = act(v), onRemove = pick2(v)))
    },
    StateEntry("QuickPick") { v -> QuickPick(QuickPickProps(title = "Pick", onClick = act(v))) },
    StateEntry("ResultRow") { v -> ResultRow(ResultRowProps(title = "Result", onClick = act(v), onAction = act(v))) },
    StateEntry("SearchField", declaresDisabled = true) { v ->
        SearchField(SearchFieldProps(placeholder = "Search", value = "Sonora", onChange = pick(v), onClose = act(v), disabled = off(v)))
    },
    StateEntry("Section") { v -> Section(SectionProps(title = "Shelf", actionText = "See all", onAction = act(v))) },
    StateEntry("SettingRow") { v -> SettingRow(SettingRowProps(title = "Setting", checked = true, onChange = pick(v))) },
    StateEntry("SortFilterBar") { v -> SortFilterBar(SortFilterBarProps(label = "Sort", onClick = act(v))) },
    StateEntry("StatusBanner") { v ->
        StatusBanner(StatusBannerProps(children = null, actionLabel = "Retry", onAction = act(v), onDismiss = act(v)))
    },
    StateEntry("TabBar") { v ->
        TabBar(TabBarProps(items = listOf(TabBarItem("albums", "Albums"), TabBarItem("tracks", "Tracks")), value = "albums", onChange = pick(v)))
    },
    StateEntry("ValueRow") { v -> ValueRow(ValueRowProps(label = "Speed", value = "1x", onClick = act(v))) },
    StateEntry("ViewToggle") { v -> ViewToggle(ViewToggleProps(onChange = pick(v))) },
)
