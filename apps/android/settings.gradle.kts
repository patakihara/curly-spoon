// NOTE on the wrapper: this project ships the standard `gradlew` / `gradlew.bat` /
// `gradle/wrapper/gradle-wrapper.jar`, pinning Gradle 8.11.1 via gradle-wrapper.properties.
// That jar is a committed binary in a public repo, so its provenance is checked twice: its
// SHA-256 matches Gradle's published wrapper checksum for 8.11.1, and CI re-verifies it on
// every run with `gradle/actions/wrapper-validation` — see .github/workflows/android.yml.
//
// No JDK, Android SDK or Gradle is installed on the machine this was authored on, so CI is
// still the first place `apps/android` actually compiles. That is a "not installed yet"
// state, not a permanent constraint: `dl.google.com`, `maven.google.com` and
// `services.gradle.org` are all reachable from that machine (measured 2026-08-02 — an
// earlier claim that they were blocked was inherited from the cloud container phases 1–4
// were built in, and was never true here). Install a JDK and `./gradlew assembleDebug`
// works locally, demoting the CI run to a second opinion.

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "auralis"
include(":app")
