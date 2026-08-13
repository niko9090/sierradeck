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
        versionCode = 9
        versionName = "1.3.0"
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
    // La scansione del QR la fa Google Play Services, con la sua schermata.
    //
    // La libreria che c'era prima - zxing-android-embedded, ferma al 2021 -
    // registrava un receiver nel modo che Android 14 non permette piu': l'app
    // si chiudeva nell'istante in cui si premeva «Inquadra». Qui non c'e'
    // nessuna activity nostra da mantenere, **nessun permesso fotocamera da
    // chiedere** (la schermata e' del sistema), e il modulo si aggiorna da
    // solo con i servizi Google invece di invecchiare dentro il nostro APK.
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    // Per provare la regola degli indirizzi senza un telefono: e logica pura,
    // ed e gia costata due volte un app che non si collegava a niente.
    testImplementation("junit:junit:4.13.2")
    // Il vero org.json, per i test.
    //
    // Android sostituisce quella libreria con un finto che **solleva a ogni
    // chiamata**: i test della regola degli avvisi - che legge lo stato del
    // computer, cioe' del JSON - fallivano tutti con «not mocked», che sembra
    // un difetto del codice e non lo e'. Qui si usa l'implementazione vera, la
    // stessa che gira sul telefono.
    testImplementation("org.json:json:20240303")
}
