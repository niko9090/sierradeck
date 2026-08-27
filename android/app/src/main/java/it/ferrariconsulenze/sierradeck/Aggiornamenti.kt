package it.ferrariconsulenze.sierradeck

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Gli aggiornamenti dell'app, finché non vive sul Play Store.
 *
 * Un'app installata a mano non riceve niente da sola: resta a quella versione
 * per sempre, e chi la usa non lo scopre — semplicemente si perde le cose
 * nuove e i difetti corretti. Finché il Play Store non fa questo lavoro, lo
 * facciamo qui.
 *
 * Si guarda l'ultima pubblicata su GitHub e, se è più recente, si propone di
 * scaricarla: l'installazione la fa Android con la sua schermata di sempre,
 * dove sei tu a premere «Installa». Non si scarica niente di nascosto e non si
 * installa niente senza che tu lo veda.
 */
object Aggiornamenti {

    /**
     * Le ultime pubblicazioni, non solo l'ultima.
     *
     * L'app e il programma sul computer escono quando hanno qualcosa da dare, e
     * quasi mai insieme: la prima pubblicazione del programma **senza** APK
     * allegato faceva sparire l'aggiornamento dal telefono — niente da
     * scaricare, e nessun errore che lo dicesse. Si scorrono le ultime venti e
     * si tiene la versione più alta.
     */
    private const val ULTIME =
        "https://api.github.com/repos/niko9090/sierradeck/releases?per_page=20"

    /**
     * La versione dell'app si legge **dal nome dell'APK**, non dal tag.
     *
     * Il tag è la versione del programma sul computer, e le due cose vivono
     * separate: un APK allegato a «SierraDeck 0.9.2» può essere ancora la
     * 1.0.0 dell'app, perché non è cambiato niente qui dentro. Prendere il tag
     * proporrebbe un aggiornamento a ogni pubblicazione, e dopo tre volte
     * nessuno ci crede più.
     */
    private val VERSIONE_NEL_NOME = Regex("""SierraDeck-([0-9]+\.[0-9]+\.[0-9]+)\.apk""")

    /**
     * Guarda se c'è una versione più nuova e, se c'è, chiama `quandoTrovata`
     * con il suo nome e l'indirizzo dell'APK.
     *
     * Su un thread suo: è una chiamata di rete, e farla mentre si disegna
     * l'interfaccia significherebbe un'app che si blocca all'avvio ogni volta
     * che la rete è lenta.
     */
    fun controlla(mia: String, quandoTrovata: (nome: String, apk: String) -> Unit) {
        thread(start = true) {
            try {
                val connessione = (URL(ULTIME).openConnection() as HttpURLConnection)
                connessione.setRequestProperty("Accept", "application/vnd.github+json")
                connessione.connectTimeout = 10_000
                connessione.readTimeout = 10_000
                val corpo = try {
                    if (connessione.responseCode != 200) return@thread
                    connessione.inputStream.bufferedReader().readText()
                } finally {
                    connessione.disconnect()
                }
                val migliore = piuRecenteFra(corpo) ?: return@thread
                if (!piuNuova(mia, migliore.first)) return@thread
                quandoTrovata(migliore.first, migliore.second)
            } catch (e: Exception) {
                // Senza rete, o con GitHub irraggiungibile, non si aggiorna e
                // basta: non è una ragione per disturbare chi sta lavorando.
                Log.i("SierraDeck", "aggiornamento non verificato: ${e.message}")
            }
        }
    }

    /**
     * L'APK con la versione più alta fra tutte le pubblicazioni lette.
     *
     * Separata dalla rete perché così si può provare: il difetto che conta —
     * scegliere la versione sbagliata — non ha niente a che vedere con GitHub.
     */
    fun piuRecenteFra(corpo: String): Pair<String, String>? {
        val elenco = try {
            JSONArray(corpo)
        } catch (e: Exception) {
            return null
        }
        var migliore: Pair<String, String>? = null
        for (r in 0 until elenco.length()) {
            val allegati = elenco.optJSONObject(r)?.optJSONArray("assets") ?: continue
            for (i in 0 until allegati.length()) {
                val allegato = allegati.optJSONObject(i) ?: continue
                val versione = VERSIONE_NEL_NOME.find(allegato.optString("name"))
                    ?.groupValues?.get(1) ?: continue
                val url = allegato.optString("browser_download_url")
                if (url.isEmpty()) continue
                val attuale = migliore
                if (attuale == null || piuNuova(attuale.first, versione)) {
                    migliore = versione to url
                }
            }
        }
        return migliore
    }

    /**
     * Confronto numero per numero.
     *
     * Non alfabetico: «0.9.0» viene dopo «0.10.0» in ordine alfabetico, ed è la
     * trappola che propone di tornare indietro.
     */
    fun piuNuova(mia: String, trovata: String): Boolean {
        val a = mia.split('.').mapNotNull { it.toIntOrNull() }
        val b = trovata.split('.').mapNotNull { it.toIntOrNull() }
        for (i in 0 until 3) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return y > x
        }
        return false
    }

    /** Apre il browser sull'APK: da lì Android fa la sua schermata di installazione. */
    fun scarica(contesto: Context, apk: String) {
        try {
            contesto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apk)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            Log.e("SierraDeck", "download non aperto", e)
        }
    }
}
