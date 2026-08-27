plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    /**
     * La firma dell'APK, senza chiedere niente a nessuno.
     *
     * La chiave e la sua password vivono **fuori dal repository**, nella
     * cartella dell'utente: `~/.sierradeck-chiave.jks` e il file accanto che
     * contiene solo la password. Nel codice non entra nessuna delle due — una
     * chiave privata versionata e' una chiave regalata a chiunque cloni il
     * progetto.
     *
     * Se i due file non ci sono, la compilazione non fallisce: esce un APK non
     * firmato, che e' quello che serve a chi vuole solo provare a compilare.
     */
    val chiave = File(System.getProperty("user.home"), ".sierradeck-chiave.jks")
    val passwordFile = File(System.getProperty("user.home"), ".sierradeck-chiave.pass")
    val passwordChiave = if (passwordFile.exists()) passwordFile.readText().trim() else null

    signingConfigs {
        if (chiave.exists() && passwordChiave != null) {
            create("propria") {
                storeFile = chiave
                storePassword = passwordChiave
                keyAlias = "sierradeck"
                keyPassword = passwordChiave
            }
        }
    }
    namespace = "it.ferrariconsulenze.sierradeck"
    compileSdk = 35

    defaultConfig {
        applicationId = "it.ferrariconsulenze.sierradeck"
        // Android 8: sotto non esistono i canali di notifica, e senza quelli
        // un servizio in primo piano non si può nemmeno dichiarare.
        minSdk = 26
        targetSdk = 35
        // La versione dell'app **non insegue** quella del computer: sono due
        // programmi che si aggiornano quando hanno qualcosa di nuovo da dare, e
        // legarli vorrebbe dire pubblicare un APK identico ogni volta che
        // cambia una riga di SierraDeck. Qui si alza quando cambia *questa* app.
        versionCode = 24
        versionName = "2.2.0"
    }

    // Serve `BuildConfig.VERSION_NAME`: l'app deve sapere quale versione è per
    // poter dire se ce n'è una più nuova. `compose` accende il toolkit nativo.
    buildFeatures {
        buildConfig = true
        compose = true
    }

    buildTypes {
        release {
            // Firmato all'uscita dal forno: nessun passaggio a mano, nessuna password
            // da ricordare fra una versione e l'altra.
            signingConfig = signingConfigs.findByName("propria")
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
    // `material` resta per il tema XML (Theme.Material3.Dark) su cui si appoggia
    // l'Activity; l'interfaccia però è tutta Compose. `appcompat` è stato tolto
    // con la vecchia ClientActivity (WebView).
    implementation("com.google.android.material:material:1.12.0")

    // ─── Jetpack Compose: l'interfaccia nativa, dichiarativa ───
    // Il BOM fissa in un colpo solo le versioni coerenti di tutti i moduli Compose.
    val compose = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(compose)
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // ─── Rete e dati ───
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

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
