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
        // La versione dell'app **non insegue** quella del computer: sono due
        // programmi che si aggiornano quando hanno qualcosa di nuovo da dare, e
        // legarli vorrebbe dire pubblicare un APK identico ogni volta che
        // cambia una riga di SierraDeck. Qui si alza quando cambia *questa* app.
        versionCode = 3
        versionName = "1.0.0"
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
    implementation("com.google.android.material:material:1.12.0")
    // La scansione del QR: una libreria sola, che apre la sua schermata e
    // restituisce il testo. Scriverla a mano vorrebbe dire mettere le mani
    // sulla fotocamera per una cosa che qui e' un dettaglio.
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
