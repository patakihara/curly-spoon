package net.develivarr.auralis.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException

/**
 * Resolves which of the five shell destinations are safe to show (wave 16d-A-2), mirroring
 * `apps/web/src/components/destinations.ts`'s `Shell.tsx` call site: fetch whether Jellyfin and
 * Audiobookshelf are configured, and — only if Audiobookshelf is — which library media types
 * exist, then fold all three into [visibleShellDestinations].
 *
 * Starts at [visibleShellDestinations] of an all-`false` [DestinationAvailability] — For You and
 * Search only — the same "pick the known destinations unfilled" default this project already
 * chose for web's cold-cache nav rail (`docs/HANDOVER.md`), so a destination only ever
 * *appears* once its upstream resolves as configured; it never flashes shown-then-hidden.
 *
 * Any [ApiException] on a given call degrades that upstream to "not configured" — the same
 * `?? false` default web's react-query call sites use on error or on data not yet having
 * arrived — rather than surfacing an error state a nav-visibility computation has no UI for.
 */
class ShellDestinationsViewModel(
    private val apiClient: ApiClient,
) : ViewModel() {
    private val _visibleDestinations =
        MutableStateFlow(visibleShellDestinations(DestinationAvailability()))
    val visibleDestinations: StateFlow<Set<ShellDestination>> = _visibleDestinations.asStateFlow()

    init {
        viewModelScope.launch {
            // Jellyfin and Audiobookshelf are independent upstreams (own base URL, own
            // credential — see `apps/server/src/routes/jellyfin.ts`), so both configured checks
            // fire concurrently rather than one waiting on the other, the same independence
            // web's two react-query hooks have.
            val (jellyfinConfigured, audiobookshelfConfigured) =
                coroutineScope {
                    val jellyfinDeferred = async { fetchJellyfinConfigured() }
                    val audiobookshelfDeferred = async { fetchAudiobookshelfConfigured() }
                    jellyfinDeferred.await() to audiobookshelfDeferred.await()
                }
            // Only fetched when Audiobookshelf is configured — matching web's
            // `useLibrariesQuery(enabled = audiobookshelfConfigured)`; there is nothing to look
            // up otherwise, and an unconfigured server's `/libraries` 409s.
            val (hasBookLibrary, hasPodcastLibrary) =
                if (audiobookshelfConfigured) fetchLibraryKinds() else false to false

            _visibleDestinations.value =
                visibleShellDestinations(
                    DestinationAvailability(
                        jellyfinConfigured = jellyfinConfigured,
                        audiobookshelfConfigured = audiobookshelfConfigured,
                        hasBookLibrary = hasBookLibrary,
                        hasPodcastLibrary = hasPodcastLibrary,
                    ),
                )
        }
    }

    private suspend fun fetchJellyfinConfigured(): Boolean =
        try {
            apiClient.jellyfinConfig().configured
        } catch (e: ApiException) {
            false
        }

    private suspend fun fetchAudiobookshelfConfigured(): Boolean =
        try {
            apiClient.getSetupState().configured
        } catch (e: ApiException) {
            false
        }

    private suspend fun fetchLibraryKinds(): Pair<Boolean, Boolean> =
        try {
            val libraries = apiClient.libraries()
            val hasBookLibrary = libraries.any { it.mediaType == "book" }
            val hasPodcastLibrary = libraries.any { it.mediaType == "podcast" }
            hasBookLibrary to hasPodcastLibrary
        } catch (e: ApiException) {
            false to false
        }
}
