plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// A release run (`.github/workflows/fdroid-repo.yml`) passes these as
// `-PauralisVersionCode=<n> -PauralisVersionName=<version>`, derived from the pushed release
// tag by `scripts/fdroid-versioncode.mjs` — see that file's header for why versionCode is a
// tag *count*, not the semver number itself, and `docs/FDROID_REPO.md` for the full release
// flow. Every other build (a plain local `./gradlew assembleDebug`, `android.yml`'s CI job)
// passes neither property, so it falls back to the same hardcoded values this file always
// had — nothing about a normal debug build changes.
val releaseVersionCode = (project.findProperty("auralisVersionCode") as String?)?.toIntOrNull() ?: 1
val releaseVersionName = (project.findProperty("auralisVersionName") as String?) ?: "0.1.0"

android {
    namespace = "net.auralis.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "net.auralis.app"
        minSdk = 26
        targetSdk = 35
        versionCode = releaseVersionCode
        versionName = releaseVersionName
    }

    buildTypes {
        debug {
            // Explicit so intent (a debuggable, unminified debug build) is not left to
            // AGP defaults, which have changed across versions.
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)
    implementation(libs.androidx.media3.datasource.okhttp)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.coil.compose)
    implementation(libs.kotlinx.coroutines.guava)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}
