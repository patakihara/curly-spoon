package net.develivarr.auralis.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.ImageLoader
import coil.compose.AsyncImage

/**
 * Every card geometry number for "For you" (docs/ROADMAP.md §12d), in one place, used by every
 * card this screen renders — [ForYouCard] and [QuickPickTile] both read from here rather than
 * having their own literals, which is the structural substitute for the visual check this
 * machine cannot run (see the wave's spec, "What you cannot verify"). Mirrors
 * `apps/web/src/features/home/Carousel.tsx`'s own constants (`CARD_WIDTH`/`COVER_SIZE` = 160,
 * the fixed title/subtitle/progress row heights) at Android's own density-independent unit.
 *
 * `docs/design/screens/FOR_YOU.md` §3.1/§3.2, wave 16e-foryou-A: `CARD_WIDTH`/`COVER_SIZE`/
 * `QUICK_TILE_COVER_SIZE` are now Sonora's **compact** column values (152dp/152dp/48dp) —
 * Android always renders the compact/mobile column, there being no Android equivalent of web's
 * wide desktop layout on this screen (§3.1's own column-convention note).
 */
object ForYouCarouselDimens {
    val CARD_WIDTH: Dp = 152.dp
    val COVER_SIZE: Dp = 152.dp
    val CARD_SPACING: Dp = 16.dp
    val CARD_ROW_CONTENT_PADDING: Dp = 16.dp

    /** Fixed rather than left to the text's own line box, for the same reason
     * `Carousel.tsx`'s `TITLE_STYLE` gives: every card must be exactly the same height whether
     * or not this item has a subtitle or a progress value — a taller card for a mid-listen book
     * than for an album is exactly the "one card geometry" requirement this wave exists to
     * satisfy. */
    val TITLE_ROW_HEIGHT: Dp = 18.dp
    val SUBTITLE_ROW_HEIGHT: Dp = 16.dp

    /** Matches [androidx.compose.material3.LinearProgressIndicator]'s own default track
     * thickness closely enough that a progress row and a no-progress row (a plain spacer of the
     * same height) don't visibly jump — see `Carousel.tsx`'s identical `PROGRESS_ROW_STYLE`
     * comment. */
    val PROGRESS_ROW_HEIGHT: Dp = 4.dp

    val TEXT_TOP_SPACING: Dp = 8.dp
    val TEXT_LINE_SPACING: Dp = 2.dp

    val QUICK_TILE_COVER_SIZE: Dp = 48.dp
    val QUICK_GRID_SPACING: Dp = 8.dp
    val QUICK_GRID_PADDING: Dp = 16.dp

    /** §3.1's compact-column art radius (`--radius-sm` = 16px) — [MaterialTheme.shapes.small]
     * already resolves to exactly this value (`ui/theme/Shape.kt`'s `SonoraShapes`), so this is
     * read off the shape scale rather than re-declared as a second literal. */
    val CARD_ART_SHAPE: Shape = RoundedCornerShape(16.dp)

    /** §3.2's art radius for [QuickPickTile] — "8px (hardcoded literal, not a token — confirmed
     * in source)" in Sonora's own file. [MaterialTheme.shapes.extraSmall] is numerically the same
     * 8dp value; kept as its own literal here rather than reached through the shape scale, since
     * the design source itself deliberately does not treat this one as a token. */
    val QUICK_TILE_ART_SHAPE: Shape = RoundedCornerShape(8.dp)

    /** §3.2's compact-column "Row gap" — the flex `gap` between [QuickPickTile]'s art tile and
     * its text column, read off `docs/design/sonora/components/QuickPick.dc.html`'s own
     * `rootStyle` for `platform: 'mobile'` (`gap: (mobile ? '10px' : '12px')`). Deliberately a
     * distinct constant from [QUICK_GRID_SPACING] — that one is the *grid's* spacing between
     * tiles/rows, page composition §3.2 does not touch, and reusing it here would have coupled
     * two unrelated numbers that only happened to share a value (8dp) before this wave. */
    val QUICK_ROW_GAP: Dp = 10.dp

