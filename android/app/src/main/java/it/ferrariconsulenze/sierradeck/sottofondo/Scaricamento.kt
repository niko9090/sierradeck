package it.ferrariconsulenze.sierradeck.sottofondo

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
     * Cosa dire quando il server non risponde 200: parole semplici e cosa fare,
     * non «il server ha risposto 404» (che non dice a chi lo legge dove guardare).
     */
    fun motivoRisposta(codice: Int): String = when {
        codice == 404 -> "il file dell’app non c’è più su GitHub. Riprova fra qualche minuto; se resta così, l’app nuova non è ancora pubblicata per intero"
        codice == 403 || codice == 429 -> "GitHub sta rifiutando troppe richieste da questa rete. Riprova fra qualche minuto, o passa dal WiFi"
        codice in 500..599 -> "GitHub ha un problema in questo momento. Riprova fra qualche minuto"
        else -> "GitHub ha risposto $codice. Riprova fra qualche minuto"
    }

    /** Un errore di rete in italiano semplice, con la cosa da fare. */
    fun motivoEccezione(e: Throwable): String = when (e) {
        is java.net.UnknownHostException -> "il telefono non raggiunge GitHub: controlla la connessione (WiFi o dati) e riprova"
        is java.net.SocketTimeoutException -> "la connessione è troppo lenta o si è interrotta: riprova con una rete migliore"
        is java.io.IOException -> "la connessione si è interrotta durante lo scaricamento: riprova" + (e.message?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: "")
        else -> "non sono riuscito a scaricarla" + (e.message?.takeIf { it.isNotBlank() }?.let { ": $it" } ?: "") + ". Riprova"
    }

    /** Detto quando Android non lascia ancora installare da SierraDeck. */
    const val SERVE_PERMESSO =
        "Android non ti ha ancora permesso di installare app da SierraDeck. Ho aperto le impostazioni: attiva «Consenti da questa fonte», torna qui e premi Riprova"

    /**
     * Android 8+ vuole il permesso «installa app sconosciute» per ogni app che
     * installa. Senza, l'installazione non parte e non c'è errore da nessuna parte.
     */
    fun puoInstallare(contesto: Context): Boolean =
        android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O || contesto.packageManager.canRequestPackageInstalls()

    /** Apre la schermata di Android dove si dà il permesso a SierraDeck. */
    private fun apriPermesso(contesto: Context): Boolean = try {
        contesto.startActivity(
            Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, android.net.Uri.parse("package:${contesto.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
    } catch (e: Exception) {
        Log.e("SierraDeck", "impostazioni non aperte", e)
        false
    }

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
        guasto: (motivo: String) -> Unit,
        /** L'installazione di Android è aperta: da qui in poi decide chi la guarda (e può annullare). */
        pronto: () -> Unit = {}
    ) {
        // L'unico file che questa app installa: da dove viene si controlla qui,
        // l'ultimo istante prima di andarlo a prendere. Fra la scelta
        // dell'allegato e questo momento passa del tempo e una risposta di rete.
        if (!Aggiornamenti.apkAmmesso(indirizzo)) {
            guasto("l'aggiornamento non viene da dove deve")
            return
        }
        // Il permesso prima di scaricare: inutile portare 4 MB se poi Android non installa.
        if (!puoInstallare(contesto)) {
            apriPermesso(contesto)
            guasto(SERVE_PERMESSO)
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
                        guasto(motivoRisposta(connessione.responseCode))
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
                    guasto("il file è arrivato a metà: la connessione è caduta. Riprova")
                    return@thread
                }
                if (destinazione.length() < 1_000_000) {
                    // Un APK di SierraDeck sta sopra il megabyte: quello che è
                    // arrivato non è un'app, ed è meglio dirlo che aprire una
                    // schermata di installazione su un file rotto.
                    guasto("il file scaricato è troppo piccolo per essere l’app (GitHub ha mandato una pagina al posto del file). Riprova fra qualche minuto")
                    return@thread
                }
                if (installa(contesto, destinazione)) pronto() else guasto("Android non ha aperto l’installazione. Riprova; se continua, scarica l’APK dalla pagina «App Android» di GitHub dal browser del telefono")
            } catch (e: Exception) {
                Log.e("SierraDeck", "aggiornamento non scaricato", e)
                guasto(motivoEccezione(e))
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
    private fun installa(contesto: Context, file: File): Boolean {
        return try {
            val dove = FileProvider.getUriForFile(contesto, "${contesto.packageName}.file", file)
            contesto.startActivity(
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(dove, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            true
        } catch (e: Exception) {
            Log.e("SierraDeck", "installazione non aperta", e)
            false
        }
    }
}
