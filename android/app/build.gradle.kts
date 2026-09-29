plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// A release run (`.github/workflows/fdroid-repo.yml`, `release.yml`) passes
// `-PauralisVersionCode=<n> -PauralisVersionName=<version>`, derived from the pushed tag by
// `scripts/fdroid-versioncode.mjs` (versionCode is the tag's position in semver order, so it
// always increases). Every other build passes neither and gets these fallbacks.
val releaseVersionCode = (project.findProperty("auralisVersionCode") as String?)?.toIntOrNull() ?: 1
val releaseVersionName = (project.findProperty("auralisVersionName") as String?) ?: "0.1.0"

// The Auralis server the app signs in to when nothing else names one: `-PauralisServer=<url>`, or
// the local server a debug build reaches over `adb reverse`. An instrumented test names its own
// with the `auralisServer` instrumentation argument (ServerConfig.from).
val defaultServer = (project.findProperty("auralisServer") as String?) ?: "http://127.0.0.1:8787"

// What CanvasNavTest reads, copied as the instrumented test APK's `canvas/` assets: nav.json, and
// the headings pnpm gen writes from the canvas for web/e2e/canvas.spec.ts and it alike.
val canvasAssets = layout.buildDirectory.dir("canvas-assets")
val copyCanvasAssets = tasks.register<Copy>("copyCanvasAssets") {
    from(rootProject.file("../design/app")) { include("nav.json") }
    from(rootProject.file("../web/src/generated/nav")) { include("headings.json") }
    into(canvasAssets.map { it.dir("canvas") })
}
tasks.configureEach {
    if (name.startsWith("merge") && name.endsWith("AndroidTestAssets")) dependsOn(copyCanvasAssets)
}

android {
    namespace = "net.develivarr.auralis"
    compileSdk = 35

    defaultConfig {
        applicationId = "net.develivarr.auralis"
        minSdk = 26
        targetSdk = 35
        versionCode = releaseVersionCode
        versionName = releaseVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "AURALIS_SERVER", "\"$defaultServer\"")
    }

    signingConfigs {
        // The app signing key, not the F-Droid repo index key (`FDROID_REPO_*`); see
        // docs/FDROID_REPO.md. The release workflows decode a base64 secret to a file and export
        // these four env vars before invoking Gradle.
        //
        // Android ties app identity to applicationId + signing certificate, so this key is a
        // one-way door: a changed certificate makes the next install fail with
        // INSTALL_FAILED_UPDATE_INCOMPATIBLE. CI must never generate one.
        create("release") {
            val keystoreFile = System.getenv("ANDROID_KEYSTORE_FILE")
            if (keystoreFile != null && keystoreFile.isNotBlank() && file(keystoreFile).exists()) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            } else {
                // Every local build and every branch CI run takes this path. Loud on purpose:
                // a silent fallback is how an un-updatable APK would ship unnoticed.
                logger.warn(
                    "ANDROID_KEYSTORE_FILE is not set or not readable — the release build " +
                        "type will be DEBUG-SIGNED, not distributable. See docs/FDROID_REPO.md."
                )
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            // Debug signing when no release key was configured above: an APK AGP refuses to sign
            // is worse than one that is merely not distributable.
            signingConfig = if (signingConfigs.getByName("release").storeFile != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
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
        buildConfig = true
    }

    sourceSets {
        // CanvasNavTest reads each page's heading from the canvas, as web/e2e/canvas.spec.ts does.
        getByName("androidTest").assets.srcDir(canvasAssets.get().asFile)
    }

    testOptions {
        unitTests {
            // Robolectric cannot inflate any resource, and so cannot host a composable, without
            // the real resource table.
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    implementation(project(":sonora"))
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.material3)
    // BasicText, for a generated page's plain text children.
    implementation(libs.androidx.foundation)
    // The generated nav graph's typed routes (generated/nav/AuralisNavGraph.kt).
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    // The server's API, the bearer added per call (api/ApiClient.kt).
    implementation(libs.okhttp)
    // The player (play/Playback.kt): ExoPlayer and its OkHttp data source, and no Media3 module
    // that brings video (ui, effect, the decoder extensions), per 10-arch.md.
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.datasource.okhttp)

    testImplementation(libs.junit)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.ui.test.junit4)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(libs.androidx.test.core.ktx)
    // Instrumented tests, run on the emulator by the `emulator` job in android.yml.
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.espresso.intents)
    // Must be debugImplementation, not testImplementation: it contributes the manifest entry for
    // the activity createComposeRule() hosts in, and unit tests read the debug variant's merged
    // manifest. That is also why the Compose test lives in src/testDebug.
    debugImplementation(libs.androidx.ui.test.manifest)
}
