package net.auralis.app.features.player

import net.auralis.app.data.model.AudioTrack
import net.auralis.app.data.model.PlaybackSession

/**
 * Picks which track of a (possibly multi-file, chaptered) audiobook to play. This wave plays
 * only the first track — stitching every track into one continuous timeline is a later wave's
 * job — so "first" means lowest [AudioTrack.index], not list position: `audioTracks` is not
 * guaranteed to arrive in index order.
 */
fun firstPlayableTrack(session: PlaybackSession): AudioTrack? = session.audioTracks.minByOrNull { it.index }
