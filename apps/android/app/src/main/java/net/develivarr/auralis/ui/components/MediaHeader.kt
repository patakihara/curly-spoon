package net.develivarr.auralis.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import net.develivarr.auralis.navigation.RAIL_BREAKPOINT

/**
 * Wave 16e-book-A-2 — one Compose equivalent of Sonora's `MediaHeader`
 * (`docs/design/sonora/components/MediaHeader.dc.html`), shared by every detail screen's cover +
 * title block. Built because three screens — [net.develivarr.auralis.features.books.BookDetailScreen],
 * [net.develivarr.auralis.features.podcasts.PodcastDetailScreen],
 * [net.develivarr.auralis.features.music.AlbumDetailScreen] — had each independently grown the
 * *same* pre-Sonora 96dp thumbnail row (the `16e-book-P` finding this wave exists to fix), so a
 * fourth screen was about to copy it a third time. One composable now means one place to fix.
 *
 * **Values, and where each comes from** (`docs/design/screens/BOOK_DETAIL.md` §3 is the authority
 * behind all of them — this doc comment restates it as a table so a future edit here has to
 * satisfy the same contract line by line, not just prose it read once):
 *
 * | Element        | Value                                                                          |
 * |----------------|---------------------------------------------------------------------------------|
 * | Art tile       | square, 232dp wide / 208dp compact, `MaterialTheme.shapes.large` (`--radius-lg`) corners |
 * | Art fallback   | an [ImageVector] rendered underneath a transparent-until-loaded `AsyncImage`, the pattern [net.develivarr.auralis.features.home.ForYouCarousel] already established and this repo has already reviewed |
 * | Kind label     | uppercase, `labelSmall` (`--text-xs`), `onSurfaceVariant` (muted)               |
 * | Title          | `headlineMedium` (`--h2-size`, wide) / `titleLarge` (`--h4-size`, compact), both already weight 900 per [net.develivarr.auralis.ui.theme.SonoraTypography] |
 * | Subtitle       | `bodyLarge` (`--text-lg`, wide) / `bodyMedium` (`--text-md`, compact), `onSurfaceVariant` |
 * | Meta           | `bodySmall`, `onSurfaceVariant` — the single line each screen composes itself, unmodified |
 *
 * **dp is read as px 1:1 here, deliberately, not converted.** Sonora's `232`/`208` are CSS
 * pixels; this composable takes them as `dp`. dp and CSS px are both density-independent units
 * that target roughly the same physical size (dp at a 160dpi baseline, CSS px at a ~1/96in
 * reference pixel) without being rigorously identical — the same reasoning [RAIL_BREAKPOINT]'s own
 * doc comment already applies to 600dp/600px, and a `16d-P` parity review accepted it there. This
 * is that same call, made explicit rather than silently assumed.
 *
 * **The wide/compact split reuses [RAIL_BREAKPOINT] itself — not a re-derived literal.** The art
 * tile measures its own available width via [BoxWithConstraints] rather than reading the shell's
 * window-width state, because a screen pushed onto the nav host has no access to that state and
 * plumbing it down would be a second, parallel breakpoint source of its own. Measuring the
 * header's own container width is deliberately a *content-area* reading, not a *window* reading —
 * on a wide window with the rail showing, the content column is narrower than the full window, so
 * this can report "compact" at some window widths where the rail itself reports "wide". That is
 * the more correct reading for a header sizing itself to the space it actually has, and it is the
 * same content-area logic this composable's own screens already lay their content into.
 *
 * **Compose has no CSS-cascade fallback.** A missing cover on web leaves a styled box behind for
 * free; here an [AsyncImage] with no cover paints nothing at all unless something else fills the
 * box. That "something else" is [fallbackIcon], composed underneath the [AsyncImage] exactly as
 * [net.develivarr.auralis.features.home.ForYouCarousel]'s cards already do — Coil draws nothing
 * while loading, on failure, or when `coverUrl` is null, so the icon shows through in every one of
 * those cases without a Coil `placeholder`/`error` painter.
 *
 * [trailingContent] is a header-row slot for content that must stay vertically aligned with the
 * art tile and title column — [net.develivarr.auralis.features.music.AlbumDetailScreen]'s favorite
 * toggle is the one caller that needs it; the book and podcast screens pass `null`. [actions] is a
 * slot rendered *below* the header row — the book screen's Play/Download button row; podcast and
 * album pass `null` since their equivalent actions live per-episode/per-track, not in the header.
 *
 * Each caller keeps its own data model, its own ViewModel and its own fallback contract (§5 of the
 * book spec — omit a missing field's line entirely, never render an empty one). Only the layout
 * and the type/colour/size *values* are shared here.
 */
@Composable
fun MediaHeader(
    coverUrl: String?,
    imageLoader: ImageLoader,
    fallbackIcon: ImageVector,
    kindLabel: String?,
    title: String,
    subtitle: String?,
    modifier: Modifier = Modifier,
    meta: String? = null,
    trailingContent: (@Composable () -> Unit)? = null,
    actions: (@Composable () -> Unit)? = null,
) {
    BoxWithConstraints(modifier = modifier) {
        val wide = maxWidth >= RAIL_BREAKPOINT
        val artSize = if (wide) 232.dp else 208.dp
        val titleStyle = if (wide) MaterialTheme.typography.headlineMedium else MaterialTheme.typography.titleLarge
        val subtitleStyle = if (wide) MaterialTheme.typography.bodyLarge else MaterialTheme.typography.bodyMedium
        val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant

        Column {
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    modifier =
                        Modifier
                            .size(artSize)
                            .clip(MaterialTheme.shapes.large)
                            .testTag("media-header-art"),
                    contentAlignment = Alignment.Center,
                ) {
                    // Rendered underneath the AsyncImage: Coil draws nothing while loading/on
                    // failure/when the model is null, so this icon shows through in every one of
                    // those cases without needing a Coil `error`/`placeholder` painter — see this
                    // composable's own doc comment.
                    Icon(
                        imageVector = fallbackIcon,
                        contentDescription = null,
                        tint = mutedColor,
                        modifier =
                            Modifier
                                .size(artSize / 2)
                                .testTag("media-header-art-fallback"),
                    )
                    AsyncImage(
                        model = coverUrl,
                        // Decorative — duplicates the title text right next to it (§6 of the book
                        // spec, and the same rule for every other screen this composable serves).
                        contentDescription = null,
                        imageLoader = imageLoader,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(artSize),
                    )
                }
                Column(
                    modifier =
                        Modifier
                            .padding(start = 16.dp)
                            .weight(1f),
                ) {
                    kindLabel?.let {
                        Text(
                            it.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = mutedColor,
                            letterSpacing = 1.sp,
                            modifier = Modifier.testTag("media-header-kind"),
                        )
                    }
                    Text(
                        title,
                        style = titleStyle,
                        modifier = Modifier.testTag("media-header-title"),
                    )
                    subtitle?.let {
                        Text(
                            it,
                            style = subtitleStyle,
                            color = mutedColor,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.testTag("media-header-subtitle"),
                        )
                    }
                    meta?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = mutedColor,
                            modifier =
                                Modifier
                                    .padding(top = 4.dp)
                                    .testTag("media-header-meta"),
                        )
                    }
                }
                trailingContent?.invoke()
            }
            actions?.let {
                Row(modifier = Modifier.padding(top = 16.dp)) { it() }
            }
        }
    }
}
