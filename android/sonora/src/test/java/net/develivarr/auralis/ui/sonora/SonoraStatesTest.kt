package net.develivarr.auralis.ui.sonora

import java.io.File
import net.develivarr.auralis.generated.states.notActions
import org.junit.Assert.assertEquals
import org.junit.Test

class SonoraStatesTest {
    private val source = File("src/main/java/net/develivarr/auralis")

    /** The components in `ui/sonora`, each with the action props its generated props declare. */
    private fun actions(): Map<String, List<String>> =
        File(source, "ui/sonora").listFiles { f -> f.name.endsWith(".kt") }!!
            .map { it.name.removeSuffix(".kt") }
            .mapNotNull { name ->
                val props = File(source, "generated/ui/${name}Props.kt").takeIf { it.exists() } ?: return@mapNotNull null
                val declared = Regex("""(?m)^\s+val (on[A-Z]\w*):""").findAll(props.readText()).map { it.groupValues[1] }
                name to declared.filterNot { (name to it) in notActions }.toList()
            }
            .toMap()

    private fun disabledProp(name: String) =
        Regex("""(?m)^\s+val disabled:""").containsMatchIn(File(source, "generated/ui/${name}Props.kt").readText())

    @Test
    fun `M0_states_b every Compose component with an action has its states drawn`() {
        val interactive = actions().filterValues { it.isNotEmpty() }.keys
        assertEquals(interactive.sorted(), sonoraStates.map { it.name }.sorted())
    }

    @Test
    fun `M0_states_b a component with a disabled prop is drawn with it set`() {
        sonoraStates.forEach { entry ->
            assertEquals("${entry.name} declares disabled", disabledProp(entry.name), entry.declaresDisabled)
        }
    }
}
