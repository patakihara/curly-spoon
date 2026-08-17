package net.develivarr.auralis.features.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
 */
object ForYouCarouselDimens {
    val CARD_WIDTH: Dp = 160.dp
    val COVER_SIZE: Dp = 160.dp
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

    val QUICK_TILE_COVER_SIZE: Dp = 56.dp
    val QUICK_GRID_SPACING: Dp = 8.dp
    val QUICK_GRID_PADDING: Dp = 16.dp
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
 * parity bug, just within one platform instead of across two. */
internal const val EXTERNAL_RECOMMENDATION_LABEL = "Not in your library"

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
                    .size(ForYouCarouselDimens.COVER_SIZE),
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
            if (item.isExternal) {
                Surface(
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
                    shape = MaterialTheme.shapes.extraSmall,
                    modifier =
                        Modifier
                            .align(Alignment.BottomStart)
                            .padding(4.dp),
                ) {
                    Text(
                        text = EXTERNAL_RECOMMENDATION_LABEL,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
        }
        Text(
            text = item.title,
            style = MaterialTheme.typography.labelLarge,
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
        modifier =
            modifier
                .fillMaxWidth()
                .clickable(onClickLabel = feedItemContentDescription(item), onClick = onClick),
    ) {
        Box(
            modifier = Modifier.size(ForYouCarouselDimens.QUICK_TILE_COVER_SIZE),
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
        Text(
            text = item.title,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = ForYouCarouselDimens.QUICK_GRID_SPACING),
        )
    }
}

/** The two-column quick-selection grid itself: [items] chunked in pairs, one [Row] per pair. A
 * plain [Column]/[Row] combination rather than `LazyVerticalGrid` — [items] is capped at 8 by
 * [buildQuickPicks], so there's no scrolling performance case a lazy grid would earn its keep
 * on, and nesting a second lazy scroller inside [ForYouScreen]'s own scrolling column is exactly
 * the kind of thing worth avoiding on a surface this machine cannot run to check. */
@Composable
fun QuickPickGrid(
    items: List<FeedItem>,
    imageLoader: ImageLoader,
    onSelect: (FeedItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty()) return
    Column(
        modifier = modifier,
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
