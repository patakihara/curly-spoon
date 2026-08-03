package net.auralis.app

import android.app.Application

/**
 * Holds the composition root ([AppContainer]) for the lifetime of the process. Named exactly
 * `AuralisApplication` and placed in this package because `AndroidManifest.xml` declares
 * `android:name=".AuralisApplication"` — any mismatch fails the manifest merge in CI.
 */
class AuralisApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
