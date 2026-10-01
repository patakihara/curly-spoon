package net.develivarr.auralis.ui.sonora

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.zIndex
import kotlin.math.hypot
import kotlin.math.max
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import net.develivarr.auralis.generated.theme.SonoraDimens
import net.develivarr.auralis.generated.theme.SonoraLightColors
import net.develivarr.auralis.generated.theme.SonoraMotion
import net.develivarr.auralis.generated.theme.SonoraState

/** A state a preview pins on every control under it, as web's `data-sn-force` does. */
internal enum class PinnedState { HOVERED, FOCUSED, PRESSED }

/** The state pinned on the controls under it, or none to let them follow the pointer and keys. */
internal val LocalPinnedState = staticCompositionLocalOf<PinnedState?> { null }

/** A control's corners, unless it names its own. */
internal val CONTROL_SHAPE: Shape = RoundedCornerShape(SonoraDimens.radiusXs)

/** The ink a disabled control's content takes: the surface ink at 38%. */
internal val DISABLED_INK: Color = SonoraLightColors.surfaceFg.copy(alpha = SonoraState.disabledContent)

/** The container a disabled filled control keeps: the surface ink at 12%. */
internal val DISABLED_CONTAINER: Color = SonoraLightColors.surfaceFg.copy(alpha = SonoraState.disabledContainer)

/**
 * A Sonora control, with Material's states: pressing it calls [onClick], and it is disabled, drawn
 * in [DISABLED_INK] by its caller and taking no focus, press or state, when [onClick] is absent or
 * [disabled] is set. Its [stateLayer] washes it in [ink].
 */
@Composable
internal fun Modifier.control(
    onClick: (() -> Unit)?,
    role: Role,
    ink: Color,
    disabled: Boolean = false,
    label: String? = null,
    shape: Shape = CONTROL_SHAPE,
): Modifier {
    val source = remember { MutableInteractionSource() }
    val enabled = onClick != null && !disabled
    return stateLayer(source, enabled, ink, shape)
        .clickable(
            interactionSource = source,
            indication = null,
            enabled = enabled,
            role = role,
            onClick = onClick ?: {},
        )
        .semantics { if (label != null) contentDescription = label }
}

/** One press's ripple: where it started, how far it has grown, and how much of it is left. */
private class Wave(val origin: Offset) {
    val grow = Animatable(0f)
    val left = Animatable(1f)
    var growing: Job? = null
}

/**
 * Material's state layer, the Compose twin of Sonora's `StateLayer`: a wash of [ink] over the
 * control for hover (8%), focus (10%) and press (10%), a focus ring 3dp wide and 2dp outside its
 * [shape], and, when it [ripple]s, a ripple that grows from the press point and fades once grown
 * and released. The control's box, corners and position never change. When not [enabled] it
 * draws nothing. [source] is the control's own interactions; [LocalPinnedState] pins a state.
 */
