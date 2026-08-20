package net.develivarr.auralis.features.onboarding

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.navigation.NavHostController
import net.develivarr.auralis.AppContainer
import net.develivarr.auralis.navigation.Routes

/**
 * First-run screen: enter the Auralis server's own address, then move on to login.
 *
 * Wave 16e-settings-A (`docs/design/screens/SETTINGS.md` §6.7) gives this screen Sonora's card
 * treatment — an elevated container, a step label, a title, a subtitle — using Android's own
 * **two** real steps ("Step 1 of 2" / "Step 2 of 2"), not web's three (§2.4/§8 of that spec:
 * this screen solves a genuinely different problem than web's `SetupPage` — the Auralis BFF's
 * own address, not Audiobookshelf's — and Android's Jellyfin connection has no
 * onboarding-adjacent screen at all, so a third step here would be new feature scope, not a
 * restyle). Title/copy stay Android's own existing strings for the same reason.
 *
 * Title uses [MaterialTheme.typography]'s `headlineSmall` — Sonora's weight-900 `--h3-size`
 * region, the same scale [net.develivarr.auralis.ui.components.MediaHeader] already established
 * (`16b-2-A`) — fixed rather than width-responsive like `MediaHeader`'s wide/compact split,
 * since this card is always capped at [CARD_MAX_WIDTH] and never grows to a size where a larger
 * heading would fit better.
 *
 * **No [net.develivarr.auralis.ui.theme.AuralisAppTokens] read here, deliberately confirmed, not
 * merely omitted.** `MainActivity.kt` wraps the *entire* `AuralisNavHost` — including this
 * screen — in `AuralisTheme`, so the app-level tokens are in composition scope; nothing on this
 * screen needs one of them, though, because Sonora's chroma/type/shape scale is already wired
 * into `MaterialTheme.colorScheme`/`.typography`/`.shapes` itself (`16b-2-A`), and every element
 * here — the card, the title, the muted step label/subtitle, the button, the error text — reads
 * one of those three rather than an app-level token. Only a component needing a value Sonora
 * doesn't ship as a Material role (accent-ink, the four tone-* colors) needs
 * [net.develivarr.auralis.ui.theme.AuralisAppTokens] at all.
 */
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
        Box(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp),
            contentAlignment = Alignment.TopCenter,
        ) {
            ElevatedCard(
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.widthIn(max = CARD_MAX_WIDTH),
            ) {
                val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
                Column(modifier = Modifier.padding(24.dp)) {
                    Text(
                        "Step 1 of 2".uppercase(),
                        style = MaterialTheme.typography.labelLarge,
                        color = mutedColor,
                        modifier = Modifier.testTag("onboarding-step-label"),
                    )
                    Text(
                        "Connect to Auralis",
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.padding(top = 4.dp).testTag("onboarding-title"),
                    )
                    Text(
                        "Enter the address of your Auralis server.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = mutedColor,
                        modifier = Modifier.padding(top = 4.dp).testTag("onboarding-subtitle"),
                    )
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
    }
}

/**
 * Web's `OnboardingCard` caps at 480px (`docs/design/screens/SETTINGS.md` §3.2's "Card wrapper"
 * row) — matched here per this project's established tie-break (match web when nothing else
 * decides it; the spec's own §6.2 states the rule, for a different row of the same table). No
 * existing test pins this value; it is a judgement call, not a spec-mandated number.
 */
private val CARD_MAX_WIDTH = 480.dp
