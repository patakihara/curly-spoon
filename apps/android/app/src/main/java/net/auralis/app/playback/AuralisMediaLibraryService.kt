package net.auralis.app.playback

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession

/**
 * Deliberately empty for now. Its only job in Phase 5a is to exist, be declared in the
 * manifest with the androidx.media3.session.MediaLibraryService intent filter, and prove
 * that the Android Auto manifest merge (meta-data + automotive_app_desc.xml) succeeds
 * against a real media3 service class rather than a stub. Phase 7 gives it a real
 * MediaLibrarySession backed by the actual player and library browse tree.
 */
@OptIn(UnstableApi::class)
class AuralisMediaLibraryService : MediaLibraryService() {
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
        return null
    }
}