@Composable
internal fun Modifier.stateLayer(
    source: InteractionSource,
    enabled: Boolean,
    ink: Color,
    shape: Shape = CONTROL_SHAPE,
    ripple: Boolean = true,
): Modifier {
    val pinned = LocalPinnedState.current.takeIf { enabled }
    val hovered by source.collectIsHoveredAsState()
    val focused by source.collectIsFocusedAsState()
    val pressed by source.collectIsPressedAsState()
    val pressing = enabled && (pressed || pinned == PinnedState.PRESSED)
    val ringed = enabled && (focused || pinned == PinnedState.FOCUSED)
    val target = when {
        !enabled -> 0f
        pressing -> SonoraState.pressed
        ringed -> SonoraState.focus
        hovered || pinned == PinnedState.HOVERED -> SonoraState.hover
        else -> 0f
    }
    val wash by animateFloatAsState(target, tween(SonoraMotion.durationFast, easing = SonoraMotion.EaseStandard), label = "wash")
    val waves = remember { mutableStateListOf<Wave>() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(source, enabled, ripple) {
        if (!enabled || !ripple) {
            if (waves.isNotEmpty()) waves.clear()
            return@LaunchedEffect
        }
        val live = mutableMapOf<PressInteraction.Press, Wave>()
        source.interactions.collect { interaction ->
            when (interaction) {
                is PressInteraction.Press -> {
                    val wave = Wave(interaction.pressPosition)
                    waves += wave
                    live[interaction] = wave
                    wave.growing = scope.launch {
                        wave.grow.animateTo(1f, tween(SonoraMotion.durationMedium, easing = SonoraMotion.EaseStandard))
                    }
                }
                is PressInteraction.Release, is PressInteraction.Cancel -> {
                    val press = (interaction as? PressInteraction.Release)?.press
                        ?: (interaction as PressInteraction.Cancel).press
                    val wave = live.remove(press) ?: return@collect
                    // A ripple finishes growing before it fades, so a quick tap still reads as one.
                    scope.launch {
                        wave.growing?.join()
                        wave.left.animateTo(0f, tween(SonoraMotion.durationFast, easing = SonoraMotion.EaseStandard))
                        waves.remove(wave)
                    }
                }
            }
        }
    }
    val previewPress = ripple && pinned == PinnedState.PRESSED
    return this
        // A focused control lifts over its neighbours, so its ring is not drawn under the next.
        .then(if (ringed) Modifier.zIndex(1f) else Modifier)
        .drawWithContent {
            drawContent()
            if (!enabled) return@drawWithContent
            val outline = shape.createOutline(size, layoutDirection, this)
            clipPath(outline.path()) {
                if (wash > 0f) drawRect(ink.copy(alpha = ink.alpha * wash))
                waves.forEach { drawRipple(ink, it.origin, it.grow.value, it.left.value) }
                // A preview's press: a ripple part-way through its growth from a press low on the left.
                if (previewPress) drawRipple(ink, PREVIEW_PRESS.of(size), PREVIEW_GROWTH, 1f)
            }
            if (ringed) ring(outline, shape)
        }
}

/** Where a preview's press lands, as a share of the control's width and height, as web's `left:30%;top:70%`. */
internal val PREVIEW_PRESS = Offset(0.3f, 0.7f)

/** How far a preview's ripple has grown: half way, as web's `scale(.5)`. */
internal const val PREVIEW_GROWTH = 0.5f

private fun Offset.of(size: Size) = Offset(x * size.width, y * size.height)

/** A ripple from [origin], [grow]n part way to the farthest corner, with [left] of its ink. */
private fun DrawScope.drawRipple(ink: Color, origin: Offset, grow: Float, left: Float) {
    drawCircle(
        ink.copy(alpha = ink.alpha * SonoraState.pressed * left),
        radius = rippleRadius(origin, size, grow),
        center = origin,
    )
}

/** A ripple's radius from [origin] in a control of [size], [grow]n part way to the farthest corner. */
internal fun rippleRadius(origin: Offset, size: Size, grow: Float): Float = farthestCorner(origin, size) * grow

/**
 * The focus ring's centre line: the control's [outline] grown by [reach] on every side, as a CSS
 * outline with an offset is. Null for a shape of its own, which has no corners to grow.
 */
internal fun ringOutline(outline: Outline, reach: Float): Outline? = when (outline) {
    is Outline.Rectangle -> Outline.Rectangle(outline.rect.inflate(reach))
    is Outline.Rounded -> Outline.Rounded(ringRect(outline.roundRect, reach))
    // [ring] draws such a shape at the ring's size instead.
    is Outline.Generic -> null
}

/** A rounded control's [r] grown by [reach], its rounded corners growing by [reach] too; a square corner stays square. */
internal fun ringRect(r: RoundRect, reach: Float): RoundRect {
    fun CornerRadius.grown() = if (x > 0f || y > 0f) CornerRadius(x + reach, y + reach) else this
    return RoundRect(
        r.left - reach, r.top - reach, r.right + reach, r.bottom + reach,
        r.topLeftCornerRadius.grown(), r.topRightCornerRadius.grown(),
        r.bottomRightCornerRadius.grown(), r.bottomLeftCornerRadius.grown(),
    )
}

/** The focus ring, [SonoraState.focusRingWidth] wide and [SonoraState.focusRingOffset] clear of the control's [outline]. */
private fun DrawScope.ring(outline: Outline, shape: Shape) {
    val reach = SonoraState.focusRingOffset.toPx() + SonoraState.focusRingWidth.toPx() / 2
    val stroke = Stroke(SonoraState.focusRingWidth.toPx())
    val grown = ringOutline(outline, reach)
    if (grown != null) {
        drawOutline(grown, SonoraLightColors.focusRing, style = stroke)
    } else {
        val own = shape.createOutline(Size(size.width + 2 * reach, size.height + 2 * reach), layoutDirection, this)
        translate(-reach, -reach) { drawOutline(own, SonoraLightColors.focusRing, style = stroke) }
    }
}

/** The outline as a path, to clip to. */
private fun Outline.path(): Path = when (this) {
    is Outline.Generic -> path
    is Outline.Rounded -> Path().apply { addRoundRect(roundRect) }
    is Outline.Rectangle -> Path().apply { addRect(rect) }
}

private fun farthestCorner(o: Offset, s: Size): Float =
    max(max(hypot(o.x, o.y), hypot(s.width - o.x, o.y)), max(hypot(o.x, s.height - o.y), hypot(s.width - o.x, s.height - o.y)))
