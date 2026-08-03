package net.auralis.app.features.onboarding

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.settings.ServerConfigRepository
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class OnboardingViewModelTest {
    private lateinit var keyValueStore: FakeKeyValueStore
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var viewModel: OnboardingViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        viewModel = OnboardingViewModel(serverConfigRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `submitting a blank URL sets an error and does not call onSaved`() =
        runTest {
            var saved = false

            viewModel.submit("   ") { saved = true }

            assertFalse(saved)
            assertTrue(viewModel.uiState.value is OnboardingUiState.Error)
        }

    @Test
    fun `submitting a real URL saves it and calls onSaved`() =
        runTest {
            var saved = false

            viewModel.submit("https://auralis.example.com") { saved = true }

            assertTrue(saved)
            assertEquals("https://auralis.example.com", serverConfigRepository.getBaseUrl())
        }
}
