// The wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`) pins Gradle 8.11.1
// via gradle-wrapper.properties. That jar is a committed binary in a public repo, so CI checks it
// against Gradle's published checksums on every run with `gradle/actions/wrapper-validation`;
// see .github/workflows/android.yml.
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
include(":sonora")
