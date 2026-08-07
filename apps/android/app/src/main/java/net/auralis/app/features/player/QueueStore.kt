package net.auralis.app.features.player

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Canonical, insertion-order entry list for one content type's queue, plus which entry within it
 * is currently playing. Mirrors `apps/web/src/state/createQueueStore.ts`'s `SimpleQueueState<T>`
 * exactly — [order] is never reordered outside of [QueueStore.enqueueNext]/[QueueStore.enqueueLast],
 * and [cursor] is an index into it.
 */
data class SimpleQueueState<T>(
    val order: List<T>,
    val cursor: Int,
)

/**
 * A per-content-type playback queue (Android wave 12f) — one instance each for music, podcasts
 * and audiobooks (see [QueueContentType]), created via [createQueueStore] so the three never
 * share a backing [MutableStateFlow]. Deliberately a plain Kotlin class over a `StateFlow`
 * rather than a transliteration of the web `zustand` store: this project has no store framework,
 * and `StateFlow` is the idiomatic equivalent already used everywhere else in this ViewModel
 * layer (see [PlayerViewModel.uiState]) — a `MutableStateFlow` read/copy/write under this class's
 * own methods gives the same "one authoritative snapshot per queue" property `create<T>()`
 * gives web, without pulling in a dependency this app doesn't otherwise have.
 *
 * `docs/ROADMAP.md` §12f, requirement 1: switching content types must never clear an unrelated
 * queue. That property holds structurally here, not by convention — each [QueueStore] instance
 * owns its own [MutableStateFlow], so [clearQueue] on one can never reach another's state.
 */
class QueueStore<T> {
    private val _state = MutableStateFlow<SimpleQueueState<T>?>(null)

    /** The current queue, or `null` when nothing is queued — a queue-view surface's data
     *  source once one exists (not built in this wave; see this file's own header). */
    val state: StateFlow<SimpleQueueState<T>?> = _state.asStateFlow()

    /** Replaces the whole queue outright, e.g. "queue this whole podcast's episodes starting
     *  here". `null` clears it, same as [clearQueue]. */
    fun setQueue(queue: SimpleQueueState<T>?) {
        _state.value = queue
    }

    /** Inserts [entry] immediately after the current cursor — "play this next" — without
     *  moving the cursor itself. Bootstraps a one-entry queue at `cursor = 0` if nothing is
     *  queued yet, matching [createQueueStore]'s web counterpart: an empty queue has no "after
     *  the cursor" position to insert at, so starting one is the only sense in which "next" is
     *  meaningful. */
    fun enqueueNext(entry: T) {
        val current = _state.value
        if (current == null) {
            _state.value = SimpleQueueState(order = listOf(entry), cursor = 0)
            return
        }
        val order = current.order.toMutableList()
        order.add((current.cursor + 1).coerceIn(0, order.size), entry)
        _state.value = current.copy(order = order)
    }

    /** Appends [entry] to the end of the queue — "add to queue" — regardless of where the
     *  cursor currently sits. Same empty-queue bootstrap as [enqueueNext]. */
    fun enqueueLast(entry: T) {
        val current = _state.value
        if (current == null) {
            _state.value = SimpleQueueState(order = listOf(entry), cursor = 0)
            return
        }
        _state.value = current.copy(order = current.order + entry)
    }

    /** Moves the cursor to the next entry and returns it, or returns `null` and leaves the
     *  cursor (and the queue) untouched at the end — no wrap, no clear. A caller that wants
     *  "stop playing" on `null` decides that itself; this store has no opinion about
     *  playback, matching web's own `advance()`. */
    fun advance(): T? {
        val current = _state.value ?: return null
        val nextCursor = current.cursor + 1
        if (nextCursor >= current.order.size) return null
        val next = current.order.getOrNull(nextCursor) ?: return null
        _state.value = current.copy(cursor = nextCursor)
        return next
    }

    /** Clears this queue only — the other two content types' queues are separate [QueueStore]
     *  instances and are never touched by this call (see this class's own header). Does not
     *  touch playback: whatever is currently loaded on the [PlaybackHandle] keeps playing;
     *  only what plays *after* it is affected. */
    fun clearQueue() {
        _state.value = null
    }
}

/** One [QueueStore] per content type, matching `createQueueStore<T>()`'s role on web: a fresh,
 *  independent instance every call, never a shared singleton. */
fun <T> createQueueStore(): QueueStore<T> = QueueStore()
