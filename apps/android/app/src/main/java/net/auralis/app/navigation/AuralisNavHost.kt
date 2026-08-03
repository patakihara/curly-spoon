package net.auralis.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import net.auralis.app.AppContainer
import net.auralis.app.features.login.LoginScreen
import net.auralis.app.features.home.HomeScreen
import net.auralis.app.features.onboarding.OnboardingScreen
import net.auralis.app.features.player.PlayerViewModel
import net.auralis.app.features.requests.RequestsScreen

/** Route name constants for [AuralisNavHost]'s graph. */
object Routes {
    const val ONBOARDING = "onboarding"
    const val LOGIN = "login"
    const val HOME = "home"
    const val REQUESTS = "requests"
}

/**
 * The app's single nav graph: onboarding → login → home. [AppStartViewModel] decides the
 * start destination; until it has, [LoadingScreen] is shown instead of the graph so nothing
 * flashes the wrong first screen.
 */
@Composable
fun AuralisNavHost(
    container: AppContainer,
    navController: NavHostController = rememberNavController(),
) {
    val startViewModel: AppStartViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { AppStartViewModel(container.serverConfigRepository, container.apiClient) }
                },
        )
    // Constructed once at the nav host's own scope — not per-screen — so the MediaController
    // connection it owns survives navigating away from and back to Home rather than being torn
    // down and rebuilt. `initializer` blocks run outside composition, so the Context has to be
    // read here, during composition, and captured by the closure below. `applicationContext`
    // rather than the raw `LocalContext.current`: this ViewModel's ViewModelStore is retained
    // across configuration changes by the hosting Activity, so a raw Activity Context captured
    // once would go stale (pointing at a destroyed Activity) after the first rotation.
    val appContext = LocalContext.current.applicationContext
    val playerViewModel: PlayerViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { PlayerViewModel(appContext, container.apiClient) }
                },
        )
    when (val state = startViewModel.state.collectAsState().value) {
        is StartState.Loading -> LoadingScreen()
        is StartState.Ready -> {
            NavHost(navController = navController, startDestination = state.destination) {
                composable(Routes.ONBOARDING) { OnboardingScreen(container, navController) }
                composable(Routes.LOGIN) { LoginScreen(container, navController) }
                composable(Routes.HOME) { HomeScreen(container, playerViewModel, navController) }
                composable(Routes.REQUESTS) { RequestsScreen(container) }
            }
        }
    }
}

@Composable
private fun LoadingScreen() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}
