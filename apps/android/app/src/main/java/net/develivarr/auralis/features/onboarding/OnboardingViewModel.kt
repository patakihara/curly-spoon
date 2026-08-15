package net.develivarr.auralis.features.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.settings.ServerConfigRepository

/** State of the first-run "which Auralis server?" form. */
sealed interface OnboardingUiState {
    data object Idle : OnboardingUiState

    data object Saving : OnboardingUiState

    data class Error(val message: String) : OnboardingUiState
}

/**
 * Saves the Auralis (BFF) server address the app should talk to. Deliberately does not
 * verify reachability — that's a nice-to-have "test connection" step for a later wave, not
 * this one's job. Validation here is just "isn't blank".
 */
class OnboardingViewModel(private val serverConfigRepository: ServerConfigRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<OnboardingUiState>(OnboardingUiState.Idle)
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    fun submit(
        url: String,
        onSaved: () -> Unit,
    ) {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) {
            _uiState.value = OnboardingUiState.Error("Enter a server address.")
            return
        }
        viewModelScope.launch {
            _uiState.value = OnboardingUiState.Saving
            serverConfigRepository.setBaseUrl(trimmed)
            onSaved()
        }
    }
}
