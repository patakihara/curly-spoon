package net.auralis.app.features.search

import net.auralis.app.data.model.ProviderEntry

/**
 * Whether a request could actually be fulfilled right now — the gate behind
 * [UnifiedSearchScreen]'s two "Available to request" groups (`docs/ROADMAP.md` §12b/12b-A2).
 * A Kotlin mirror of `apps/web/src/features/search/searchRequestability.ts`'s two flags,
 * kept in lockstep deliberately rather than re-derived: both clients answer "could this kind
 * be requested on this server" the same way, and drifting the two answers apart would be a
 * silent product inconsistency, not a platform difference.
 *
 * Books need *both* an enabled indexer and an enabled download client — an indexer with
 * nowhere to hand a grab to, or a configured-but-disabled indexer, both mean a request would
 * sit unfulfillable forever, which is exactly the outcome these gates exist to prevent
 * offering. Music has its own single gate: an enabled, *configured* `"music"`-kind provider
 * (slskd, today — the provider interface is pluggable, per `docs/HANDOVER.md`'s "decisions
 * already made").
 *
 * `configured` and `enabled` are independent on [ProviderEntry] (a provider can be enabled
 * with nothing filled in yet, or configured but switched off) — both must hold.
 *
 * Deliberately indifferent to chip-selection visibility: unlike
 * `searchRequestability.ts`'s combined `requestabilitySections`, this module only answers
 * "is the *server* capable of fulfilling this kind of request", not "is this kind of result
 * currently shown". [UnifiedSearchScreen] applies the chip-visibility half itself, the same
 * way it already gates the library sections on `VisibleKinds` — see that file's own
 * `visible.books && …` checks. Splitting it this way means [UnifiedSearchViewModel] never
 * needs to know about the chip state to decide whether to even fetch.
 */
private fun hasEnabledProvider(
    providers: List<ProviderEntry>,
    kind: String,
): Boolean = providers.any { it.kind == kind && it.configured && it.enabled }

fun hasEnabledIndexer(providers: List<ProviderEntry>): Boolean = hasEnabledProvider(providers, "indexer")

fun hasEnabledDownloadClient(providers: List<ProviderEntry>): Boolean = hasEnabledProvider(providers, "download")

fun hasEnabledMusicProvider(providers: List<ProviderEntry>): Boolean = hasEnabledProvider(providers, "music")

/** Both book-pipeline flags must hold — see this file's header comment. */
fun canRequestBooks(providers: List<ProviderEntry>): Boolean =
    hasEnabledIndexer(providers) && hasEnabledDownloadClient(providers)
