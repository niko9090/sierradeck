package it.ferrariconsulenze.sierradeck

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Il controllo continuo: ogni cinque secondi, finché lo tieni acceso.
 *
 * **Non parte da solo.** Prima sì, ed era la cosa sbagliata: un servizio in
 * primo piano resta vivo per sempre e Android in cambio pretende una riga
 * fissa nelle notifiche, che nessuno ha chiesto e che non si può togliere.
 * Il lavoro normale lo fa la [Sentinella], che si sveglia ogni tanto e non
 * lascia niente in vista.
 *
 * Questo serve per i momenti in cui stai **aspettando adesso**: lo accendi
 * dalla scheda Computer, i cinque secondi tornano, e la riga fissa compare —
 * ma è il prezzo di una cosa che hai chiesto tu, e si spegne quando vuoi.
 */
class GuardiaService : Service() {

    private var attiva = true

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        // **Tutto** dentro un try: un servizio vive nello stesso processo
        // dell'app, e un'eccezione qui chiude l'app - non il servizio.
        try {
            avviaDavvero()
        } catch (e: Exception) {
            Log.e("SierraDeck", "controllo continuo non avviato", e)
            stopSelf()
        }
    }

    private fun avviaDavvero() {
        Ronda.creaCanali(this)
        // Da Android 14 il tipo va dichiarato **anche qui**, non solo nel
        // manifest: senza, il sistema chiude l’app con un’eccezione.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                ID_PRESENZA,
                Ronda.notificaPresenza(this, "Guardo il computer ogni cinque secondi"),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(ID_PRESENZA, Ronda.notificaPresenza(this, "Guardo il computer ogni cinque secondi"))
        }
        thread(start = true) { giro() }
    }

    override fun onDestroy() {
        attiva = false
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    private fun giro() {
        while (attiva) {
            try {
                val stato = Ronda.giro(this)
                if (stato != null) aggiornaPresenza(stato)
            } catch (e: Exception) {
                // Rete che va e viene: e’ il caso normale di una guardia.
            }
            // L'attesa sta dentro il suo try, e non e’ pignoleria: fuori,
            // un’interruzione usciva da `giro()` e **il filo moriva in
            // silenzio**. Il servizio restava vivo, la notifica fissa
            // continuava a dire «Guardo il computer ogni cinque secondi», e
            // nessun avviso arrivava piu’. Interrotti si smette davvero.
            try {
                Thread.sleep(ATTESA_MS)
            } catch (e: InterruptedException) {
                attiva = false
                Thread.currentThread().interrupt()
            }
        }
    }

    /** La riga fissa dice cosa sta guardando: se deve stare lì, che serva. */
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
            (getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager)
                .notify(ID_PRESENZA, Ronda.notificaPresenza(this, riga))
        } catch (e: Exception) {
            // La presenza e’ un di piu’: se non si aggiorna, resta quella di prima.
        }
    }

    companion object {
        private const val ATTESA_MS = 5000L
        private const val ID_PRESENZA = 1

        /** Lo accende chi lo vuole, non l’app da sola. */
        fun avvia(contesto: Context) {
            try {
                contesto.startForegroundService(Intent(contesto, GuardiaService::class.java))
            } catch (e: Exception) {
                Log.e("SierraDeck", "controllo continuo non avviato", e)
            }
        }

        fun ferma(contesto: Context) {
            try {
                contesto.stopService(Intent(contesto, GuardiaService::class.java))
            } catch (e: Exception) {
                Log.e("SierraDeck", "controllo continuo non fermato", e)
            }
        }
    }
}