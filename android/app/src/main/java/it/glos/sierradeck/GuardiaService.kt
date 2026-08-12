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
    /** Gli autopiloti gia annunciati come finiti: la stessa fine si dice una volta. */
    private val finitiVisti = mutableSetOf<String>()
    /** Al primo giro si tace: quelli finiti ieri non sono una notizia. */
    private var primoGiro = true

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        // **Tutto** dentro un try: un servizio vive nello stesso processo
        // dell'app, e un'eccezione qui chiude l'app - non il servizio. E'
        // esattamente cosi' che si tornava alla schermata iniziale appena
        // inserito l'indirizzo, senza una parola da nessuna parte.
        try {
            avviaDavvero()
        } catch (e: Exception) {
            Log.e("SierraDeck", "guardia non avviata", e)
            // Senza guardia si vede tutto lo stesso, solo senza avvisi: e'
            // infinitamente meglio di un'app che non si apre.
            stopSelf()
        }
    }

    private fun avviaDavvero() {
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
            guardaFiniti(stato)
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

    /**
     * Quando un lavoro finisce.
     *
     * È l'altra metà del motivo per cui questa app esiste: si lancia un
     * autopilota e si esce di casa, e sapere che ha finito — senza controllare
     * il telefono ogni dieci minuti — è tutto il valore della cosa.
     *
     * Ogni autopilota si annuncia una volta sola: l'insieme di quelli già
     * annunciati impedisce che la stessa fine torni ogni cinque secondi finché
     * non si spegne il computer.
     */
    private fun guardaFiniti(stato: JSONObject) {
        try {
            val autopiloti = stato.optJSONArray("autopiloti") ?: return
            for (i in 0 until autopiloti.length()) {
                val a = autopiloti.getJSONObject(i)
                if (a.optString("stato") != "finito") continue
                val id = a.optString("id")
                if (id.isEmpty() || !finitiVisti.add(id)) continue
                // Al primo giro dopo l'avvio si tace: quelli già finiti ieri
                // non sono una notizia, e riceverne cinque all'apertura
                // dell'app insegna a ignorarle tutte.
                if (primoGiro) continue
                avvisa(
                    "${a.optString("nome", "Un autopilota")} ha finito",
                    "SierraDeck ha finito un lavoro",
                    // Un identificatore stabile e non la posizione nell'elenco:
                    // due lavori che finiscono a distanza di minuti cambiano
                    // posizione, e il secondo cancellerebbe il primo.
                    ID_FINITO + (id.hashCode() and 0xFFF)
                )
            }
        } finally {
            // Il primo giro è passato comunque, anche quando non c'era niente
            // da guardare: altrimenti il silenzio iniziale non finirebbe mai e
            // nessuna fine verrebbe mai annunciata.
            primoGiro = false
        }
    }

    private fun avvisa(
        testo: String,
        titolo: String = "SierraDeck ti sta chiedendo una cosa",
        id: Int = ID_DOMANDA
    ) {
        val apri = PendingIntent.getActivity(
            this,
            0,
            Intent(this, ClientActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notifica = NotificationCompat.Builder(this, CANALE_DOMANDE)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(titolo)
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(apri)
            .setAutoCancel(true)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(id, notifica)
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
        /** Le notifiche di fine lavoro partono da qui, una per autopilota. */
        private const val ID_FINITO = 100

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
