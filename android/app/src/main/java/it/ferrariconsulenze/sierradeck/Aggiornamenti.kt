package it.ferrariconsulenze.sierradeck

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Gli aggiornamenti dell'app, finché non vive sul Play Store.
 *
 * Un'app installata a mano non riceve niente da sola: resta a quella versione
 * per sempre, e chi la usa non lo scopre — semplicemente si perde le cose
 * nuove e i difetti corretti. Finché il Play Store non fa questo lavoro, lo
 * facciamo qui.
 *
 * Si guarda l'ultima pubblicata e, se è più recente, si propone di
 * scaricarla: l'installazione la fa Android con la sua schermata di sempre,
 * dove sei tu a premere «Installa». Non si scarica niente di nascosto e non si
 * installa niente senza che tu lo veda.
 *
 * ## Tre fonti, in ordine
 *
 * La ricerca chiedeva solo all'API di GitHub, e da un telefono quella strada
 * si chiude spesso: sessanta richieste l'ora **per indirizzo**, e sulla rete
 * mobile l'indirizzo lo si divide con migliaia di persone — «GitHub ha
 * risposto 403», sempre, senza che si capisca perché. Adesso si prova prima
 * il computer a cui si è collegati (`/api/app`: lui lo sa già, e lo chiede
 * da casa), poi il file `app-android.json` allegato all'ultima pubblicazione
 * (un file, non l'API: nessun limite), e solo per ultima l'API. Se non va
 * nessuna, si dicono tutte e tre le ragioni.
 */
object Aggiornamenti {

    /**
     * Le ultime pubblicazioni, non solo l'ultima.
     *
     * L'app e il programma escono quando hanno qualcosa da dare, e quasi mai
     * insieme: la prima pubblicazione del programma **senza** APK allegato
     * faceva sparire l'aggiornamento dal telefono — niente da scaricare, e
     * nessun errore che lo dicesse. Si scorrono le ultime venti e si tiene la
     * versione più alta.
     */
    private const val ULTIME =
        "https://api.github.com/repos/niko9090/sierradeck/releases?per_page=20"

    /**
     * Il file che dice qual è l'app, allegato a ogni pubblicazione.
     *
     * `releases/latest/download/<file>` rimanda all'allegato dell'ultima
     * pubblicazione: è un file servito da una CDN, non una chiamata all'API,
     * e non ha il limite delle sessanta l'ora. Se l'ultima pubblicazione non
     * ce l'ha (una vecchia, prima della 0.16.4) risponde 404 e si passa oltre.
     */
    private const val FILE_APP =
        "https://github.com/niko9090/sierradeck/releases/latest/download/app-android.json"

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
     * Da dove puo' arrivare un APK, e da nessun altro posto.
     *
     * Un aggiornamento e' l'unica cosa che questa app installa: se l'indirizzo
     * da cui lo prende non e' vincolato, chiunque riesca a farci leggere un
     * indirizzo diverso ci fa installare quello che vuole. E deve essere
     * **cifrato**: su `http` chi sta sulla stessa rete puo' sostituire il file
     * mentre passa, e quello che si installa non e' piu' quello che si e'
     * scelto.
     *
     * Il controllo si fa in due punti — quando si sceglie l'allegato e appena
     * prima di scaricarlo — perche' fra i due passa del tempo e una risposta.
     * Vale anche per quello che dice il computer: e' un'altra macchina, e la
     * regola non cambia a seconda di chi parla.
     */
    private const val ORIGINE = "https://github.com/niko9090/sierradeck/releases/download/"

    fun apkAmmesso(indirizzo: String): Boolean = indirizzo.startsWith(ORIGINE)

    /**
     * Com'e' andata la ricerca.
     *
     * All'avvio si tace quando non c'e' niente di nuovo: nessuno vuole un
     * avviso che dice «tutto a posto» ogni volta che apre l'app. Ma quando la
     * ricerca la chiedi **tu**, il silenzio e' la risposta sbagliata — non sai
     * se e' aggiornata o se non ha funzionato niente.
     */
    sealed interface Esito {
        data class Trovata(val nome: String, val apk: String) : Esito
        data object GiaAggiornata : Esito
        data class NonRiuscita(val motivo: String) : Esito
    }

    /** L'app pubblicata, come la racconta una fonte: versione e indirizzo dell'APK. */
    data class Pubblicata(val versione: String, val apk: String)

    /**
     * Cerca l'ultima app pubblicata e la confronta con `mia`.
     *
     * `api` e' il computer a cui si e' collegati, se c'e': e' la prima fonte.
     * Sul thread di rete, mai su quello dell'interfaccia.
     */
    suspend fun cerca(mia: String, api: Api?): Esito = withContext(Dispatchers.IO) {
        val ragioni = mutableListOf<String>()
        // Computer E file, e vince la versione piu' alta: il computer ricorda
        // la sua risposta per un'ora, e appena pubblicata un'app nuova
        // rispondeva ancora con quella vecchia — «gia' aggiornata», e la
        // striscia non compariva. L'API solo se tacciono tutti e due.
        val candidate = listOfNotNull(dalComputer(api, ragioni), dalFile(ragioni))
        val trovata = candidate.maxWithOrNull { a, b -> if (piuNuova(a.versione, b.versione)) -1 else if (piuNuova(b.versione, a.versione)) 1 else 0 }
            ?: dallApi(ragioni)
        when {
            trovata == null -> Esito.NonRiuscita(ragioni.joinToString("; "))
            piuNuova(mia, trovata.versione) -> Esito.Trovata(trovata.versione, trovata.apk)
            else -> Esito.GiaAggiornata
        }
    }

    private suspend fun dalComputer(api: Api?, ragioni: MutableList<String>): Pubblicata? {
        if (api == null) return null
        return try {
            val a = api.app()
            if (a.versione.isBlank() || a.url.isBlank()) { ragioni += "il computer non la conosce"; null }
            else if (!apkAmmesso(a.url)) { ragioni += "il computer indica un posto non ammesso"; null }
            else Pubblicata(a.versione, a.url)
        } catch (e: Exception) {
            ragioni += "computer: ${e.message ?: "non risponde"}"
            null
        }
    }

    private fun dalFile(ragioni: MutableList<String>): Pubblicata? {
        return try {
            val corpo = leggi(FILE_APP, accetta = "application/json")
            val letta = leggiFileApp(corpo)
            if (letta == null) ragioni += "il file dell'app non si legge"
            letta
        } catch (e: Exception) {
            ragioni += "file: ${e.message ?: "non raggiungo GitHub"}"
            null
        }
    }

    private fun dallApi(ragioni: MutableList<String>): Pubblicata? {
        return try {
            val corpo = leggi(ULTIME, accetta = "application/vnd.github+json")
            val migliore = piuRecenteFra(corpo)
            if (migliore == null) ragioni += "nessuna app pubblicata"
            migliore?.let { Pubblicata(it.first, it.second) }
        } catch (e: Exception) {
            ragioni += "GitHub: ${e.message ?: "non raggiungo GitHub"}"
            null
        }
    }

    /** Un GET che segue i rimandi (il file dell'app sta dietro un 302) e pretende un 200. */
    private fun leggi(indirizzo: String, accetta: String): String {
        var url = indirizzo
        repeat(4) {
            val connessione = (URL(url).openConnection() as HttpURLConnection)
            connessione.instanceFollowRedirects = false
            connessione.setRequestProperty("Accept", accetta)
            connessione.setRequestProperty("User-Agent", "SierraDeck-Android")
            connessione.connectTimeout = 12_000
            connessione.readTimeout = 12_000
            try {
                val codice = connessione.responseCode
                if (codice in 301..308) {
                    url = connessione.getHeaderField("Location") ?: throw Exception("rimando senza indirizzo")
                    return@repeat
                }
                if (codice != 200) throw Exception("ha risposto $codice")
                return connessione.inputStream.bufferedReader().readText()
            } finally {
                connessione.disconnect()
            }
        }
        throw Exception("troppi rimandi")
    }

    /**
     * Il file `app-android.json`: `{ "versione": "2.25.4", "apk": "https://…/SierraDeck-2.25.4.apk" }`.
     *
     * Separato dalla rete perche' si possa provare senza GitHub.
     */
    fun leggiFileApp(corpo: String): Pubblicata? {
        return try {
            val o = JSONObject(corpo)
            val versione = o.optString("versione")
            val apk = o.optString("apk")
            if (versione.isBlank() || apk.isBlank() || !apkAmmesso(apk)) null
            else Pubblicata(versione, apk)
        } catch (e: Exception) {
            null
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
                if (url.isEmpty() || !apkAmmesso(url)) continue
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
        if (!apkAmmesso(apk)) {
            Log.e("SierraDeck", "aggiornamento rifiutato: non viene da dove deve")
            return
        }
        try {
            contesto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(apk)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            Log.e("SierraDeck", "download non aperto", e)
        }
    }
}
