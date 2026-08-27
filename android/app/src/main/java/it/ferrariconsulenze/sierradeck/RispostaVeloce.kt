package it.ferrariconsulenze.sierradeck

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Rispondere dalla notifica, senza aprire niente.
 *
 * Una notifica che dice «ti sta chiedendo una cosa» e poi ti obbliga ad aprire
 * l'app, trovare la chat e scrivere lì è una notifica che ti fa perdere il
 * momento: la risposta l'avevi già in testa mentre leggevi. Android sa fare di
 * meglio — un campo dentro la notifica stessa — e questa è la differenza fra
 * essere avvisato e poter rispondere.
 *
 * Vale per due cose diverse, che da qui si distinguono per quale extra arriva:
 * la **risposta a una domanda** di un autopilota, e il **messaggio a una chat**
 * che ha finito di scrivere e aspetta te.
 */
class RispostaVeloce : BroadcastReceiver() {

    override fun onReceive(contesto: Context, intent: Intent) {
        val testo = RemoteInput.getResultsFromIntent(intent)
            ?.getCharSequence(CHIAVE_TESTO)?.toString()?.trim()
        val idNotifica = intent.getIntExtra(EXTRA_NOTIFICA, 0)
        if (testo.isNullOrEmpty()) {
            // Invio a vuoto: si toglie e basta. Insistere con un errore su una
            // notifica sarebbe rumore per un gesto che non voleva dire niente.
            annulla(contesto, idNotifica)
            return
        }

        val domanda = intent.getStringExtra(EXTRA_DOMANDA)
        val chat = intent.getStringExtra(EXTRA_CHAT)

        // Subito un riscontro: da qui in poi la rete può metterci un secondo, e
        // una notifica che resta identica dopo aver premuto «Manda» sembra non
        // aver ricevuto niente.
        aggiorna(contesto, idNotifica, "Mando…")

        thread(start = true) {
            val collegamento = Collegamento(contesto)
            val riuscito = when {
                domanda != null -> manda(
                    collegamento,
                    "/api/rispondi",
                    """{"domanda":${virgolette(domanda)},"risposta":${virgolette(testo)}}"""
                )
                chat != null -> manda(
                    collegamento,
                    "/api/scrivi",
                    """{"chat":${virgolette(chat)},"testo":${virgolette(testo)}}"""
                )
                else -> false
            }
            if (riuscito) annulla(contesto, idNotifica)
            else aggiorna(contesto, idNotifica, "Non sono riuscito a mandarlo. Apri l'app e riprova.")
        }
    }

    /** Una POST autenticata, e basta: qui non serve un client intero. */
    private fun manda(collegamento: Collegamento, percorso: String, corpo: String): Boolean {
        if (!collegamento.pronto) return false
        return try {
            val connessione =
                (URL("${collegamento.indirizzo}$percorso").openConnection() as HttpURLConnection)
            connessione.requestMethod = "POST"
            connessione.doOutput = true
            connessione.setRequestProperty("x-sierradeck-chiave", collegamento.chiave)
            connessione.setRequestProperty("Content-Type", "application/json")
            connessione.connectTimeout = 8000
            connessione.readTimeout = 8000
            try {
                OutputStreamWriter(connessione.outputStream, Charsets.UTF_8).use { it.write(corpo) }
                connessione.responseCode == 200
            } finally {
                connessione.disconnect()
            }
        } catch (e: Exception) {
            Log.e("SierraDeck", "risposta dalla notifica non partita", e)
            false
        }
    }

    private fun aggiorna(contesto: Context, id: Int, testo: String) {
        if (id == 0) return
        try {
            val notifica = NotificationCompat.Builder(contesto, CANALE_RISPOSTE)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentText(testo)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setAutoCancel(true)
                .build()
            gestore(contesto).notify(id, notifica)
        } catch (e: Exception) {
            Log.e("SierraDeck", "notifica non aggiornata", e)
        }
    }

    private fun annulla(contesto: Context, id: Int) {
        if (id == 0) return
        try {
            gestore(contesto).cancel(id)
        } catch (e: Exception) {
            Log.e("SierraDeck", "notifica non tolta", e)
        }
    }

    private fun gestore(contesto: Context): NotificationManager =
        contesto.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    companion object {
        const val CHIAVE_TESTO = "testo"
        const val EXTRA_DOMANDA = "domanda"
        const val EXTRA_CHAT = "chat"
        const val EXTRA_NOTIFICA = "notifica"
        const val CANALE_RISPOSTE = "domande"

        /**
         * Il testo dentro le virgolette di JSON.
         *
         * Scritto a mano perché qui non c'è un serializzatore e non ne vale uno:
         * ma **va** scritto, perché una risposta contiene virgolette e a capo
         * più spesso di quanto sembri, e senza questo il messaggio arriverebbe
         * troncato — o non arriverebbe.
         */
        fun virgolette(testo: String): String {
            val b = StringBuilder("\"")
            for (c in testo) {
                when (c) {
                    '"' -> b.append("\\\"")
                    Char(92) -> b.append(Char(92)).append(Char(92))
                    '\n' -> b.append("\\n")
                    '\r' -> b.append("\\r")
                    '\t' -> b.append("\\t")
                    else -> if (c.code < 0x20) b.append("\\u%04x".format(c.code)) else b.append(c)
                }
            }
            return b.append('"').toString()
        }
    }
}
