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
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

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
     * La scansione del QR.
     *
     * Il codice inquadrato è un indirizzo completo — con il codice di
     * accoppiamento dopo il cancelletto — quindi non c'è niente da digitare né
     * da copiare: si salva l'indirizzo e la pagina si accoppia da sola.
     */
    private val scansione = registerForActivityResult(ScanContract()) { esito ->
        val letto = esito.contents
        if (letto.isNullOrBlank()) return@registerForActivityResult
        collegamento.indirizzo = letto
        if (collegamento.pronto) mostraClient() else mostraErrore("Quel codice non contiene un indirizzo.")
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

        findViewById<Button>(R.id.inquadra).setOnClickListener {
            // Il permesso della fotocamera lo chiede la schermata di scansione,
            // quando si preme: chiederlo all'avvio sarebbe chiederlo prima di
            // averne bisogno, ed è così che si ottiene un «no».
            scansione.launch(
                ScanOptions()
                    .setPrompt("Inquadra il codice che vedi sul computer")
                    .setBeepEnabled(false)
                    .setOrientationLocked(false)
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            )
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
