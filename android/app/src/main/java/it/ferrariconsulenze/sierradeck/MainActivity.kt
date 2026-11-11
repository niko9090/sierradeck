package it.ferrariconsulenze.sierradeck

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import it.ferrariconsulenze.sierradeck.nucleo.Davanti
import it.ferrariconsulenze.sierradeck.rete.Percorsi
import it.ferrariconsulenze.sierradeck.rete.Scoperta
import it.ferrariconsulenze.sierradeck.schermate.comune.DialogoGuasto
import it.ferrariconsulenze.sierradeck.schermate.tema.TemaSierraDeck
import it.ferrariconsulenze.sierradeck.schermate.radice.Radice
import it.ferrariconsulenze.sierradeck.sottofondo.Installazione
import it.ferrariconsulenze.sierradeck.sottofondo.RicevitoreConsegne
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Apertura
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Condivisione
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Nota
import it.ferrariconsulenze.sierradeck.schermate.vecchie.Scheda
import it.ferrariconsulenze.sierradeck.sottofondo.Aggiornamenti
import it.ferrariconsulenze.sierradeck.sottofondo.ControlloApp
import it.ferrariconsulenze.sierradeck.sottofondo.Guasti
import it.ferrariconsulenze.sierradeck.sottofondo.Ascolto
import it.ferrariconsulenze.sierradeck.sottofondo.Destinazione
import it.ferrariconsulenze.sierradeck.sottofondo.ToccoAvviso

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
        // Contesto, rete e gestore dei guasti li prepara `SierraDeckApp`, per ogni processo.
        chiediPermessoNotifiche()
        preparaScanner()
        // L'app cerca da sola la versione nuova (0.43.0): ogni otto ore e
        // adesso, su GitHub, anche a computer spento e ad app chiusa.
        try { ControlloApp.programma(applicationContext) } catch (e: Exception) { android.util.Log.i("SierraDeck", "controllo dell'app non programmato: ${e.message}") }

        // L'ascolto del computer (app 2.100.0): parte da qui, con l'app davanti, e
        // resta acceso ad app chiusa. I file dal PC hanno il loro lavoro.
        try {
            Ascolto.programmaRipiego(applicationContext)
            RicevitoreConsegne.programma(applicationContext)
        } catch (e: Exception) { android.util.Log.i("SierraDeck", "sveglie non programmate: ${e.message}") }
        Installazione.riprendi(applicationContext)

        apriDoveChiede(intent)
        setContent {
            TemaSierraDeck {
                Radice(scansionaQr = ::scansionaQr, onEsci = { finish() })

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

            }
        }
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

    // I controlli delle schermate aspettano finché l app torna davanti (2.80.0, vedi Davanti).
    override fun onStart() {
        super.onStart()
        Davanti.imposta(true)
        // L'ascolto si (ri)accende con l'app davanti, dove Android lo lascia sempre partire:
        // anche subito dopo un accoppiamento, o se era stato fermato.
        if (!Ascolto.stato.value.attivo) Ascolto.avvia(applicationContext)
        // I computer vicini sulla stessa WiFi (k-50): solo mentre l'app è davanti.
        Scoperta.avvia(this)
    }

    override fun onStop() {
        Scoperta.ferma()
        Davanti.imposta(false)
        super.onStop()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        apriDoveChiede(intent)
    }

    /**
     * Una notifica toccata porta dove si risponde: una domanda, una scelta o
     * una chat che aspetta aprono la scheda Domande; un autopilota fermo,
     * pronto o finito apre Lavori (prima apriva la scheda Chat, cioè niente
     * di quello per cui avevi toccato).
     */
    private fun apriDoveChiede(intent: android.content.Intent?) {
        if (intent == null) return
        // Condividi → SierraDeck (app 2.50.0): uno o più file da un'altra app.
        if (intent.action == android.content.Intent.ACTION_SEND || intent.action == android.content.Intent.ACTION_SEND_MULTIPLE) {
            val file = Condivisione.uriDa(intent)
            if (file.isNotEmpty()) Apertura.condivisi = file
            else Nota.mostra("SierraDeck riceve file, non testo: per mandare del testo a una chat scrivilo nella chat.")
            return
        }
        // La notifica dell'aggiornamento: si apre il dialogo di sempre.
        val versione = intent.getStringExtra(ControlloApp.EXTRA_VERSIONE)
        val apk = intent.getStringExtra(ControlloApp.EXTRA_APK)
        if (versione != null && apk != null && Aggiornamenti.apkAmmesso(apk)) { Apertura.aggiornamento = versione to apk; return }
        // Un avviso toccato (app 2.100.0): il posto preciso a chi tiene la navigazione
        // (`ToccoAvviso.richiesta`), e intanto la voce giusta con `Apertura`.
        val dove = ToccoAvviso.daIntento(intent) ?: return
        ToccoAvviso.chiedi(ToccoAvviso.richiestaDi(dove))
        Apertura.schedaRichiesta = when (dove) {
            is Destinazione.Domanda, is Destinazione.Chat -> Scheda.DOMANDE
            is Destinazione.Autopilota, Destinazione.Lavori -> Scheda.AUTOPILOTI
            Destinazione.Aggiornamenti -> Scheda.IMPOSTAZIONI
            Destinazione.File -> Scheda.FILE
        }
    }

    private fun chiediPermessoNotifiche() {
        // Da Android 13 le notifiche si chiedono: senza, la guardia guarderebbe
        // senza poter dire niente. Da Android 16 si chiede insieme il permesso
        // per la rete locale (k-50): senza, la WiFi di casa non si vede.
        val mancanti = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) mancanti.add(Manifest.permission.POST_NOTIFICATIONS)
        if (Percorsi.serveLaReteLocale(Build.VERSION.SDK_INT) &&
            ContextCompat.checkSelfPermission(this, Percorsi.PERMESSO_RETE_LOCALE) != PackageManager.PERMISSION_GRANTED
        ) mancanti.add(Percorsi.PERMESSO_RETE_LOCALE)
        if (mancanti.isEmpty()) return
        ActivityCompat.requestPermissions(this, mancanti.toTypedArray(), 1)
    }
}
