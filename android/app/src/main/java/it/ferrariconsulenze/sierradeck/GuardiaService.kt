package it.ferrariconsulenze.sierradeck

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
import androidx.core.app.RemoteInput

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
    /**
     * Cosa si e' gia' annunciato.
     *
     * Una notifica che si ripete ogni cinque secondi si impara a ignorare, e
     * allora smette di servire proprio quando serve. La regola di cosa entra
     * qui dentro vive in [Avvisi], dove si puo' provare senza un telefono.
     */
    private val gia = mutableSetOf<String>()
    /** Al primo giro si tace su cio' che e' gia' successo: non e' una notizia. */
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
            aggiornaPresenza(stato)
            for (a in Avvisi.daAnnunciare(stato, gia, primoGiro)) {
                avvisa(a)
            }
            // Il primo giro e' passato comunque, anche quando non c'era niente
            // da guardare: altrimenti il silenzio iniziale non finirebbe mai.
            primoGiro = false
        } finally {
            connessione.disconnect()
        }
    }

    /**
     * Un avviso, con dentro il modo di rispondere quando ce n’è uno.
     *
     * Una domanda si risponde, una chat che aspetta le si scrive: in tutti e
     * due i casi il campo sta **nella notifica**, e non c’è da aprire l’app,
     * trovare la chat e ripensare la frase che avevi già in testa.
     */
    private fun avvisa(a: Avvisi.Avviso) {
        val apri = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val costruttore = NotificationCompat.Builder(this, CANALE_DOMANDE)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(a.titolo)
            .setContentText(a.testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(a.testo))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(apri)
            .setAutoCancel(true)

        val bersaglio = a.domanda ?: a.chat
        if (bersaglio != null) {
            val ingresso = RemoteInput.Builder(RispostaVeloce.CHIAVE_TESTO)
                .setLabel(if (a.domanda != null) "La tua risposta" else "Scrivi alla chat")
                .build()
            val intento = Intent(this, RispostaVeloce::class.java).apply {
                if (a.domanda != null) putExtra(RispostaVeloce.EXTRA_DOMANDA, a.domanda)
                else putExtra(RispostaVeloce.EXTRA_CHAT, a.chat)
                putExtra(RispostaVeloce.EXTRA_NOTIFICA, a.id)
            }
            // `MUTABLE` è obbligatorio: è Android a scriverci dentro il testo
            // che hai digitato. Con `IMMUTABLE` la risposta arriva vuota, e la
            // notifica sembra rotta senza dire perché.
            val azione = PendingIntent.getBroadcast(
                this,
                a.id,
                intento,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            costruttore.addAction(
                NotificationCompat.Action.Builder(
                    android.R.drawable.ic_menu_send,
                    if (a.domanda != null) "Rispondi" else "Scrivi",
                    azione
                ).addRemoteInput(ingresso).build()
            )
        }

        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(a.id, costruttore.build())
    }

    /**
     * La notifica fissa, riscritta con quello che sta succedendo.
     *
     * Android non permette di nasconderla: un servizio che resta vivo deve
     * dirlo, ed è il patto in cambio del quale il telefono può avvisarti ad
     * app chiusa. Ma «SierraDeck sta guardando» non diceva niente a nessuno.
     * Se deve stare lì, che almeno serva: quante chat, quante aspettano te.
     */
    private fun aggiornaPresenza(stato: JSONObject) {
        try {
            val chat = stato.optJSONArray("chat")
            val quante = chat?.length() ?: 0
            var aspettano = 0
            for (i in 0 until quante) {
                if (chat?.optJSONObject(i)?.optBoolean("aspetta", false) == true) aspettano += 1
            }
            val domande = stato.optJSONArray("domande")?.length() ?: 0
            val riga = when {
                domande > 0 -> "$domande in attesa di una tua risposta"
                aspettano > 0 -> "$aspettano su $quante chat aspettano te"
                quante > 0 -> "$quante chat, nessuna ti aspetta"
                else -> "Nessuna chat aperta"
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(ID_PRESENZA, notificaPresenza(riga))
        } catch (e: Exception) {
            // La presenza è un di più: se non si aggiorna, resta quella di prima.
        }
    }

    private fun notificaPresenza(riga: String = "Ti avviso quando serve qualcosa da te"): Notification =
        NotificationCompat.Builder(this, CANALE_PRESENZA)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("SierraDeck sta guardando il computer")
            .setContentText(riga)
            // Il più in basso possibile: niente suono, niente pallino
            // sull’icona, niente orario. Resta perché Android lo impone, non
            // perché abbia qualcosa da dirti.
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setShowWhen(false)
            .setOngoing(true)
            .setContentIntent(
                PendingIntent.getActivity(
                    this,
                    0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            .build()

    private fun creaCanali() {
        val gestore = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        gestore.createNotificationChannel(
NotificationChannel(CANALE_PRESENZA, "Presenza", NotificationManager.IMPORTANCE_MIN).apply {
                description = "La riga fissa che dice che l’app sta guardando il computer. Android obbliga a mostrarla; da qui la puoi silenziare del tutto."
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }
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
