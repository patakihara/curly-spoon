package net.auralis.app.features.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QueueStoreTest {
    @Test
    fun `a fresh store has no queue`() {
        val store = createQueueStore<String>()
        assertNull(store.state.value)
    }

    @Test
    fun `enqueueNext on an empty queue bootstraps a one-entry queue at cursor -1, not yet current`() {
        // cursor -1, not 0: this store never carries the item actually playing right now (that
        // lives outside it, on PlayerViewModel's own currentAudiobookItemId/currentContentType)
        // -- only what comes after it. A bootstrap at cursor 0 would claim "a" is already
        // current, so the very next advance() would try to move past it and return null instead
        // of "a" itself. See the next test, and enqueueNext's own doc comment.
        val store = createQueueStore<String>()
        store.enqueueNext("a")
        assertEquals(SimpleQueueState(order = listOf("a"), cursor = -1), store.state.value)
    }

    @Test
    fun `enqueueNext on an empty queue -- the very next advance returns that entry`() {
        // Pins the regression PlayerViewModelQueueTest.kt hit: queueing an episode/chapter while
        // something else (untracked by this store) plays must make it the next advance() result,
        // not a no-op.
        val store = createQueueStore<String>()
        store.enqueueNext("a")
        assertEquals("a", store.advance())
    }

    @Test
    fun `enqueueLast on an empty queue bootstraps a one-entry queue at cursor -1, not yet current`() {
        val store = createQueueStore<String>()
        store.enqueueLast("a")
        assertEquals(SimpleQueueState(order = listOf("a"), cursor = -1), store.state.value)
    }

    @Test
    fun `enqueueLast on an empty queue -- the very next advance returns that entry`() {
        val store = createQueueStore<String>()
        store.enqueueLast("a")
        assertEquals("a", store.advance())
    }

    @Test
    fun `enqueueNext inserts immediately after the cursor without moving it`() {
        val store = createQueueStore<String>()
        store.setQueue(SimpleQueueState(order = listOf("a", "b", "c"), cursor = 0))
        store.enqueueNext("x")
        assertEquals(SimpleQueueState(order = listOf("a", "x", "b", "c"), cursor = 0), store.state.value)
    }

    @Test
    fun `enqueueLast appends regardless of cursor position`() {
        val store = createQueueStore<String>()
        store.setQueue(SimpleQueueState(order = listOf("a", "b", "c"), cursor = 1))
        store.enqueueLast("x")
        assertEquals(SimpleQueueState(order = listOf("a", "b", "c", "x"), cursor = 1), store.state.value)
    }

    @Test
    fun `advance moves the cursor forward and returns the next entry`() {
        val store = createQueueStore<String>()
        store.setQueue(SimpleQueueState(order = listOf("a", "b", "c"), cursor = 0))
        val next = store.advance()
        assertEquals("b", next)
        assertEquals(SimpleQueueState(order = listOf("a", "b", "c"), cursor = 1), store.state.value)
    }

    @Test
    fun `advance at the end returns null and does not clear or move the cursor`() {
        val store = createQueueStore<String>()
        store.setQueue(SimpleQueueState(order = listOf("a", "b"), cursor = 1))
        val next = store.advance()
        assertNull(next)
        assertEquals(SimpleQueueState(order = listOf("a", "b"), cursor = 1), store.state.value)
    }

    @Test
    fun `advance on an empty store returns null`() {
        val store = createQueueStore<String>()
        assertNull(store.advance())
    }

    @Test
    fun `clearQueue empties this store only`() {
        val store = createQueueStore<String>()
        store.setQueue(SimpleQueueState(order = listOf("a"), cursor = 0))
        store.clearQueue()
        assertNull(store.state.value)
    }

    @Test
    fun `three queue stores never share state`() {
        // The property docs/ROADMAP.md §12f requirement 1 actually cares about: switching
        // content types must not clear an unrelated queue. Each createQueueStore() call
        // returns a fresh instance backed by its own MutableStateFlow, so clearing one can
        // never reach another's state -- this pins that structurally, not by convention.
        val music = createQueueStore<String>()
        val podcast = createQueueStore<String>()
        val audiobook = createQueueStore<String>()

        music.setQueue(SimpleQueueState(order = listOf("music-a"), cursor = 0))
        podcast.setQueue(SimpleQueueState(order = listOf("podcast-a"), cursor = 0))
        audiobook.setQueue(SimpleQueueState(order = listOf("audiobook-a"), cursor = 0))

        music.clearQueue()

        assertNull(music.state.value)
        assertEquals(SimpleQueueState(order = listOf("podcast-a"), cursor = 0), podcast.state.value)
        assertEquals(SimpleQueueState(order = listOf("audiobook-a"), cursor = 0), audiobook.state.value)
    }
}
