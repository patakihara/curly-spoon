package net.develivarr.auralis

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import net.develivarr.auralis.data.settings.ThemeMode
import net.develivarr.auralis.features.settings.ThemeUiState
import net.develivarr.auralis.features.settings.ThemeViewModel
import net.develivarr.auralis.navigation.AuralisNavHost
import net.develivarr.auralis.ui.theme.AuralisTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as AuralisApplication).container
        setContent {
            val themeViewModel: ThemeViewModel =
                viewModel(
                    factory =
                        viewModelFactory {
                            initializer { ThemeViewModel(container.themePreferencesRepository) }
                        },
                )
            // Wave 16f-A-1: gated exactly like AppStartViewModel/LoadingScreen in
            // AuralisNavHost — [AuralisTheme] has to wrap the *whole* nav host (including its
            // own loading screen), so the persisted mode/accent must be read here, one
            // composable frame before AuralisNavHost is even entered, or the app would draw one
            // frame in the default theme and jump to the stored one right after. The brief
            // loading frame below has no theming applied at all (plain platform default) rather
            // than a wrong-then-right flash of Sonora's own colours.
            when (val themeState = themeViewModel.state.collectAsState().value) {
                is ThemeUiState.Loading -> Box(modifier = Modifier.fillMaxSize())
                is ThemeUiState.Ready -> {
                    val darkTheme =
                        when (themeState.mode) {
                            ThemeMode.LIGHT -> false
                            ThemeMode.DARK -> true
                            ThemeMode.SYSTEM -> isSystemInDarkTheme()
                        }
                    AuralisTheme(darkTheme = darkTheme, accent = themeState.accent) {
                        AuralisNavHost(container, themeViewModel)
                    }
                }
            }
        }
    }
}
