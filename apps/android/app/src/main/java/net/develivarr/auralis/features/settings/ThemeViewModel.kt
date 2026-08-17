package net.develivarr.auralis.features.settings

import androidx.compose.ui.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.settings.ThemeMode
import net.develivarr.auralis.data.settings.ThemePreferencesRepository

/** Where [ThemeViewModel] is in loading the persisted theme, mirroring
 * [net.develivarr.auralis.navigation.AppStartViewModel]'s own `StartState.Loading`/`Ready` shape —
 * the same gate, for the same reason: [MainActivity] must not draw [AuralisTheme] with a default
 * accent/mode and then jump to the stored one a frame later. */
sealed interface ThemeUiState {
    data object Loading : ThemeUiState

    data class Ready(val mode: ThemeMode, val accent: Color) : ThemeUiState
}

/**
 * Owns the two Settings-screen values (wave 16f-A-1) and is the single source [MainActivity]
 * reads to drive [net.develivarr.auralis.ui.theme.AuralisTheme] itself — not scoped to
 * [net.develivarr.auralis.navigation.AuralisNavHost] the way [AppStartViewModel] and
 * `PlayerViewModel` are, because [MainActivity] has to wrap the *whole* nav host (including its
 * own `LoadingScreen`) in [AuralisTheme], so this has to exist and be readable one composable
 * frame *before* the nav host is even entered.
 *
 * [state] updates optimistically: [setMode]/[setAccent] write the new value into [state]
 * immediately and persist in the background via [repository], rather than round-tripping through
 * [KeyValueStore] (which exposes no `Flow`, only suspend get/put — see that interface's own doc
 * comment) before the UI or [MainActivity]'s theme reflects the change. A failed persist would
 * leave the in-memory choice live for the rest of this process but not survive a restart; there
 * is no user-visible error surface for that today, matching every other write in this app's
 * settings layer (`ServerConfigRepository` has none either).
 */
class ThemeViewModel(private val repository: ThemePreferencesRepository) : ViewModel() {
    private val _state = MutableStateFlow<ThemeUiState>(ThemeUiState.Loading)
    val state: StateFlow<ThemeUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.value = ThemeUiState.Ready(mode = repository.getMode(), accent = repository.getAccent())
        }
    }

    fun setMode(mode: ThemeMode) {
        val ready = _state.value as? ThemeUiState.Ready ?: return
        _state.value = ready.copy(mode = mode)
        viewModelScope.launch { repository.setMode(mode) }
    }

    fun setAccent(accent: Color) {
        val ready = _state.value as? ThemeUiState.Ready ?: return
        _state.value = ready.copy(accent = accent)
        viewModelScope.launch { repository.setAccent(accent) }
    }
}
