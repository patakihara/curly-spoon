package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.editableText
import androidx.compose.ui.semantics.setText
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import net.develivarr.auralis.generated.theme.SonoraDimens
import net.develivarr.auralis.generated.theme.SonoraLightColors
import net.develivarr.auralis.generated.theme.SonoraState
import net.develivarr.auralis.generated.theme.SonoraType

/** A stub's box as one control: pressing it calls [onClick], and it is disabled without one. */
internal class Press(
    val onClick: (() -> Unit)?,
    val disabled: Boolean = false,
    val role: Role = Role.Button,
)

/** A stub's text field: it shows [value] or else [placeholder], and hands [onChange] the text. */
internal class Field(
    val value: String?,
    val placeholder: String?,
    val onChange: ((String) -> Unit)?,
    val disabled: Boolean = false,
)

/**
 * The stand-in body every Android Sonora composable draws until M1 and M2 write its layout in
 * place: a bordered box labelled with the component's name, then its title as a heading, its
 * text props, its [field], its [links], [taps] and [tabs], and its slots, top to bottom. A [root]
 * box fills the screen and scrolls. On Sonora's light scheme, so a page's plain `BasicText`
 * children read on it.
 *
 * Every control in a stub shows Material's states ([stateLayer]) and is disabled without its
 * action: [press] makes the whole box a button, named [label] or else by its text, each of [taps]
 * a button and each of [tabs] a tab, so the app can be walked by tapping, and read by a screen
 * reader, before the real layouts land. Each of [links] is plain text, a button only when its
 * handler is given. The tab named [selected] sits in a filled container, which stays, at 12% of the
 * surface ink, when it is disabled. A disabled box draws its own text and its slots at 38% of the
 * surface ink.
 */
@Composable
internal fun SonoraStub(
    name: String,
    title: String? = null,
    texts: List<String?> = emptyList(),
    slots: List<(@Composable () -> Unit)?> = emptyList(),
    root: Boolean = false,
    press: Press? = null,
    label: String? = null,
    field: Field? = null,
    links: List<Pair<String?, (() -> Unit)?>> = emptyList(),
    taps: List<Pair<String?, (() -> Unit)?>> = emptyList(),
    tabs: List<Pair<String?, (() -> Unit)?>> = emptyList(),
    selected: String? = null,
) {
    val colors = SonoraLightColors
    val frame = if (root) {
        Modifier.fillMaxSize().background(colors.surfaceBg).verticalScroll(rememberScrollState())
    } else {
        Modifier.fillMaxWidth()
    }
    val off = press != null && (press.onClick == null || press.disabled)
    val pressed = if (press == null) {
        Modifier
    } else {
        Modifier.control(press.onClick, press.role, colors.surfaceFg, press.disabled, label)
    }
    Column(
        modifier = frame
            .then(pressed)
            .border(HAIRLINE, colors.surfaceBorder, CONTROL_SHAPE)
            .padding(SonoraDimens.spacingSm),
        verticalArrangement = Arrangement.spacedBy(SonoraDimens.spacingXs),
    ) {
        BasicText(name, style = text(if (off) DISABLED_INK else colors.surfaceFgMuted, SonoraType.textXs))
        if (title != null) {
            BasicText(
                title,
                modifier = Modifier.semantics { heading() },
                style = text(if (off) DISABLED_INK else colors.surfaceFg, SonoraType.h3Size, SonoraFonts.display),
            )
        }
        texts.filterNotNull().forEach {
            BasicText(it, style = text(if (off) DISABLED_INK else colors.surfaceFg, SonoraType.textMd))
        }
        if (field != null) TextField(field)
        links.forEach { (link, onTap) ->
            if (onTap == null) {
                if (link != null) BasicText(link, style = text(colors.surfaceFg, SonoraType.textMd))
            } else {
                Tap(link, onTap, Role.Button)
            }
        }
        taps.forEach { (tap, onTap) -> Tap(tap, onTap, Role.Button) }
        tabs.forEach { (tab, onTap) -> Tap(tab, onTap, Role.Tab, selected = tab != null && tab == selected) }
        slots.filterNotNull().forEach { slot -> if (off) Box(Modifier.disabledInk()) { slot() } else slot() }
    }
}

/**
 * [words] as a control in [role], in the accent ink, or disabled when [onTap] is absent. A
 * [selected] one is filled with the accent, or, disabled, with the surface ink at 12%. Each keeps
 * clear of the next by the width of their focus rings, so pinned rings do not overlap.
 */
@Composable
private fun Tap(words: String?, onTap: (() -> Unit)?, role: Role, selected: Boolean = false) {
    if (words == null) return
    val colors = SonoraLightColors
    val ink = when {
        onTap == null -> DISABLED_INK
        selected -> colors.surfaceBg
        else -> colors.accentInk
    }
    val container = when {
        !selected -> Color.Transparent
        onTap == null -> DISABLED_CONTAINER
        else -> colors.accentInk
    }
    BasicText(
        words,
        modifier = Modifier
            .padding(vertical = RING_CLEARANCE)
            .control(onTap, role, colors.accentInk)
            .semantics { if (selected) this.selected = true }
            .background(container, CONTROL_SHAPE)
            .padding(horizontal = SonoraDimens.spacingXs),
        style = text(ink, SonoraType.textMd),
    )
}

/** Half the room two neighbouring focus rings take, less half the gap the column already leaves. */
private val RING_CLEARANCE = SonoraState.focusRingOffset + SonoraState.focusRingWidth - SonoraDimens.spacingXs / 2

/** Draws everything inside it in [DISABLED_INK], keeping only its shapes: a disabled control's slots. */
internal fun Modifier.disabledInk(): Modifier = this
    .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
    .drawWithContent {
        drawContent()
        drawRect(DISABLED_INK, blendMode = BlendMode.SrcIn)
    }

/**
 * A text field's stand-in: its value, or else its placeholder, in a focusable box that takes text
 * through its accessibility `setText` and hands it to [Field.onChange]. Material's states without a
 * ripple; disabled, with no `setText`, without [Field.onChange] or with [Field.disabled] set. Typing
 * arrives with the real layout.
 */
@Composable
private fun TextField(field: Field) {
    val colors = SonoraLightColors
    val source = remember { MutableInteractionSource() }
    val enabled = field.onChange != null && !field.disabled
    val value = field.value.orEmpty()
    val shown = value.ifEmpty { field.placeholder.orEmpty() }
    val ink = when {
        !enabled -> DISABLED_INK
        value.isEmpty() -> colors.surfaceFgMuted
        else -> colors.surfaceFg
    }
    BasicText(
        shown,
        style = text(ink, SonoraType.textMd),
        modifier = Modifier
            .fillMaxWidth()
            .stateLayer(source, enabled, colors.surfaceFg, ripple = false)
            .hoverable(source, enabled)
            .focusable(enabled, source)
            .semantics {
                editableText = AnnotatedString(value)
                if (enabled) {
                    setText { text -> field.onChange?.invoke(text.text); true }
                } else {
                    disabled()
                }
            }
            .border(HAIRLINE, colors.surfaceBorder, CONTROL_SHAPE)
            .padding(SonoraDimens.spacingXs),
    )
}

/** The box's outline. */
private val HAIRLINE = 1.dp

private fun text(color: Color, size: TextUnit, family: FontFamily = SonoraFonts.body) =
    TextStyle(color = color, fontSize = size, fontFamily = family)
