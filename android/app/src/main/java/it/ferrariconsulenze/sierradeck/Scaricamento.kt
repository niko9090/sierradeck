package it.ferrariconsulenze.sierradeck

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * L'aggiornamento, scaricato e installato **dentro l'app**.
 *
 * Prima si apriva il browser sull'indirizzo dell'APK: da lì bisognava trovare
 * il file scaricato, aprirlo, e capire da soli che quella era l'app nuova. Tre
 * passaggi in cui si può perdere qualcuno, per una cosa che dovrebbe costare un
 * tocco.
 *
 * Adesso il file arriva dentro la cartella dell'app e Android apre la sua
 * schermata di installazione: quella sì resta: **è Android a installare, e sei
 * tu a confermare.** Non si installa niente di nascosto — e non si potrebbe
 * nemmeno volendo.
 */
object Scaricamento {

    /**
     * Se il file e' arrivato tutto.
     *
     * Un flusso che si chiude a meta' non solleva niente: si ottiene un file
     * piu' corto e nessun errore. Presentato all'installazione, Android lo
     * rifiuta parlando di pacchetto corrotto — un messaggio che manda a cercare
     * il guasto dall'altra parte. Quando il server ha detto quanto pesa, si
     * confronta; quando non l'ha detto (`contentLength` vale -1, e capita con
     * la codifica a pezzi) non c'e' niente da confrontare e si passa.
     */
    fun completo(previsto: Long, presi: Long): Boolean = previsto <= 0L || presi == previsto

    /**
     * Scarica l'APK e apre l'installazione.
     *
     * `avanzamento` viene chiamato con la percentuale mentre scarica, e
     * `guasto` se qualcosa va storto: la schermata deve poter dire *cosa*
     * invece di restare su una barra ferma.
     */
    fun apk(
        contesto: Context,
        indirizzo: String,
        avanzamento: (percento: Int) -> Unit,
        guasto: (motivo: String) -> Unit
    ) {
        // L'unico file che questa app installa: da dove viene si controlla qui,
        // l'ultimo istante prima di andarlo a prendere. Fra la scelta
        // dell'allegato e questo momento passa del tempo e una risposta di rete.
        if (!Aggiornamenti.apkAmmesso(indirizzo)) {
            guasto("l'aggiornamento non viene da dove deve")
            return
        }
        thread(start = true) {
            var totalePrevisto = -1L
            var scaricati = 0L
            try {
                val destinazione = File(contesto.cacheDir, "sierradeck-nuova.apk")
                if (destinazione.exists()) destinazione.delete()

                val connessione = (URL(indirizzo).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = true
                    connectTimeout = 15_000
                    readTimeout = 60_000
                }
                try {
                    if (connessione.responseCode != 200) {
                        guasto("il server ha risposto ${connessione.responseCode}")
                        return@thread
                    }
                    totalePrevisto = connessione.contentLength.toLong()
                    val totale = totalePrevisto
                    var presi = 0L
                    connessione.inputStream.use { dentro ->
                        destinazione.outputStream().use { fuori ->
                            val pezzo = ByteArray(64 * 1024)
                            while (true) {
                                val letti = dentro.read(pezzo)
                                if (letti <= 0) break
                                fuori.write(pezzo, 0, letti)
                                presi += letti
                                if (totale > 0) avanzamento(((presi * 100) / totale).toInt())
                            }
                        }
                    }
                    scaricati = presi
                } finally {
                    connessione.disconnect()
                }

                if (!completo(totalePrevisto, scaricati)) {
                    guasto("il file e' arrivato a meta': riprova")
                    return@thread
                }
                if (destinazione.length() < 1_000_000) {
                    // Un APK di SierraDeck sta sopra il megabyte: quello che è
                    // arrivato non è un'app, ed è meglio dirlo che aprire una
                    // schermata di installazione su un file rotto.
                    guasto("il file scaricato è troppo piccolo per essere l’app")
                    return@thread
                }
                installa(contesto, destinazione)
            } catch (e: Exception) {
                Log.e("SierraDeck", "aggiornamento non scaricato", e)
                guasto(e.message ?: "non sono riuscito a scaricarlo")
            }
        }
    }

    /**
     * Apre la schermata di installazione di Android sul file scaricato.
     *
     * Il file viaggia come `content://` e non come percorso: dalla 24 in poi
     * Android rifiuta un `file://` che attraversa le app, e il rifiuto arriva
     * come un'eccezione a installazione già annunciata — cioè nel momento
     * peggiore.
     */
    private fun installa(contesto: Context, file: File) {
        try {
            val dove = FileProvider.getUriForFile(contesto, "${contesto.packageName}.file", file)
            contesto.startActivity(
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(dove, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        } catch (e: Exception) {
            Log.e("SierraDeck", "installazione non aperta", e)
        }
    }
}