    /** §3.2's compact-column row padding — `QuickPick.dc.html`'s `padding: 8px`, identical at
     * both breakpoints in Sonora's own source. */
    val QUICK_ROW_PADDING: Dp = 8.dp

    /** §3.2's compact-column row background/radius chrome, wave 16e-foryou-A-2: previously
     * absent entirely — [QuickPickTile]'s `Row` carried no background, padding or radius of its
     * own, confirmed pre-existing (not introduced by 16e-foryou-A) by reading the tree before
     * this wave's first edit. Radius is `var(--radius-sm)` (16px), numerically the same value as
     * [CARD_ART_SHAPE] (both read `--radius-sm`) but kept as its own named constant — the two
     * shapes cover unrelated surfaces, a card's art tile versus a quick-pick row's own
     * background, and conflating them would make a future change to one silently move the other.
     */
    val QUICK_ROW_SHAPE: Shape = RoundedCornerShape(16.dp)
}

/** The one icon [ForYouCard]/[QuickPickTile] fall back to behind a cover that hasn't loaded
 * (or has no URL) — keyed on content type, never on a per-card branch that changes card size or
 * geometry. */
private fun fallbackIconFor(contentType: ForYouContentType): ImageVector =
    when (contentType) {
        ForYouContentType.BOOKS -> Icons.AutoMirrored.Filled.MenuBook
        ForYouContentType.PODCASTS -> Icons.Filled.Podcasts
        ForYouContentType.MUSIC -> Icons.Filled.MusicNote
    }

/** An accessible name for a card/tile: title alone, or "title, subtitle" when there is one —
 * mirrors `Carousel.tsx`'s exported `cardLabel`. */
internal fun feedItemContentDescription(item: FeedItem): String =
    if (item.subtitle != null) "${item.title}, ${item.subtitle}" else item.title

/** The reason line's presence/absence decision, pulled out of [ForYouCarouselRow] so it is
 * testable without a Compose test harness (this project has none for `features/home/` — see
 * [ForYouFeedTest] for the equivalent pattern on [feedItemContentDescription]). `null` and a
 * blank string both mean "nothing worth rendering"; never asserted on verbatim wording — see
 * [FeedCarousel.reason]'s doc comment for why. */
internal fun carouselReasonText(carousel: FeedCarousel): String? = carousel.reason?.takeIf { it.isNotBlank() }

/** Wave 15d — the visible/announced label for a [FeedItem] whose [FeedItem.isExternal] is
 * `true`: a recommendation from an outside provider (ListenBrainz, today) that the signed-in
 * user does not have in their Jellyfin library. Shared by [ForYouCard]'s visible overlay badge
 * and [feedItemAnnouncement]'s merged `contentDescription`, so the two text sources can never
 * drift apart — a badge whose wording differs from what TalkBack announces would itself be a
 * parity bug, just within one platform instead of across two.
 *
 * `docs/design/screens/FOR_YOU.md` §6.3, wave 16e-foryou-A: this was `"Not in your library"`,
 * disagreeing with Sonora's own vendored source, web's visible badge, *and* web's `aria-label`
 * suffix — a genuine three-way mismatch, all four strings different. `"Not in library"`, Sonora's
 * literal string, is now canonical on both platforms and is the byte-for-byte parity target for
 * this triple's `-P` review. */
internal const val EXTERNAL_RECOMMENDATION_LABEL = "Not in library"

