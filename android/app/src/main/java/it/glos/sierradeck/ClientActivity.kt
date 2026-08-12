package it.glos.sierradeck

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * L'app: la stessa pagina del Client, dentro una finestra sua.
 *
 * L'interfaccia **non si riscrive in Kotlin**. È già scritta, funziona, ed è
 * servita dal computer: ogni miglioramento fatto lì arriva qui senza
 * ripubblicare l'app sul Play Store — che è una differenza enorme quando si
 * scopre un difetto la domenica sera.
 *
 * Quello che l'app aggiunge, e che un browser non può dare, è restare in
 * ascolto quando la chiudi: quello lo fa la guardia, che parte da qui.
 */
class ClientActivity : AppCompatActivity() {

    private lateinit var collegamento: Collegamento
    private lateinit var vista: WebView

    override fun onCreate(salvato: Bundle?) {
        super.onCreate(salvato)
        collegamento = Collegamento(this)
        chiediPermessoNotifiche()

        if (!collegamento.pronto) {
            mostraIngresso()
            return
        }
        mostraClient()
    }

    /**
     * Dove si digita l'indirizzo del computer, la prima volta.
     *
     * Una schermata sola con un campo: l'accoppiamento vero — le sei cifre —
     * si fa poi nella pagina, che lo sa già fare. Duplicarlo qui vorrebbe dire
     * mantenerlo in due posti.
     */
    private fun mostraIngresso() {
        val colonna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
            setBackgroundColor(FONDO)
        }

        colonna.addView(TextView(this).apply {
            text = "SierraDeck"
            textSize = 24f
            setTextColor(TESTO)
        })
        colonna.addView(TextView(this).apply {
            text = "L’indirizzo del computer, come lo leggi in Impostazioni → Client."
            setTextColor(TESTO_QUIETO)
            setPadding(0, 16, 0, 32)
        })

        val campo = EditText(this).apply {
            hint = "192.168.1.7"
            setTextColor(TESTO)
            setHintTextColor(TESTO_QUIETO)
        }
        colonna.addView(campo)

        colonna.addView(Button(this).apply {
            text = "Collega"
            setOnClickListener {
                collegamento.indirizzo = campo.text.toString()
                if (collegamento.pronto) {
                    recreate()
                }
            }
        })

        setContentView(colonna)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun mostraClient() {
        vista = WebView(this).apply {
            settings.javaScriptEnabled = true
            // La pagina tiene la chiave nel proprio archivio locale: senza
            // questo, ogni apertura ricomincerebbe dall'accoppiamento.
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            setBackgroundColor(FONDO)
            loadUrl(collegamento.indirizzo)
        }
        setContentView(vista)
        // La guardia parte quando c'è un computer da guardare, non prima.
        GuardiaService.avvia(this)
    }

    override fun onBackPressed() {
        // Indietro nella pagina, non fuori dall'app: uscire per sbaglio da una
        // schermata di risposta è il modo più veloce per perdere quello che si
        // stava scrivendo.
        if (this::vista.isInitialized && vista.canGoBack()) vista.goBack() else super.onBackPressed()
    }

    private fun chiediPermessoNotifiche() {
        // Da Android 13 le notifiche si chiedono: senza, la guardia guarderebbe
        // senza poter dire niente — cioè non servirebbe a nulla.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val concesso = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        if (concesso == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }

    private companion object {
        const val FONDO = 0xFF0B0C0E.toInt()
        const val TESTO = 0xFFDFE3E7.toInt()
        const val TESTO_QUIETO = 0xFF9AA1A9.toInt()
    }
}
