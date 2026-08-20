package net.develivarr.auralis.features.login

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.navigation.NavHostController
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.navigation.Routes

/**
 * Username/password sign-in screen, shown once a server address is configured.
 *
 * Wave 16e-settings-A (`docs/design/screens/SETTINGS.md` §6.7) gives this screen the same Sonora
 * card treatment as [net.develivarr.auralis.features.onboarding.OnboardingScreen] — see that
 * screen's doc comment for the full reasoning (two real steps, not web's three; no
 * [net.develivarr.auralis.ui.theme.AuralisAppTokens] read needed, since `MaterialTheme` is
 * already Sonora-themed end to end). This is Android's own second and last step, so no subtitle
 * — "Sign in" needs no further description the way "Connect to Auralis" did.
 *
 * §6.8 of the same spec adds the empty-field guard to the submit button below, matching web's
 * `disabled={mutation.isPending || !username || !password}` contract. The existing inline error
 * `Text` path is untouched — the guard only changes when the button itself is enabled, and
 * Compose's default `Button` already exposes that `enabled` state via semantics (§11: "do not
 * override it away" — nothing here does).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    container: AppContainer,
    navController: NavHostController,
) {
    val viewModel: LoginViewModel =
        viewModel(
            factory =
                viewModelFactory {
                    initializer { LoginViewModel(container.apiClient) }
                },
        )
    val uiState by viewModel.uiState.collectAsState()
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Sign in") })
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp),
            contentAlignment = Alignment.TopCenter,
        ) {
            ElevatedCard(
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.widthIn(max = LOGIN_CARD_MAX_WIDTH),
            ) {
                val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
                Column(modifier = Modifier.padding(24.dp)) {
                    Text(
                        "Step 2 of 2".uppercase(),
                        style = MaterialTheme.typography.labelLarge,
                        color = mutedColor,
                        modifier = Modifier.testTag("login-step-label"),
                    )
                    Text(
                        "Sign in",
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.padding(top = 4.dp).testTag("login-title"),
                    )
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text("Username") },
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                    )
                    if (uiState is LoginUiState.Error) {
                        Text(
                            text = (uiState as LoginUiState.Error).message,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    Button(
                        onClick = {
                            viewModel.login(username, password) {
                                navController.navigate(Routes.HOME) {
                                    popUpTo(Routes.LOGIN) { inclusive = true }
                                }
                            }
                        },
                        // §6.8: matches web's disabled={mutation.isPending || !username || !password}.
                        enabled =
                            uiState !is LoginUiState.LoggingIn &&
                                username.isNotBlank() &&
                                password.isNotBlank(),
                        modifier = Modifier.padding(top = 16.dp),
                    ) {
                        Text("Log in")
                    }
                }
            }
        }
    }
}

/** See [net.develivarr.auralis.features.onboarding.OnboardingScreen]'s `CARD_MAX_WIDTH` — same
 * value, same reasoning, kept as a separate file-local constant rather than a shared one since
 * neither screen shares any other code and a cross-feature-package constant would be a bigger
 * coupling than one repeated literal. */
private val LOGIN_CARD_MAX_WIDTH = 480.dp