/**
 * The single accessible announcement for one [ForYouCard] — [feedItemContentDescription] plus,
 * when the owning shelf carries one, its [reason] (already blank-filtered by
 * [carouselReasonText]).
 *
 * **This deliberately diverges from `apps/web/src/features/home/Carousel.tsx`'s mechanism, not
 * its intent.** Web ties the reason to the *card list* via `aria-describedby` (one shared
 * description on the `role="list"` container, set once per shelf) and gives each card button its
 * own `aria-label` of title/subtitle only — so on web, name and description are two DOM nodes.
 * Compose's semantics tree has no equivalent of "this list is described by that paragraph";
 * `mergeDescendants` only merges a subtree into its own ancestor, and [ForYouCard] does not
 * contain the reason `Text` — [ForYouCarouselRow] renders it once, as a sibling of the whole
 * [androidx.compose.foundation.lazy.LazyRow]. Re-parenting the reason under every card just to
 * get an `aria-describedby` analogue would announce the same sentence once per card while
 * scrolling, which is worse than what it replaces. Folding it into each card's own merged
 * `contentDescription` is the closest single-node equivalent TalkBack has, so a listener still
 * hears why the shelf is showing this item — do not "fix" this back into a name/description split
 * without a mechanism that avoids that repetition.
 *
 * Wave 15d: when [FeedItem.isExternal] is `true`, [EXTERNAL_RECOMMENDATION_LABEL] is folded in
 * the same way — a listener must be told this item is not in their library, not just shown a
 * badge sighted users can see and a screen-reader user cannot. Ordered before [reason] so the
 * ownership status reads as a qualifier on the item's identity, ahead of *why* it's being
 * suggested. */
internal fun feedItemAnnouncement(item: FeedItem, reason: String?): String {
    val name = feedItemContentDescription(item)
    val parts = mutableListOf(name)
    if (item.isExternal) parts.add(EXTERNAL_RECOMMENDATION_LABEL)
    if (reason != null) parts.add(reason)
    return parts.joinToString(" — ")
}

/**
 * The **single** card composable for every "For you" carousel, regardless of content type — the
 * requirement this wave exists to satisfy is "one card geometry, one carousel pattern,
 * repeated" (docs/ROADMAP.md §12d), and the reference screenshots' own anti-pattern
 * (`04-for-you.jpg`: a 4-column icon grid for shows, then full-width episode cards) is exactly
 * what a second card composable would risk drifting into. Every card is a fixed
 * [ForYouCarouselDimens.CARD_WIDTH]x[ForYouCarouselDimens.COVER_SIZE] box regardless of the
 * source artwork's aspect ratio (`ContentScale.Crop` crops rather than pads).
 *
 * Wave 14b-2: the whole card — cover, title, subtitle and (when the owning shelf has one) the
 * recommendation reason — is one merged accessibility node ([feedItemAnnouncement], applied via
 * `Modifier.semantics(mergeDescendants = true)`), proved by
 * `ForYouCarouselAccessibilityTest`. Before this wave the title and subtitle `Text`s were two
 * loose sibling nodes and the reason (rendered once per shelf in [ForYouCarouselRow]) was
 * unreachable from any individual card at all — see [feedItemAnnouncement]'s doc comment for why
 * this folds the reason in rather than mirroring web's separate name/description DOM nodes.
 *
 * Wave 15d: [item.isExternal][FeedItem.isExternal] adds a small [EXTERNAL_RECOMMENDATION_LABEL]
 * badge over the cover — an overlay via `Modifier.align` inside the cover [Box], not an extra
 * row, so it costs no card height and every card keeps the exact same geometry this doc comment
 * already insists on. The badge is purely visual; [feedItemAnnouncement] carries the same label
 * into the merged `contentDescription` for the accessible half.
 */
