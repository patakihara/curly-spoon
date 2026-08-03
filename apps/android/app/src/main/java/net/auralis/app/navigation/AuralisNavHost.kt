package net.auralis.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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

/** Route name constants for [AuralisNavHost]'s graph. */
object Routes {
    const val ONBOARDING = "onboarding"
    const val LOGIN = "login"
    const val HOME = "home"
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
    when (val state = startViewModel.state.collectAsState().value) {
        is StartState.Loading -> LoadingScreen()
        is StartState.Ready -> {
            NavHost(navController = navController, startDestination = state.destination) {
                composable(Routes.ONBOARDING) { OnboardingScreen(container, navController) }
                composable(Routes.LOGIN) { LoginScreen(container, navController) }
                composable(Routes.HOME) { HomeScreen(container) }
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
