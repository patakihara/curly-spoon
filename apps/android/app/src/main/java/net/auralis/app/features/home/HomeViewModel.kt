package net.auralis.app.features.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.auralis.app.data.model.Shelf
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.settings.ServerConfigRepository

/** One card in a [ShelfUi]'s row — a flattened, display-ready view of a `LibraryItem`. */
data class ShelfItemUi(
    val id: String,
    val title: String,
    val coverUrl: String?,
)

/** One horizontally-scrolling row on the home screen, mapped from a `Shelf`. */
data class ShelfUi(
    val id: String,
    val label: String,
    val items: List<ShelfItemUi>,
)

sealed interface HomeUiState {
    data object Loading : HomeUiState

    data class Loaded(val shelves: List<ShelfUi>) : HomeUiState

    data class Error(val message: String) : HomeUiState
}

/**
 * Loads the signed-in user's first library's home shelves. Cover URLs are resolved here,
 * once, rather than at composition time — building one needs [ServerConfigRepository]'s
 * suspend `getBaseUrl()`, so resolving it per-recomposition would mean re-suspending for a
 * value that never changes for the lifetime of this ViewModel.
 */
class HomeViewModel(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                val baseUrl =
                    serverConfigRepository.getBaseUrl()
                        ?: throw ApiException("server_not_configured", "No Auralis server configured", 0)
                val libraries = apiClient.libraries()
                val firstLibrary = libraries.firstOrNull()
                if (firstLibrary == null) {
                    _uiState.value = HomeUiState.Loaded(emptyList())
                    return@launch
                }
                val shelves = apiClient.libraryHome(firstLibrary.id)
                _uiState.value = HomeUiState.Loaded(shelves.map { it.toUi(baseUrl) })
            } catch (e: ApiException) {
                _uiState.value = HomeUiState.Error(e.message)
            }
        }
    }

    private fun Shelf.toUi(baseUrl: String): ShelfUi =
        ShelfUi(
            id = id,
            label = label,
            items =
                items.map { item ->
                    ShelfItemUi(
                        id = item.id,
                        title = item.media.title,
                        coverUrl = "${baseUrl.trimEnd('/')}/api/v1/media/${item.id}/cover?width=200",
                    )
                },
        )
}
