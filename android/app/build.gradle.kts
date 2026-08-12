plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "it.glos.sierradeck"
    compileSdk = 35

    defaultConfig {
        applicationId = "it.glos.sierradeck"
        // Android 8: sotto non esistono i canali di notifica, e senza quelli
        // un servizio in primo piano non si può nemmeno dichiarare.
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.7.6"
    }

    // Serve `BuildConfig.VERSION_NAME`: l'app deve sapere quale versione è per
    // poter dire se ce n'è una più nuova.
    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
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
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
