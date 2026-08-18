package net.develivarr.auralis.features.podcasts

/**
 * Composes the podcast detail header's meta line — `"{n} {episode|episodes} · {u} unplayed"`,
 * e.g. `"128 episodes · 3 unplayed"` or `"1 episode · 0 unplayed"` — from already-known counts.
 * Mirrors `apps/web`'s equivalent per `docs/design/screens/PODCAST_DETAIL.md` §5's shared joining
 * rule, alongside [PodcastDetailViewModel]'s other pure helpers ([sortEpisodes],
 * [episodeProgressState]) rather than inside `MediaHeader.kt` itself — this is podcast-specific
 * composition, not something every `MediaHeader` caller needs.
 *
 * Total and pure, so it's tested directly rather than only indirectly through a Robolectric
 * render: [episodeCount] `== 0` returns `null` (§5's "Meta line, whole: omit entirely" rule)
 * rather than rendering `"0 episodes · 0 unplayed"` for a podcast that hasn't loaded any episodes
 * yet. [unplayedCount] is always rendered once there's at least one episode, including `0` — a
 * real "you're caught up" state, not an absent field (§5, mirroring `BOOK_DETAIL.md`'s
 * `progressPercent` reasoning for the same "zero is meaningful" shape).
 */
fun composePodcastMeta(
    episodeCount: Int,
    unplayedCount: Int,
): String? {
    if (episodeCount == 0) return null
    val episodeWord = if (episodeCount == 1) "episode" else "episodes"
    return "$episodeCount $episodeWord · $unplayedCount unplayed"
}
