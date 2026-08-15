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
    namespace = "net.develivarr.auralis"
    compileSdk = 35

    defaultConfig {
        applicationId = "net.develivarr.auralis"
        minSdk = 26
        targetSdk = 35
        versionCode = releaseVersionCode
        versionName = releaseVersionName
    }

    signingConfigs {
        // The **app** signing key — not the F-Droid repo index key (`FDROID_REPO_*`, wired in
        // `.github/workflows/fdroid-repo.yml`). Different key, different lifetime; see
        // docs/FDROID_REPO.md. `.github/workflows/release.yml` decodes a base64 secret to a
        // file and exports these four env var names before invoking Gradle; nothing here does
        // its own base64 decoding.
        //
        // Android ties app identity to applicationId + signing certificate together, so this
        // key is a one-way door: a changed certificate makes the next install fail with
        // INSTALL_FAILED_UPDATE_INCOMPATIBLE, forcing an uninstall that loses all app state.
        // CI must never generate one — see docs/FDROID_REPO.md for why.
        create("release") {
            val keystoreFile = System.getenv("ANDROID_KEYSTORE_FILE")
            if (keystoreFile != null && keystoreFile.isNotBlank() && file(keystoreFile).exists()) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            } else {
                // No release key configured — every local build and every PR/branch CI run
                // (android.yml carries no secrets) takes this path. Loud on purpose: the
                // buildTypes.release block below falls back to debug signing when storeFile is
                // unset, and a silent fallback here is exactly how an un-updatable APK would
                // ship without anyone noticing until users can't install the next update.
                logger.warn(
                    "ANDROID_KEYSTORE_FILE is not set or not readable — the release build " +
                        "type will be DEBUG-SIGNED, not distributable. See docs/FDROID_REPO.md."
                )
            }
        }
    }

    buildTypes {
        debug {
            // Explicit so intent (a debuggable, unminified debug build) is not left to
            // AGP defaults, which have changed across versions.
            isMinifyEnabled = false
        }
        release {
            // Fall back to the debug signingConfig (never left unset) when no release key was
            // configured above — an APK AGP refuses to sign at all is worse than one that is
            // merely not distributable, and the warning above already made the fallback loud.
            signingConfig = if (signingConfigs.getByName("release").storeFile != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            // Off by default, matching debug's stated reasoning: this module's kotlinx models
            // rely on reflection-adjacent serialization, and enabling R8 without keep rules
            // tuned and tested against a built APK would silently strip fields at runtime.
            // Revisit only alongside a real proguard-rules.pro, not as a default flip.
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
