package it.ferrariconsulenze.sierradeck

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * L'app nativa: nessuna WebView, solo Compose.
 *
 * L'Activity fa il minimo che deve fare un'Activity — tiene la finestra, chiede
 * il permesso delle notifiche, apre la fotocamera per il QR — e delega tutta
 * l'interfaccia a `App()`, che è Compose puro e testabile a parte. Il guscio già
 * buono (pairing, guardia, sicurezza degli indirizzi) resta nelle sue classi:
 * qui lo si mette insieme, non lo si riscrive.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(salvato: Bundle?) {
        super.onCreate(salvato)
        // Da qui in avanti un errore che chiuderebbe l'app lascia una traccia da
        // leggere al riavvio, invece di sparire senza una parola.
        Guasti.prendiNota(applicationContext)
        chiediPermessoNotifiche()
        preparaScanner()

        val deposito = Collegamento(this)
        setContent {
            TemaSierraDeck {
                // L'aggiornamento dell'app: un'app installata a mano non riceve
                // niente da sola, quindi si guarda l'ultima su GitHub e, se è più
                // nuova, la si propone. Il controllo è su un thread suo; qui si
                // porta l'esito sul thread dell'interfaccia.
                var aggiornamento by remember { mutableStateOf<Pair<String, String>?>(null) }
                LaunchedEffect(Unit) {
                    try {
                        Aggiornamenti.controlla(BuildConfig.VERSION_NAME) { nome, apk ->
                            runOnUiThread { aggiornamento = nome to apk }
                        }
                    } catch (_: Exception) {
                    }
                }

                App(deposito = deposito, scansionaQr = ::scansionaQr)

                // La nota dell'ultima caduta. La si scriveva gia' e non la
                // leggeva nessuno: l'app spariva, e al riavvio non restava una
                // parola. Adesso si vede, si copia, e si archivia.
                var guasto by remember { mutableStateOf(Guasti.ultimo(applicationContext)) }
                guasto?.let { nota ->
                    DialogoGuasto(nota = nota) {
                        Guasti.dimentica(applicationContext)
                        guasto = null
                    }
                }

                aggiornamento?.let { (nome, apk) ->
                    DialogoAggiornamentoApp(
                        nome = nome,
                        apk = apk,
                        avviaScarico = ::scaricaApk,
                        onChiudi = { aggiornamento = null }
                    )
                }
            }
        }
    }

    /** Scarica l'APK nuovo e apre l'installazione di Android, riportando i
     *  progressi sul thread dell'interfaccia. */
    private fun scaricaApk(apk: String, onProgresso: (Int) -> Unit, onGuasto: (String) -> Unit) {
        Scaricamento.apk(
            this, apk,
            avanzamento = { p -> runOnUiThread { onProgresso(p) } },
            guasto = { m -> runOnUiThread { onGuasto(m) } }
        )
    }

    /**
     * Apre la fotocamera (schermata di Google Play Services, nessun permesso
     * fotocamera nostro) e restituisce il testo del QR: un indirizzo con
     * `#codice=NNNNNN` dopo il cancelletto.
     */
    private fun scansionaQr(alLetto: (String) -> Unit, alGuasto: (String) -> Unit) {
        val scanner = GmsBarcodeScanning.getClient(
            this,
            GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build()
        )
        scanner.startScan()
            .addOnSuccessListener { codice ->
                val letto = codice.rawValue
                if (letto.isNullOrBlank()) alGuasto("Il codice non conteneva niente.")
                else alLetto(letto)
            }
            .addOnCanceledListener { /* chi annulla non ha sbagliato niente */ }
            .addOnFailureListener { e ->
                alGuasto("Non riesco ad aprire la fotocamera: ${e.message}")
            }
    }

    /** Scarica in anticipo e in silenzio il modulo dello scanner, così al primo
     *  «Inquadra» non c'è da aspettare. */
    private fun preparaScanner() {
        try {
            ModuleInstall.getClient(this).installModules(
                ModuleInstallRequest.newBuilder()
                    .addApi(GmsBarcodeScanning.getClient(this))
                    .build()
            )
        } catch (e: Exception) {
            // Senza servizi Google resta la digitazione manuale del codice.
        }
    }

    private fun chiediPermessoNotifiche() {
        // Da Android 13 le notifiche si chiedono: senza, la guardia guarderebbe
        // senza poter dire niente.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val concesso = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        if (concesso == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }
}
