package net.auralis.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import net.auralis.app.ui.HomeScreen
import net.auralis.app.ui.theme.AuralisTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AuralisTheme {
                HomeScreen()
            }
        }
    }
}
