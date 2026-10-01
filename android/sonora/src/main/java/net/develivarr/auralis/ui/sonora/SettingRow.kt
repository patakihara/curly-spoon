package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.Role
import net.develivarr.auralis.generated.ui.SettingRowProps

/** Sonora's SettingRow, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun SettingRow(props: SettingRowProps) {
    SonoraStub(
        "SettingRow",
        texts = listOf(props.title, props.sub, if (props.checked == true) "On" else "Off"),
        press = Press(props.onChange?.let { change -> { change(props.checked != true) } }, role = Role.Switch),
        label = props.title,
    )
}
