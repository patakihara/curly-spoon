// Plugins are declared here with `apply false` so each subproject applies the versions it needs
// without re-resolving them.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.paparazzi) apply false
}

// Tests run only on CI, so a failure prints its whole message and cause in the log. Each test
// class gets a JVM of its own: once an earlier class has drawn Sonora's controls in Robolectric, a
// later class's scrolling container never goes idle in a shared JVM (cause not yet pinned down).
subprojects {
    tasks.withType<Test>().configureEach {
        forkEvery = 1
        testLogging {
            events("failed")
            exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        }
    }
}
