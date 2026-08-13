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
                if (!collegamento.pronto) {
                    mostraErrore("Quel codice non contiene un indirizzo.")
                    return@addOnSuccessListener
                }
                if (!Indirizzi.accettabile(collegamento.indirizzo)) {
                    mostraErrore("Quell’indirizzo è su Internet, non sulla tua rete: non ci parlo in chiaro.")
                    return@addOnSuccessListener
                }
                mostraClient()
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
        // Prima di tutto: da qui in avanti un errore che chiuderebbe l'app
        // lascia una traccia da leggere al riavvio, invece di far tornare alla
        // schermata iniziale senza una parola.
        Guasti.prendiNota(applicationContext)
        collegamento = Collegamento(this)
        chiediPermessoNotifiche()

        // Un guasto **non deve** impedire di riprovare: se l'ultima volta è
        // andata male, si riparte dall'ingresso con scritto cosa è successo,
        // invece di rientrare nella stessa strada che ha già fallito.
        val guasto = Guasti.ultimo(applicationContext)
        if (guasto != null) {
            Guasti.dimentica(applicationContext)
            mostraIngresso()
            mostraErrore(guasto.lineSequence().first())
            return
        }

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
        // Già scritto quello di prima: chi torna qui di solito deve correggere
        // una cifra, non riscrivere tutto da capo su una tastiera del telefono.
        if (collegamento.indirizzo.isNotBlank()) campo.setText(collegamento.indirizzo)
        findViewById<Button>(R.id.collega).setOnClickListener {
            collegamento.indirizzo = campo.text.toString()
            when {
                !collegamento.pronto -> mostraErrore("Serve un indirizzo, come 192.168.1.7")
                !Indirizzi.accettabile(collegamento.indirizzo) ->
                    mostraErrore("Quell’indirizzo è su Internet, non sulla tua rete: non ci parlo in chiaro.")
                else -> mostraClient()
            }
        }
    }

    private fun mostraErrore(testo: String) {
        val riga = findViewById<TextView>(R.id.errore) ?: return
        riga.text = testo
        riga.visibility = View.VISIBLE
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun mostraClient() {
        try {
            apriPagina()
        } catch (e: Exception) {
            // Meglio l'ingresso con un messaggio che una chiusura muta: da qui
            // si può correggere l'indirizzo e riprovare.
            mostraIngresso()
            mostraErrore("Non riesco ad aprire: ${e.message}")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun apriPagina() {
        val web = WebView(this).apply {
            settings.javaScriptEnabled = true
            // La pagina tiene la chiave nel proprio archivio locale: senza
            // questo, ogni apertura ricomincerebbe dall'accoppiamento.
            settings.domStorageEnabled = true
            // Il ponte: da qui la pagina fa sapere all app la chiave che ha
            // ottenuto, e l app gliela restituisce quando si torna sullo stesso
            // indirizzo. Senza, la guardia mandava le sue richieste con una
            // chiave vuota e non avvisava mai nessuno.
            addJavascriptInterface(Ponte(collegamento), "SierraDeckApp")
            webViewClient = object : WebViewClient() {
                /**
                 * Se il computer non risponde si torna all'ingresso.
                 *
                 * L'indirizzo di casa cambia — il router riassegna, si passa
                 * dal wifi alla VPN — e senza questo l'app resta su una pagina
                 * bianca per sempre, senza un campo dove correggerlo e senza
                 * dire cosa è successo. Disinstallare era l'unica via.
                 */
                override fun onReceivedError(
                    vista: WebView?,
                    richiesta: android.webkit.WebResourceRequest?,
                    errore: android.webkit.WebResourceError?
                ) {
                    // Solo la pagina principale: un'icona che non si carica non
                    // è una ragione per buttare fuori chi sta leggendo.
                    if (richiesta?.isForMainFrame != true) return
                    mostraIngresso()
                    // Il motivo vero, non un'ipotesi. «Il computer non
                    // risponde» era la spiegazione buona per un caso su tre, e
                    // per gli altri due mandava a cercare dalla parte
                    // sbagliata — una porta chiusa e un divieto del sistema si
                    // riconoscono, e dirlo cambia cosa vai a controllare.
                    val motivo = errore?.description?.toString() ?: ""
                    mostraErrore(
                        when {
                            motivo.contains("CLEARTEXT", ignoreCase = true) ->
                                "Android ha bloccato la connessione in chiaro verso ${collegamento.indirizzo}."
                            motivo.isNotEmpty() -> "${collegamento.indirizzo} non risponde: $motivo"
                            else -> "${collegamento.indirizzo} non risponde. Controlla l’indirizzo o che SierraDeck sia acceso."
                        }
                    )
                }
            }
            setBackgroundColor(0xFF0B0C0E.toInt())
            loadUrl(collegamento.indirizzo)
        }
        vista = web
        setContentView(web)
        // La guardia è un di più: se non parte si vede tutto lo stesso, solo
        // senza avvisi. Non deve mai portarsi dietro l'app.
        try {
            GuardiaService.avvia(this)
        } catch (e: Exception) {
            // Già registrato nel log del servizio: qui basta non morire.
        }

        // Un'app installata a mano non riceve niente da sola: finché non vive
        // sul Play Store, il controllo lo facciamo qui. Si propone, non si
        // impone — a installare è Android, con la sua schermata di sempre.
        try {
            Aggiornamenti.controlla(BuildConfig.VERSION_NAME) { nome, apk ->
                runOnUiThread { proponiAggiornamento(nome, apk) }
            }
        } catch (e: Exception) {
            // Non sapere se c'è una versione nuova non è una ragione per non
            // usare quella che si ha.
        }
    }

    /**
     * L'avviso che c'è una versione nuova, e l'aggiornamento senza uscire.
     *
     * Prima si apriva il browser e si lasciava l'utente a cercare il file
     * scaricato: tre passaggi per una cosa che deve costarne uno. Qui il file
     * arriva dentro l'app, con la percentuale che avanza, e alla fine Android
     * apre la **sua** schermata di installazione — quella resta, ed è giusto:
     * a installare un'app deve essere il sistema, con te che confermi.
     */
    private fun proponiAggiornamento(nome: String, apk: String) {
        val avanzamento = TextView(this).apply {
            setPadding(56, 32, 56, 0)
            text = "Scarico… 0%"
            visibility = View.GONE
        }
        val finestra = AlertDialog.Builder(this)
            .setTitle("C’è SierraDeck $nome")
            .setMessage("La scarico e la installo da qui. A confermare l’installazione sarà Android.")
            .setView(avanzamento)
            .setPositiveButton("Aggiorna", null)
            .setNegativeButton("Più tardi", null)
            .create()
        finestra.show()
        finestra.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener { tasto ->
            // Non si chiude alla prima pressione: chi ha premuto deve vedere il
            // lavoro procedere, altrimenti non sa se sta succedendo qualcosa.
            tasto.isEnabled = false
            avanzamento.visibility = View.VISIBLE
            Scaricamento.apk(
                this,
                apk,
                avanzamento = { percento ->
                    runOnUiThread { avanzamento.text = "Scarico… $percento%" }
                },
                guasto = { motivo ->
                    runOnUiThread {
                        avanzamento.text = "Non ce l’ho fatta: $motivo"
                        tasto.isEnabled = true
                    }
                }
            )
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