@Composable
fun ForYouCard(
    item: FeedItem,
    imageLoader: ImageLoader,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    reason: String? = null,
) {
    val announcement = feedItemAnnouncement(item, reason)
    Column(
        modifier =
            modifier
                .width(ForYouCarouselDimens.CARD_WIDTH)
                .clickable(onClickLabel = announcement, onClick = onClick)
                .semantics(mergeDescendants = true) {
                    contentDescription = announcement
                },
    ) {
        Box(
            modifier =
                Modifier
                    .size(ForYouCarouselDimens.COVER_SIZE)
                    // §3.1's compact-column art radius (--radius-sm). The gradient placeholder
                    // fill Sonora's own source specifies is deliberately NOT implemented here —
                    // see §3.1's note: the existing fallback-icon-under-AsyncImage mechanism
                    // (below) is strictly better and must not be replaced by a static gradient.
                    .clip(ForYouCarouselDimens.CARD_ART_SHAPE),
            contentAlignment = Alignment.Center,
        ) {
            // Rendered underneath the AsyncImage: Coil draws nothing while loading/on failure/
            // when the model is null, so this icon shows through in every one of those cases
            // without needing a Coil `error`/`placeholder` painter.
            Icon(
                imageVector = fallbackIconFor(item.contentType),
                contentDescription = null,
                modifier = Modifier.size(ForYouCarouselDimens.COVER_SIZE / 2),
            )
            AsyncImage(
                model = item.coverUrl,
                contentDescription = null,
                imageLoader = imageLoader,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(ForYouCarouselDimens.COVER_SIZE),
            )
            // Wave 15d — purely visual; the same label reaches TalkBack through
            // [feedItemAnnouncement]'s merged contentDescription instead, not through this Text's
            // own semantics, so nothing here needs its own contentDescription override.
            //
            // §3.1's "Absent pill (external)" row, wave 16e-foryou-A: pill radius
            // (MaterialTheme.shapes.extraLarge == --radius-pill, ui/theme/Shape.kt) and muted
            // text colour (onSurfaceVariant, same role as the subtitle below) match the table.
            //
            // Wave 16e-foryou-A-2: position and background corrected per the `16e-foryou-P`
            // parity review. §3.1's table and `docs/design/sonora/components/MediaCard.dc.html`
            // (`position:absolute;left:8px;top:8px`) both specify a TOP-LEFT overlay with a
            // SOLID `var(--surface-bg)` background — this previously rendered bottom-start with
            // a translucent `--surface-card` tone (wave 16e-foryou-A's own report justified that
            // as "pre-existing, out of the wave's radius/typography scope", which the `-P` review
            // overturned). `--surface-bg` maps to this theme's `background` chroma role, not
            // `surface` (`--surface-bg` -> `--m3-background`/`--m3-surface` per `SONORA.md`;
            // `colorScheme.background` is set from `SonoraPalette.Neutral900`/`SurfaceBgLight`,
            // i.e. `--surface-bg`, in `ui/theme/Color.kt`) — `colorScheme.surface` is
            // `--surface-card` instead, which is why the old code read the wrong role. The 8dp
            // inset from each edge matches the citation above 1:1, same basis 16e-book-A-2 used
            // for reading Sonora's px values as dp.
            if (item.isExternal) {
                Surface(
                    color = MaterialTheme.colorScheme.background,
                    shape = MaterialTheme.shapes.extraLarge,
                    modifier =
                        Modifier
                            .align(Alignment.TopStart)
                            .padding(8.dp),
                ) {
                    Text(
                        text = EXTERNAL_RECOMMENDATION_LABEL,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
        }
        // §3.1's compact-column title row: --text-md (14px, already labelLarge's size per
        // SonoraTypography's own doc comment) at weight 700, colour --m3-on-background.
        Text(
            text = item.title,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier =
                Modifier
                    .padding(top = ForYouCarouselDimens.TEXT_TOP_SPACING)
                    .height(ForYouCarouselDimens.TITLE_ROW_HEIGHT),
        )
        // Always rendered, even with no subtitle — see ForYouCarouselDimens.SUBTITLE_ROW_HEIGHT's
        // doc comment: an item with no subtitle must not end up shorter than one that has one.
        Text(
            text = item.subtitle ?: " ",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier =
                Modifier
                    .padding(top = ForYouCarouselDimens.TEXT_LINE_SPACING)
                    .height(ForYouCarouselDimens.SUBTITLE_ROW_HEIGHT),
        )
        Box(
            modifier =
                Modifier
                    .padding(top = ForYouCarouselDimens.TEXT_LINE_SPACING)
                    .fillMaxWidth()
                    .height(ForYouCarouselDimens.PROGRESS_ROW_HEIGHT),
        ) {
            val progress = item.progress
            if (progress != null) {
                LinearProgressIndicator(
                    progress = { progress.toFloat() },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** One horizontally-scrolling carousel row: a label heading followed by a [LazyRow] of
 * [ForYouCard]s, all sharing [ForYouCarouselDimens]. Renders nothing for an empty, non-loading
 * carousel — a headed section with no cards in it is worse than not rendering the section at
 * all, same reasoning as `Carousel.tsx`. */
@Composable
fun ForYouCarouselRow(
    carousel: FeedCarousel,
    imageLoader: ImageLoader,
    onSelect: (FeedItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (carousel.items.isEmpty()) return
    Column(modifier = modifier) {
        Text(
            text = carousel.label,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = ForYouCarouselDimens.CARD_ROW_CONTENT_PADDING),
        )
        // The "Because you finished …" line (docs/ROADMAP.md §13) — subordinate to the shelf
        // title, one typographic step down, same as ForYouCard's title/subtitle pairing. Not a
        // second heading: no fixed height (unlike the per-card rows above, which need identical
        // card geometry regardless of content), because this is prose of server-composed,
        // unknown length, not a short label — wrapping onto two lines rather than forcing every
        // "for you" shelf's header to the height of its longest possible reason. A blank string
        // is treated the same as absent: nothing worth rendering.
        val reason = carouselReasonText(carousel)
        if (reason != null) {
            Text(
                text = reason,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier =
                    Modifier
                        .padding(horizontal = ForYouCarouselDimens.CARD_ROW_CONTENT_PADDING)
                        .padding(top = ForYouCarouselDimens.TEXT_LINE_SPACING),
            )
        }
        LazyRow(
            contentPadding = PaddingValues(horizontal = ForYouCarouselDimens.CARD_ROW_CONTENT_PADDING),
            horizontalArrangement = Arrangement.spacedBy(ForYouCarouselDimens.CARD_SPACING),
            modifier = Modifier.padding(top = ForYouCarouselDimens.TEXT_TOP_SPACING),
        ) {
            items(carousel.items, key = { it.id }) { item ->
                ForYouCard(
                    item = item,
                    imageLoader = imageLoader,
                    onClick = { onSelect(item) },
                    reason = reason,
                )
            }
        }
    }
}

/** One tile in the quick-selection grid at the top of the screen: a small
 * [ForYouCarouselDimens.QUICK_TILE_COVER_SIZE] thumbnail plus a title, matching the reference
 * screenshots' two-column rows. Deliberately a different, smaller composable from [ForYouCard]
 * rather than a resized instance of it — the quick grid and the carousels are two different
 * regions of the screen with two different jobs (jump to an item vs. browse a shelf), and only
 * within *each* region does "one geometry" apply; nothing in the spec asks the quick-pick tile
 * and the carousel card to share a size. */
@Composable
fun QuickPickTile(
    item: FeedItem,
    imageLoader: ImageLoader,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        // Wave 16e-foryou-A-2: §3.2's compact-column "Row gap" (10dp), replacing the previous
        // `.padding(start = …)` on the title Text below — an `Arrangement` gap is the direct
        // Compose analogue of the CSS `gap` property QuickPick.dc.html actually specifies,
        // rather than a one-sided offset baked into one child.
        horizontalArrangement = Arrangement.spacedBy(ForYouCarouselDimens.QUICK_ROW_GAP),
        modifier =
            modifier
                .fillMaxWidth()
                // §3.2's row chrome, previously absent entirely (see
                // ForYouCarouselDimens.QUICK_ROW_SHAPE's doc comment): clip then paint the
                // background so it respects the rounded corners, then clickable so its ripple is
                // bounded by the same clip, then padding so the 8dp inset applies to the content
                // rather than shrinking the clickable/background area.
                .clip(ForYouCarouselDimens.QUICK_ROW_SHAPE)
                // §3.2's compact-column background is `var(--m3-surface-container)`, which
                // `SONORA.md`'s substitution table maps to `var(--surface-card)` in both themes —
                // the same role `ui/theme/Color.kt` assigns to `colorScheme.surface` (see its own
                // mapping comment). `colorScheme.background` would be the wrong role here; that
                // one is `--surface-bg`, used for the external-item pill above instead.
                .background(MaterialTheme.colorScheme.surface)
                .clickable(onClickLabel = feedItemContentDescription(item), onClick = onClick)
                .padding(ForYouCarouselDimens.QUICK_ROW_PADDING),
    ) {
        Box(
            modifier =
                Modifier
                    .size(ForYouCarouselDimens.QUICK_TILE_COVER_SIZE)
                    // §3.2's art radius (8px, a literal in Sonora's own source — see
                    // ForYouCarouselDimens.QUICK_TILE_ART_SHAPE's doc comment).
                    .clip(ForYouCarouselDimens.QUICK_TILE_ART_SHAPE),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = fallbackIconFor(item.contentType),
                contentDescription = null,
                modifier = Modifier.size(ForYouCarouselDimens.QUICK_TILE_COVER_SIZE / 2),
            )
            AsyncImage(
                model = item.coverUrl,
                contentDescription = null,
                imageLoader = imageLoader,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(ForYouCarouselDimens.QUICK_TILE_COVER_SIZE),
            )
        }
        // §3.2's compact-column title: --text-sm (13px, labelMedium's size), weight 700,
        // colour --m3-on-background. The art-to-text gap now comes from the Row's own
        // `Arrangement.spacedBy(QUICK_ROW_GAP)` above, not a one-sided start-padding here.
        Text(
            text = item.title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * The two-column quick-selection grid itself: [items] chunked in pairs, one [Row] per pair. A
 * plain [Column]/[Row] combination rather than `LazyVerticalGrid` — [items] is capped at 8 by
 * [buildQuickPicks], so there's no scrolling performance case a lazy grid would earn its keep
 * on, and nesting a second lazy scroller inside [ForYouScreen]'s own scrolling column is exactly
 * the kind of thing worth avoiding on a surface this machine cannot run to check.
 *
 * `docs/design/screens/FOR_YOU.md` §11, wave 16e-foryou-A: web's grid carries
 * `role="list" aria-label="Quick picks"` (`HomePage.tsx:161-163`); this file had **no** grouping
 * semantic at all before this wave (confirmed by reading it, per §11's own instruction to check
 * rather than assume). A `contentDescription` with no `mergeDescendants` gives the container an
 * accessible name — the region reads as "Quick picks" — without swallowing each
 * [QuickPickTile]'s own name into it, so a screen-reader user can still traverse the eight tiles
 * individually. Compose has no `role="list"` equivalent for a plain `Column`/`Row` grid (unlike
 * `LazyColumn`, which gets `CollectionInfo` for free); a named container is the closest match
 * without inventing new semantics machinery for a two-column grid this small.
 */
@Composable
fun QuickPickGrid(
    items: List<FeedItem>,
    imageLoader: ImageLoader,
    onSelect: (FeedItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty()) return
    Column(
        modifier = modifier.semantics { contentDescription = "Quick picks" },
        verticalArrangement = Arrangement.spacedBy(ForYouCarouselDimens.QUICK_GRID_SPACING),
    ) {
        items.chunked(2).forEach { pair ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(ForYouCarouselDimens.QUICK_GRID_SPACING),
            ) {
                pair.forEach { item ->
                    QuickPickTile(
                        item = item,
                        imageLoader = imageLoader,
                        onClick = { onSelect(item) },
                        modifier = Modifier.weight(1f),
                    )
                }
                // An odd final row: fill the second column so the first tile doesn't stretch to
                // the full row width and end up a visibly different size from every other tile.
                if (pair.size == 1) {
                    Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

/**
 * `docs/design/screens/FOR_YOU.md` §3.3, wave 16e-foryou-A: the loading-state silhouette,
 * replacing [ForYouScreen]'s pre-this-wave bare `CircularProgressIndicator`
 * (`ForYouScreen.kt:124-130`, wave dispatch's own citation of `:117-124` was off by a handful of
 * lines but resolved to the same block). §3.3 names two acceptable brushes — "a
 * `Modifier.placeholder`-style pattern or a plain `Box` with a muted background and no shimmer" —
 * and this file takes the second, simpler option: a flat [MaterialTheme.colorScheme.surfaceVariant]
 * tone, no animation. **The box dimensions must exactly match the loaded card** (§3.3's own
 * wording, echoing `Carousel.tsx`'s `TITLE_STYLE` reasoning) — every skeleton composable below
 * reads its sizes from [ForYouCarouselDimens], the same object [ForYouCard]/[QuickPickTile] read
 * from, rather than declaring its own numbers.
 */
@Composable
private fun SkeletonBlock(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(4.dp),
) {
    // Spacer, not Box — Box's `content` lambda is a required parameter with no default, and this
    // placeholder never has any content to give it.
    Spacer(
        modifier =
            modifier
                .background(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = shape,
                ),
    )
}

/** [ForYouCard]'s loading placeholder: a cover-sized block, a title-row-height block, a
 * subtitle-row-height block (narrower, since a real subtitle is rarely as wide as the title —
 * purely cosmetic, not a geometry requirement), and the same reserved-but-empty progress row a
 * real card with `progress == null` already renders (§5's "reserve the row, render no bar inside
 * it" rule applies here unchanged — a skeleton card is not a card with progress, so it gets no
 * progress-bar placeholder either). No `Modifier.semantics` — see [ForYouCarouselRowSkeleton]'s
 * doc comment for why the whole skeleton region is left out of the accessibility tree. */
@Composable
private fun ForYouCardSkeleton(modifier: Modifier = Modifier) {
    Column(modifier = modifier.width(ForYouCarouselDimens.CARD_WIDTH)) {
        SkeletonBlock(
            modifier = Modifier.size(ForYouCarouselDimens.COVER_SIZE),
            shape = ForYouCarouselDimens.CARD_ART_SHAPE,
        )
        SkeletonBlock(
            modifier =
                Modifier
                    .padding(top = ForYouCarouselDimens.TEXT_TOP_SPACING)
                    .fillMaxWidth()
                    .height(ForYouCarouselDimens.TITLE_ROW_HEIGHT),
        )
        SkeletonBlock(
            modifier =
                Modifier
                    .padding(top = ForYouCarouselDimens.TEXT_LINE_SPACING)
                    .fillMaxWidth(0.6f)
                    .height(ForYouCarouselDimens.SUBTITLE_ROW_HEIGHT),
        )
        // §5's "reserve the row, render no bar inside it" rule, applied to a skeleton: an empty
        // Spacer at the real progress row's height, not even a muted block — a card with
        // progress == null renders no bar inside a real card either, so the placeholder for
        // "progress unknown yet" and "no progress" collapse to the same empty reserved space.
        Spacer(
            modifier =
                Modifier
                    .padding(top = ForYouCarouselDimens.TEXT_LINE_SPACING)
                    .fillMaxWidth()
                    .height(ForYouCarouselDimens.PROGRESS_ROW_HEIGHT),
        )
    }
}

/** How many placeholder cards sit in one [ForYouCarouselRowSkeleton] — enough to fill a
 * screen-width row without scrolling on a typical phone, and otherwise arbitrary: nothing in
 * §3.3 pins a card count, only a box size, since a skeleton card never scrolls into view the way
 * a real [LazyRow] of them does. */
private const val SKELETON_ROW_CARD_COUNT = 3

/** How many [ForYouCarouselRowSkeleton]s [ForYouScreen] shows while every source is still
 * loading. §6.2's own wording: real shelf count is unknown before any source resolves, so this is
 * "a fixed, small placeholder count… pick something in the 2-4 range and state the choice in the
 * wave's own commit message so the other platform's wave (or the `-P` review) can check they
 * agree, though an exact match is not required — unlike the byte-for-byte strings in §6.3, this
 * number is not a parity requirement." This wave picks **3**. */
internal const val SKELETON_CAROUSEL_ROW_COUNT = 3

/**
 * One skeleton carousel "row": a heading-sized block (standing in for [FeedCarousel.label], which
 * is unknown before a source resolves) followed by [SKELETON_ROW_CARD_COUNT] [ForYouCardSkeleton]s
 * in a plain, non-scrolling [Row] — a real [ForYouCarouselRow] uses a [LazyRow] because its item
 * count can exceed the screen width and needs to scroll; a skeleton row's item count is this
 * file's own fixed constant, so a plain `Row` is both simpler and sufficient.
 *
 * **Deliberately carries no [Modifier.semantics] of its own.** A skeleton communicates "content is
 * not here yet" visually; giving each placeholder block its own accessible name would just have
 * TalkBack read out meaningless boxes mid-load. [ForYouScreen]'s live-region status announcer
 * (§6.6) is what actually tells a screen-reader user the page is loading — that is the
 * accessible signal for this state, not anything on these composables.
 */
@Composable
fun ForYouCarouselRowSkeleton(modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        SkeletonBlock(
            modifier =
                Modifier
                    .padding(horizontal = ForYouCarouselDimens.CARD_ROW_CONTENT_PADDING)
                    .width(120.dp)
                    .height(20.dp),
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(ForYouCarouselDimens.CARD_SPACING),
            modifier =
                Modifier
                    .padding(top = ForYouCarouselDimens.TEXT_TOP_SPACING)
                    .padding(horizontal = ForYouCarouselDimens.CARD_ROW_CONTENT_PADDING),
        ) {
            repeat(SKELETON_ROW_CARD_COUNT) {
                ForYouCardSkeleton()
            }
        }
    }
}

/** [QuickPickTile]'s loading placeholder: an art-sized block plus a title-row-height block,
 * mirroring the real tile's `Row` shape exactly (icon-sized box, then text) so the grid's overall
 * silhouette matches §3.3's "box dimensions must exactly match the loaded card" requirement.
 *
 * Wave 16e-foryou-A-2: the real tile's `Row` gained background/padding/radius/gap it previously
 * had none of (see [QuickPickTile]), which grows its box by [ForYouCarouselDimens.QUICK_ROW_PADDING]
 * on every edge. Mirroring the same chrome here — rather than leaving this skeleton at its old,
 * now-smaller size — is required by this doc comment's own "box dimensions must exactly match"
 * rule; leaving it unchanged would have reintroduced the loading-vs-loaded layout shift §3.3
 * exists to prevent, just at the quick-pick grid instead of the carousel. */
@Composable
private fun QuickPickTileSkeleton(modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ForYouCarouselDimens.QUICK_ROW_GAP),
        modifier =
            modifier
                .fillMaxWidth()
                .clip(ForYouCarouselDimens.QUICK_ROW_SHAPE)
                .background(MaterialTheme.colorScheme.surface)
                .padding(ForYouCarouselDimens.QUICK_ROW_PADDING),
    ) {
        SkeletonBlock(
            modifier = Modifier.size(ForYouCarouselDimens.QUICK_TILE_COVER_SIZE),
            shape = ForYouCarouselDimens.QUICK_TILE_ART_SHAPE,
        )
        SkeletonBlock(
            modifier =
                Modifier
                    .weight(1f)
                    .height(ForYouCarouselDimens.TITLE_ROW_HEIGHT),
        )
    }
}

/** §3.3's "a skeleton quick-picks grid (8 tiles at `QuickPickTile`'s box size)" — the exact count
 * [QUICK_PICK_COUNT] in `ForYouViewModel.kt` caps a real grid at, so the loading silhouette and
 * the eventual real grid occupy the same number of rows in the common case. */
private const val SKELETON_QUICK_PICK_COUNT = 8

/** [QuickPickGrid]'s loading placeholder, same two-column/chunked-pairs shape as the real grid,
 * built from a fixed [SKELETON_QUICK_PICK_COUNT] rather than any real data — nothing is loaded
 * yet, so there is no item list to chunk. */
@Composable
fun QuickPickGridSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(ForYouCarouselDimens.QUICK_GRID_SPACING),
    ) {
        repeat(SKELETON_QUICK_PICK_COUNT / 2) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(ForYouCarouselDimens.QUICK_GRID_SPACING),
            ) {
                QuickPickTileSkeleton(modifier = Modifier.weight(1f))
                QuickPickTileSkeleton(modifier = Modifier.weight(1f))
            }
        }
    }
}
