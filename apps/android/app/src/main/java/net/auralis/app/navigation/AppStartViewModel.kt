package net.auralis.app.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.settings.ServerConfigRepository

/** Where [AppStartViewModel] has decided to land the user, once it has decided. */
sealed interface StartState {
    data object Loading : StartState

    data class Ready(val destination: String) : StartState
}

/**
 * Decides the nav graph's start destination on launch: no server configured → onboarding;
 * a server is configured but the session isn't authenticated → login; already signed in →
 * home. [ApiClient.me] is the single probe for the latter two — any [ApiException] it throws
 * (including the "server not configured" one [net.auralis.app.AppContainer]'s `baseUrl`
 * lambda raises) means "not ready for home", so this wave doesn't need to distinguish why
 * auth failed, only that it did.
 */
class AppStartViewModel(
    private val serverConfigRepository: ServerConfigRepository,
    private val apiClient: ApiClient,
) : ViewModel() {
    private val _state = MutableStateFlow<StartState>(StartState.Loading)
    val state: StateFlow<StartState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val baseUrl = serverConfigRepository.getBaseUrl()
            val destination =
                if (baseUrl.isNullOrBlank()) {
                    Routes.ONBOARDING
                } else {
                    try {
                        apiClient.me()
                        Routes.HOME
                    } catch (e: ApiException) {
                        Routes.LOGIN
                    }
                }
            _state.value = StartState.Ready(destination)
        }
    }
}
