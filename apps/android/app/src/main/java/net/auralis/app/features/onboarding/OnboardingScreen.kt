package net.auralis.app.features.onboarding

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.navigation.NavHostController
import net.auralis.app.AppContainer
import net.auralis.app.navigation.Routes

/** First-run screen: enter the Auralis server's own address, then move on to login. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: OnboardingViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { OnboardingViewModel(container.serverConfigRepository) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    var url by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Connect to Auralis") })
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxWidth().padding(innerPadding).padding(16.dp)) {
            Text("Enter the address of your Auralis server.")
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("Server address") },
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            )
            if (uiState is OnboardingUiState.Error) {
                Text(
                    text = (uiState as OnboardingUiState.Error).message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            Button(
                onClick = {
                    viewModel.submit(url) {
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(Routes.ONBOARDING) { inclusive = true }
                        }
                    }
                },
                enabled = uiState !is OnboardingUiState.Saving,
                modifier = Modifier.padding(top = 16.dp),
            ) {
                Text("Continue")
            }
        }
    }
}
