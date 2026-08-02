// Root build file. Plugins are declared here with `apply false` so each subproject
// (currently just `:app`) applies the versions it needs without re-resolving them.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
