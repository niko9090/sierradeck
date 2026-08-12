package it.glos.sierradeck

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * La guardia: guarda il computer anche quando l'app è chiusa.
 *
 * È la ragione per cui questa app esiste invece della sola pagina web. Un
 * browser, su una rete di casa, non può restare in ascolto quando lo chiudi:
 * le notifiche in background del web passano dai server di Google, che
 * vogliono HTTPS e Internet — e il tuo computer sta dietro il router.
 *
 * Un servizio in primo piano non ha quel vincolo. La notifica fissa che vedi
 * («SierraDeck sta guardando») non è un fastidio da sopportare: è il patto che
 * Android chiede in cambio del diritto di restare vivo, ed è giusto che si
 * veda — un programma che ti guarda le spalle deve dirlo.
 *
 * Interroga soltanto il tuo computer, sulla rete locale. Non parla con nessun
 * altro, e senza rete non fa niente e aspetta.
 */
class GuardiaService : Service() {

    private var attiva = true
    private var ultimaDomandaVista = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        creaCanali()
        // Da Android 14 il tipo va dichiarato **anche qui**, non solo nel
        // manifest: senza, il sistema chiude l'app con un'eccezione invece di
        // avviare il servizio. È il crash che si vedeva appena inserito
        // l'indirizzo, perché è lì che la guardia parte.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                ID_PRESENZA,
                notificaPresenza(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(ID_PRESENZA, notificaPresenza())
        }
        thread(start = true) { giro() }
    }

    override fun onDestroy() {
        attiva = false
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Se Android lo uccide per fare spazio, deve tornare: è tutto il senso
        // di una guardia.
        return START_STICKY
    }

    private fun giro() {
        val collegamento = Collegamento(this)
        while (attiva) {
            try {
                if (collegamento.pronto) guarda(collegamento)
            } catch (e: Exception) {
                // Il computer spento, il wifi cambiato, la rete che va e viene:
                // sono i casi normali di una guardia, non guasti da segnalare.
                // Si riprova al giro dopo.
            }
            Thread.sleep(ATTESA_MS)
        }
    }

    private fun guarda(collegamento: Collegamento) {
        val connessione = (URL("${collegamento.indirizzo}/api/stato").openConnection() as HttpURLConnection)
        connessione.setRequestProperty("x-sierradeck-chiave", collegamento.chiave)
        connessione.connectTimeout = 8000
        connessione.readTimeout = 8000
        try {
            if (connessione.responseCode != 200) return
            val stato = JSONObject(connessione.inputStream.bufferedReader().readText())
            val domande = stato.optJSONArray("domande") ?: return
            if (domande.length() == 0) {
                ultimaDomandaVista = ""
                return
            }
            val prima = domande.getJSONObject(0)
            val id = prima.optString("id")
            // La stessa domanda non si notifica due volte: una notifica che si
            // ripete ogni cinque secondi si impara a ignorare, e allora smette
            // di servire proprio quando serve.
            if (id == ultimaDomandaVista) return
            ultimaDomandaVista = id
            avvisa(prima.optString("testo", "Serve una tua risposta"))
        } finally {
            connessione.disconnect()
        }
    }

    private fun avvisa(testo: String) {
        val apri = PendingIntent.getActivity(
            this,
            0,
            Intent(this, ClientActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notifica = NotificationCompat.Builder(this, CANALE_DOMANDE)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("SierraDeck ti sta chiedendo una cosa")
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(apri)
            .setAutoCancel(true)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(ID_DOMANDA, notifica)
    }

    private fun notificaPresenza(): Notification =
        NotificationCompat.Builder(this, CANALE_PRESENZA)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("SierraDeck sta guardando")
            .setContentText("Ti avviso se un autopilota ha bisogno di te")
            // Bassa e silenziosa: è il patto con Android, non un annuncio.
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .build()

    private fun creaCanali() {
        val gestore = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        gestore.createNotificationChannel(
            NotificationChannel(CANALE_PRESENZA, "Presenza", NotificationManager.IMPORTANCE_MIN)
        )
        gestore.createNotificationChannel(
            NotificationChannel(CANALE_DOMANDE, "Domande", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Quando un autopilota si ferma ad aspettare una tua risposta"
            }
        )
    }

    companion object {
        /**
         * Ogni cinque secondi: abbastanza da accorgersi subito, abbastanza poco
         * da non tenere sveglia la radio del telefono per niente.
         */
        private const val ATTESA_MS = 5000L
        private const val CANALE_PRESENZA = "presenza"
        private const val CANALE_DOMANDE = "domande"
        private const val ID_PRESENZA = 1
        private const val ID_DOMANDA = 2

        fun avvia(contesto: Context) {
            // Un servizio che non parte non deve portarsi dietro l'app: senza
            // guardia si vede lo stesso tutto, solo senza avvisi.
            try {
                contesto.startForegroundService(Intent(contesto, GuardiaService::class.java))
            } catch (e: Exception) {
                Log.e("SierraDeck", "guardia non avviata", e)
            }
        }
    }
}
