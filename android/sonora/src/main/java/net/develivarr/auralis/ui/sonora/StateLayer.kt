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
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.addOutline
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
        waves.clear()
        if (!enabled || !ripple) return@LaunchedEffect
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
        .zIndex(if (ringed) 1f else 0f)
        .drawWithContent {
            drawContent()
            if (!enabled) return@drawWithContent
            val outline = shape.createOutline(size, layoutDirection, this)
            clipPath(Path().apply { addOutline(outline) }) {
                if (wash > 0f) drawRect(ink.copy(alpha = ink.alpha * wash))
                waves.forEach { wave ->
                    drawCircle(
                        ink.copy(alpha = ink.alpha * SonoraState.pressed * wave.left.value),
                        radius = farthestCorner(wave.origin, size) * wave.grow.value,
                        center = wave.origin,
                    )
                }
                // A preview's press: a ripple part-way through its growth from low on the left.
                if (previewPress) {
                    drawCircle(
                        ink.copy(alpha = ink.alpha * SonoraState.pressed),
                        radius = size.width * 0.35f,
                        center = Offset(size.width * 0.3f, size.height * 0.7f),
                    )
                }
            }
            if (ringed) ring(shape)
        }
}

/** The focus ring: [SonoraState.focusRingWidth] wide, [SonoraState.focusRingOffset] clear of [shape]. */
private fun ContentDrawScope.ring(shape: Shape) {
    val width = SonoraState.focusRingWidth.toPx()
    val reach = SonoraState.focusRingOffset.toPx() + width / 2
    val outline = shape.createOutline(Size(size.width + 2 * reach, size.height + 2 * reach), layoutDirection, this)
    translate(-reach, -reach) {
        drawOutline(outline, SonoraLightColors.focusRing, style = Stroke(width))
    }
}

private fun farthestCorner(o: Offset, s: Size): Float =
    max(max(hypot(o.x, o.y), hypot(s.width - o.x, o.y)), max(hypot(o.x, s.height - o.y), hypot(s.width - o.x, s.height - o.y)))
