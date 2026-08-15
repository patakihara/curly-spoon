package net.develivarr.auralis

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import net.develivarr.auralis.navigation.AuralisNavHost
import net.develivarr.auralis.ui.theme.AuralisTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as AuralisApplication).container
        setContent {
            AuralisTheme {
                AuralisNavHost(container)
            }
        }
    }
}
