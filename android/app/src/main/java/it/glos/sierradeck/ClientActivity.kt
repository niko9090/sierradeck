package it.glos.sierradeck

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * L'app: la stessa pagina del Client, dentro una finestra sua.
 *
 * L'interfaccia del Client **non si riscrive in Kotlin**. È già scritta,
 * funziona, ed è servita dal computer: ogni miglioramento fatto lì arriva qui
 * senza ripubblicare l'app — che è una differenza enorme quando si scopre un
 * difetto la domenica sera.
 *
 * Quello che l'app aggiunge, e che un browser non può dare: restare in ascolto
 * quando la chiudi, e la fotocamera per inquadrare il codice invece di
 * digitarlo.
 */
class ClientActivity : AppCompatActivity() {

    private lateinit var collegamento: Collegamento
    private var vista: WebView? = null

    /**
     * Apre la fotocamera e legge il codice.
     *
     * La schermata è di Google Play Services: non è una nostra activity da
     * mantenere, e soprattutto **non chiede il permesso della fotocamera** —
     * la fotocamera la usa il sistema, non noi. Il codice inquadrato è un
     * indirizzo completo, con il codice di accoppiamento dopo il cancelletto:
     * si salva e la pagina si accoppia da sola.
     */
    private fun inquadra() {
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
                if (letto.isNullOrBlank()) {
                    mostraErrore("Il codice non conteneva niente.")
                    return@addOnSuccessListener
                }
                collegamento.indirizzo = letto
                if (collegamento.pronto) mostraClient()
                else mostraErrore("Quel codice non contiene un indirizzo.")
            }
            .addOnCanceledListener {
                // Chi annulla non ha sbagliato niente: nessun messaggio.
            }
            .addOnFailureListener { errore ->
                // Il modulo di scansione si scarica alla prima volta: se non
                // c'è ancora, si dice invece di lasciare un tasto che non fa
                // niente — e resta il campo per scrivere l'indirizzo a mano.
                mostraErrore("Non riesco ad aprire la fotocamera: ${errore.message}")
            }
    }

    override fun onCreate(salvato: Bundle?) {
        super.onCreate(salvato)
        collegamento = Collegamento(this)
        chiediPermessoNotifiche()
        if (collegamento.pronto) mostraClient() else mostraIngresso()
    }

    private fun mostraIngresso() {
        setContentView(R.layout.ingresso)
        findViewById<TextView>(R.id.versione).text = "versione ${BuildConfig.VERSION_NAME}"

        // Il modulo di scansione si scarica una volta sola: chiederlo adesso,
        // in silenzio, evita l'attesa nel momento in cui si preme «Inquadra».
        try {
            ModuleInstall.getClient(this).installModules(
                ModuleInstallRequest.newBuilder()
                    .addApi(GmsBarcodeScanning.getClient(this))
                    .build()
            )
        } catch (e: Exception) {
            // Senza servizi Google resta il campo per scrivere l'indirizzo.
        }

        findViewById<Button>(R.id.inquadra).setOnClickListener {
            inquadra()
        }

        val campo = findViewById<EditText>(R.id.indirizzo)
        findViewById<Button>(R.id.collega).setOnClickListener {
            collegamento.indirizzo = campo.text.toString()
            if (collegamento.pronto) mostraClient() else mostraErrore("Serve un indirizzo, come 192.168.1.7")
        }
    }

    private fun mostraErrore(testo: String) {
        val riga = findViewById<TextView>(R.id.errore) ?: return
        riga.text = testo
        riga.visibility = View.VISIBLE
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun mostraClient() {
        val web = WebView(this).apply {
            settings.javaScriptEnabled = true
            // La pagina tiene la chiave nel proprio archivio locale: senza
            // questo, ogni apertura ricomincerebbe dall'accoppiamento.
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            setBackgroundColor(0xFF0B0C0E.toInt())
            loadUrl(collegamento.indirizzo)
        }
        vista = web
        setContentView(web)
        GuardiaService.avvia(this)

        // Un'app installata a mano non riceve niente da sola: finché non vive
        // sul Play Store, il controllo lo facciamo qui. Si propone, non si
        // impone — a installare è Android, con la sua schermata di sempre.
        Aggiornamenti.controlla(BuildConfig.VERSION_NAME) { nome, apk ->
            runOnUiThread {
                AlertDialog.Builder(this)
                    .setTitle("C’è SierraDeck $nome")
                    .setMessage("Vuoi scaricarla adesso? L’installazione la conferma Android.")
                    .setPositiveButton("Scarica") { _, _ -> Aggiornamenti.scarica(this, apk) }
                    .setNegativeButton("Più tardi", null)
                    .show()
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // Indietro nella pagina, non fuori dall'app: uscire per sbaglio da una
        // schermata di risposta è il modo più veloce per perdere quello che si
        // stava scrivendo.
        val web = vista
        if (web != null && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    private fun chiediPermessoNotifiche() {
        // Da Android 13 le notifiche si chiedono: senza, la guardia guarderebbe
        // senza poter dire niente — cioè non servirebbe a nulla.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val concesso = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        if (concesso == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }
}
