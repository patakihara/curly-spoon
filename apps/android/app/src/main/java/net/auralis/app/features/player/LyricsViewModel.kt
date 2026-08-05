package net.auralis.app.features.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.auralis.app.data.model.JellyfinLyrics
import net.auralis.app.features.music.LyricsResult
import net.auralis.app.features.music.MusicRepository

/** What [LyricsScreen] renders (Android wave J). */
sealed interface LyricsUiState {
    data object Loading : LyricsUiState

    /**
     * [lyrics] is `null` when Jellyfin has no lyrics for the track — the common case across most
     * of a library, not an error. See [net.auralis.app.features.music.LyricsResult]'s own doc
     * comment for why that outcome never reaches [Failed] instead.
     */
    data class Loaded(val lyrics: JellyfinLyrics?) : LyricsUiState

    /** The `GET /jellyfin/tracks/{itemId}/lyrics` call itself failed; [code] is the originating
     * `ApiException.code`. */
    data class Failed(val code: String) : LyricsUiState
}

/**
 * Backs [LyricsScreen] — fetches [MusicRepository.lyrics] for whichever Jellyfin track id
 * [PlayerViewModel.uiState] currently reports playing. Deliberately thin: the only branch worth
 * getting wrong here (which line is active as playback advances) lives in this file's neighbour,
 * [activeLineIndex] — a pure function, testable without this class at all. This class exists
 * only to own the one network call and its loading/error state, the same split
 * `MusicSearchViewModel`/every other repository-backed ViewModel in this app already uses.
 */
class LyricsViewModel(private val musicRepository: MusicRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<LyricsUiState>(LyricsUiState.Loading)
    val uiState: StateFlow<LyricsUiState> = _uiState.asStateFlow()

    /** The item id [uiState] currently reflects (or is loading), so a repeated call for the
     * *same* track — e.g. a recomposition after an unrelated player-state change — doesn't
     * re-fetch. `null` until the first [ensureLoaded] call. */
    private var loadedForItemId: String? = null

    /**
     * Fetches lyrics for [itemId] unless [uiState] already reflects it. Safe to call on every
     * recomposition that observes the current track id — [LyricsScreen] does exactly that via a
     * `LaunchedEffect(itemId)` — since a matching [itemId] is a no-op rather than a duplicate
     * request.
     */
    fun ensureLoaded(itemId: String) {
        if (loadedForItemId == itemId) return
        loadedForItemId = itemId
        _uiState.value = LyricsUiState.Loading
        viewModelScope.launch {
            when (val result = musicRepository.lyrics(itemId)) {
                is LyricsResult.Loaded -> _uiState.value = LyricsUiState.Loaded(result.lyrics)
                is LyricsResult.Failed -> _uiState.value = LyricsUiState.Failed(result.code)
            }
        }
    }
}
