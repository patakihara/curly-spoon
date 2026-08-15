package net.develivarr.auralis.features.music

/**
 * Maps an [net.develivarr.auralis.data.network.ApiException.code] — passed through unchanged by
 * every [MusicRepository] method, per that class's own doc comment — into copy a listener can
 * act on, rather than a music screen showing the raw machine code Jellyfin/the BFF use
 * internally. Mirrors the reasoning `apps/web/src/features/onboarding/LoginPage.tsx` already
 * applies to `invalid_credentials`; kept local to this feature rather than shared, since this
 * app has no cross-feature error-copy module yet for a second caller to justify one.
 *
 * `jellyfin_not_configured` can reach a screen two ways: [MusicRepository.availability]'s own
 * [MusicAvailability.Unconfigured] case (checked once, on screen entry, and rendered as its own
 * calm empty state — see [MusicLibraryViewModel]), or this same code arriving inside a later
 * [ArtistsPageResult.Failed]/[AlbumsPageResult.Failed]/[TracksPageResult.Failed] if the server's
 * Jellyfin connection was removed between that check and this call. The copy is deliberately
 * identical either way, so that race reads as the same calm message rather than a scarier one.
 *
 * An unrecognised code — any future upstream code this function doesn't yet know — degrades to
 * a generic, retry-worthy message rather than leaking the code verbatim to the user.
 */
fun musicErrorMessage(code: String): String =
    when (code) {
        "jellyfin_not_configured" ->
            "No Jellyfin server is connected yet. Connect one from the Auralis web app to browse music here."
        "upstream_auth_expired" ->
            "Your Jellyfin sign-in has expired. Reconnect Jellyfin from the Auralis web app."
        "invalid_credentials" ->
            "The stored Jellyfin sign-in is no longer valid. Reconnect Jellyfin from the Auralis web app."
        else -> "Couldn't load music right now. Check your connection and try again."
    }
