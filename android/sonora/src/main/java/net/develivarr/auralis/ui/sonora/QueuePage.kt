package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import net.develivarr.auralis.generated.ui.QueuePageProps

/**
 * Sonora's QueuePage, as a stub: M1 and M2 replace its body in place with the real layout. Its
 * edit toggle keeps its own mode unless `editing` is given, and is disabled with none of
 * `onRemove`, `onRemoveSelected` and `onReorder`, since there is then nothing to edit.
 */
@Composable
fun QueuePage(props: QueuePageProps) {
    var ownEditing by remember { mutableStateOf(false) }
    val editing = props.editing ?: ownEditing
    val editable = props.onRemove != null || props.onRemoveSelected != null || props.onReorder != null
    val toggleEdit: (() -> Unit)? = if (!editable) {
        null
    } else {
        {
            if (props.editing == null) ownEditing = !editing
            props.onEditingChange?.invoke(!editing)
        }
    }
    SonoraStub(
        "QueuePage",
        texts = listOf(props.heading, props.context),
        slots = listOf(props.footer),
        taps = listOf(
            (if (editing) "Done editing queue" else "Edit queue") to toggleEdit,
            "Clear queue" to props.onClear,
            "Close queue" to props.onClose,
        ),
    )
}
