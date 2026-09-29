// Sonora for Compose: the generated tokens under `generated/theme` and props under `generated/ui`,
// and the fonts, icons and `ui/sonora` components written against them. A library of its own so
// that Paparazzi, which cannot share a module with Robolectric, can screenshot it apart from `:app`.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    // Screenshots of the gallery in plain `test`, into build/reports/paparazzi.
    alias(libs.plugins.paparazzi)
}

android {
    namespace = "net.develivarr.auralis.sonora"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
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
    // `api`: the tokens' own types (Color, Dp, TextUnit, Easing) are part of what `:app` reads.
    api(platform(libs.androidx.compose.bom))
    api(libs.androidx.ui)
    api(libs.androidx.animation.core)
    // BasicText, for SonoraIcon.
    implementation(libs.androidx.foundation)

    testImplementation(libs.junit)
}
