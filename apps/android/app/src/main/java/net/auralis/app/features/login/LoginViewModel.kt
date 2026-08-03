package net.auralis.app.features.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException

/** State of the username/password sign-in form. */
sealed interface LoginUiState {
    data object Idle : LoginUiState

    data object LoggingIn : LoginUiState

    data class Error(val message: String) : LoginUiState
}

/**
 * Signs in against the configured Auralis server. The whole error-handling story for this
 * wave is: any [ApiException] from [ApiClient.login] surfaces as its `message`, verbatim, as
 * inline error text — no retry/offline UI beyond that.
 */
class LoginViewModel(private val apiClient: ApiClient) : ViewModel() {
    private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun login(
        username: String,
        password: String,
        onSuccess: () -> Unit,
    ) {
        if (username.isBlank() || password.isBlank()) {
            _uiState.value = LoginUiState.Error("Enter your username and password.")
            return
        }
        viewModelScope.launch {
            _uiState.value = LoginUiState.LoggingIn
            try {
                apiClient.login(username, password)
                onSuccess()
            } catch (e: ApiException) {
                _uiState.value = LoginUiState.Error(e.message)
            }
        }
    }
}
