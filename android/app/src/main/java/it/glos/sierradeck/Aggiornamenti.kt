package it.glos.sierradeck

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import org.json.JSONObject
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

    private const val ULTIMA =
        "https://api.github.com/repos/niko9090/sierradeck/releases/latest"

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
                val connessione = (URL(ULTIMA).openConnection() as HttpURLConnection)
                connessione.setRequestProperty("Accept", "application/vnd.github+json")
                connessione.connectTimeout = 10_000
                connessione.readTimeout = 10_000
                try {
                    if (connessione.responseCode != 200) return@thread
                    val release = JSONObject(connessione.inputStream.bufferedReader().readText())
                    val allegati = release.optJSONArray("assets") ?: return@thread
                    for (i in 0 until allegati.length()) {
                        val allegato = allegati.getJSONObject(i)
                        val nomeFile = allegato.optString("name")
                        val trovata = VERSIONE_NEL_NOME.find(nomeFile)?.groupValues?.get(1) ?: continue
                        if (!piuNuova(mia, trovata)) return@thread
                        quandoTrovata(trovata, allegato.optString("browser_download_url"))
                        return@thread
                    }
                } finally {
                    connessione.disconnect()
                }
            } catch (e: Exception) {
                // Senza rete, o con GitHub irraggiungibile, non si aggiorna e
                // basta: non è una ragione per disturbare chi sta lavorando.
                Log.i("SierraDeck", "aggiornamento non verificato: ${e.message}")
            }
        }
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
