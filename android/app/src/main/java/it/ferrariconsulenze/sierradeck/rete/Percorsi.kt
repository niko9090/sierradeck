package it.ferrariconsulenze.sierradeck.rete

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.serialization.Serializable
import okhttp3.Request
import it.ferrariconsulenze.sierradeck.dati.Collegamento
import it.ferrariconsulenze.sierradeck.dati.Postazioni
import it.ferrariconsulenze.sierradeck.nucleo.Ciao

/** Gli indirizzi che il PC racconta all'app (`/api/indirizzi`): `http://ip:porta`, la rete di casa prima di Tailscale. */
@Serializable
data class IndirizziPc(val impronta: String = "", val porta: Int = 0, val indirizzi: List<String> = emptyList())

/**
 * **Per quale strada** si raggiunge un computer (k-50): la rete di casa se il
 * telefono è sulla stessa WiFi, Tailscale se è fuori, senza che tu debba
 * scegliere.
 *
 * L'indirizzo con cui hai accoppiato il PC resta la sua **identità** (la chiave,
 * l'elenco, le copie dello stato sono legate a lui): non cambia mai. Quello che
 * cambia è la strada: a ogni collegamento il PC racconta i suoi indirizzi
 * (`/api/indirizzi`), l'app li ricorda, e quando la strada in uso non risponde
 * più prova le altre e usa la prima che risponde.
 *
 * ## Sicurezza
 *
 * - Si provano **solo** indirizzi privati (10/8, 172.16/12, 192.168/16, 169.254)
 *   e Tailscale (`Indirizzi.accettabile`): niente Internet in chiaro.
 * - La chiave **non parte** verso un indirizzo finché `/api/ciao` (che non vuole
 *   chiave) non ha detto l'impronta di quel PC: sulla WiFi di un bar un
 *   192.168.1.5 qualunque non è il tuo computer e non riceve niente.
 * - Il PC, dal canto suo, chiede comunque la chiave e accetta solo reti private.
 *
 * Le funzioni «pure» stanno in cima e si provano senza Android.
 */
object Percorsi {

    // ───────────────────────── logica pura ─────────────────────────

    /**
     * Gli indirizzi da provare, nell'ordine: rete di casa, poi Tailscale; a parità,
     * l'ultimo che ha risposto per primo. Solo accettabili, senza doppioni.
     */
    fun candidati(principale: String, imparati: List<String>, scoperti: List<String>, buono: String?): List<String> {
        val tutti = (listOf(principale) + imparati + scoperti)
            .filter { it.isNotBlank() }
            .map { Collegamento.pulisci(it) }
            .filter { Indirizzi.accettabile(it) }
            .distinct()
        return tutti.sortedWith(
            compareBy<String>({ rango(it) }, { if (it == buono) 0 else 1 })
        )
    }

    private fun rango(indirizzo: String): Int = when (Linea.stradaDiIndirizzo(indirizzo)) {
        "lan" -> 0
        "tailscale" -> 1
        else -> 2
    }

    /** Un indirizzo è «questo» PC solo se dichiara la sua stessa impronta, e l'impronta è nota. */
    fun stessoPc(attesa: String, ricevuta: String?): Boolean =
        attesa.isNotBlank() && ricevuta != null && attesa == ricevuta

    /** Il primo, nell'ordine, che ha risposto con l'impronta giusta. `risposte`: indirizzo → impronta dichiarata (null = nessuna risposta). */
    fun scegli(ordine: List<String>, risposte: Map<String, String?>, attesa: String): String? =
        ordine.firstOrNull { stessoPc(attesa, risposte[it]) }

    /** Un servizio visto in rete vale solo con un'impronta e un indirizzo privato (o Tailscale). */
    fun annuncioValido(impronta: String, indirizzo: String): Boolean =
        impronta.isNotBlank() && Indirizzi.accettabile(indirizzo)

    /** Il permesso Android per parlare con i dispositivi della rete locale: esiste dal 16 (API 36). */
    const val PERMESSO_RETE_LOCALE = "android.permission.ACCESS_LOCAL_NETWORK"

    fun serveLaReteLocale(sdk: Int): Boolean = sdk >= 36

    /** Come si è collegati, in due parole per lo schermo. `null` se non si sa. */
    fun comeCollegato(strada: String?): String? = when (strada) {
        "lan" -> "in WiFi"
        "tailscale" -> "via VPN"
        else -> null
    }

    /** Per quanto, dopo un giro di prove, non se ne rifà un altro (le richieste cadute sono molte, e a raffica). */
    const val PAUSA_FRA_GIRI_MS = 3_000L

    /** Se è ora di rifare un giro di prove. `forza`: il telefono ha cambiato rete. */
    fun eOraDiProvare(ultimo: Long, adesso: Long, forza: Boolean): Boolean =
        forza || ultimo == 0L || adesso - ultimo >= PAUSA_FRA_GIRI_MS

    // ───────────────────── memoria e prove (Android) ─────────────────────

    private const val PREF = "percorsi"
    private val buoni = ConcurrentHashMap<String, String>()
    private val ultimoGiro = ConcurrentHashMap<String, Long>()
    private val pool = Executors.newCachedThreadPool { r -> Thread(r, "percorsi").apply { isDaemon = true } }
    private val lucchetto = Any()

    @Volatile
    private var osservata = false

    private fun prefs(c: Context) = c.getSharedPreferences("sierradeck", Context.MODE_PRIVATE)

    @Serializable
    private data class Ricordo(val impronta: String = "", val indirizzi: List<String> = emptyList(), val buono: String = "")

    private fun leggi(c: Context, identita: String): Ricordo = try {
        val t = prefs(c).getString("$PREF:$identita", null)
        if (t == null) Ricordo() else Api.json.decodeFromString(Ricordo.serializer(), t)
    } catch (e: Exception) {
        Ricordo()
    }

    private fun scrivi(c: Context, identita: String, r: Ricordo) {
        prefs(c).edit().putString("$PREF:$identita", Api.json.encodeToString(Ricordo.serializer(), r)).apply()
    }

    /** L'indirizzo da usare adesso per quel computer: l'ultimo che ha risposto, o l'identità stessa. */
    fun effettivo(identita: String): String {
        buoni[identita]?.let { return it }
        val c = Rete.contestoApp() ?: return identita
        val b = leggi(c, identita).buono.takeIf { it.isNotBlank() && Indirizzi.accettabile(it) } ?: identita
        buoni[identita] = b
        return b
    }

    /** Il PC ha raccontato i suoi indirizzi: si ricordano (solo quelli accettabili). */
    fun impara(c: Context, identita: String, dal: IndirizziPc) {
        if (dal.impronta.isBlank()) return
        val buonIndirizzi = dal.indirizzi.map { Collegamento.pulisci(it) }.filter { Indirizzi.accettabile(it) }.distinct().take(8)
        val prima = leggi(c, identita)
        val nuovo = prima.copy(
            impronta = dal.impronta,
            indirizzi = buonIndirizzi,
            buono = prima.buono.takeIf { it in buonIndirizzi || it == identita } ?: ""
        )
        if (nuovo != prima) scrivi(c, identita, nuovo)
    }

    /** Gli indirizzi che il PC ha raccontato l'ultima volta (rete di casa e Tailscale), per spiegare il perché di un fallimento. */
    fun ricordati(c: Context, identita: String): List<String> = leggi(c, identita).indirizzi

    /** L'impronta ricordata per quel computer ("" = non ancora nota). */
    fun improntaDi(c: Context, identita: String): String = leggi(c, identita).impronta

    /** La strada in uso: `lan`, `tailscale`, o `null` se non si sa. */
    fun stradaInUso(identita: String): String? = Linea.stradaDiIndirizzo(effettivo(identita))

    /**
     * Cerca l'indirizzo che risponde adesso e lo ricorda. Bloccante (usarla fuori dal
     * thread principale). `null` se non ci sono alternative note o se nessuna risponde.
     */
    fun ritrova(identita: String, forza: Boolean = false): String? {
        val c = Rete.contestoApp() ?: return null
        synchronized(lucchetto) {
            val r = leggi(c, identita)
            if (r.impronta.isBlank()) return null
            val ordine = candidati(identita, r.indirizzi, Scoperta.indirizziDi(r.impronta), buoni[identita] ?: r.buono)
            if (ordine.size < 2) return null
            val adesso = System.currentTimeMillis()
            if (!eOraDiProvare(ultimoGiro[identita] ?: 0L, adesso, forza)) return buoni[identita]
            ultimoGiro[identita] = adesso
            val risposte = sonda(ordine)
            val scelto = scegli(ordine, risposte, r.impronta) ?: return null
            if (buoni[identita] != scelto) {
                buoni[identita] = scelto
                scrivi(c, identita, r.copy(buono = scelto))
            }
            return scelto
        }
    }

    /**
     * Fa una richiesta sull'indirizzo che oggi funziona; se cade per la rete, cerca
     * l'altra strada e riprova una volta. Per chi non passa da `Api` (guardia, notifiche).
     */
    fun <T> provando(identita: String, f: (base: String) -> T): T {
        val base = effettivo(identita)
        try {
            return f(base)
        } catch (e: java.io.IOException) {
            val altra = ritrova(identita)
            if (altra == null || altra == base) throw e
            return f(altra)
        }
    }

    /** Prova tutti insieme (`/api/ciao`, senza chiave): indirizzo → impronta dichiarata, null se non risponde. */
    private fun sonda(indirizzi: List<String>): Map<String, String?> {
        val lavori = indirizzi.map { a ->
            a to pool.submit(Callable<String?> {
                try {
                    val cliente = Rete.clientePer(Indirizzi.hostDi(a)).newBuilder()
                        .connectTimeout(2, TimeUnit.SECONDS)
                        .readTimeout(2, TimeUnit.SECONDS)
                        .callTimeout(3, TimeUnit.SECONDS)
                        .build()
                    cliente.newCall(Request.Builder().url(a.trimEnd('/') + "/api/ciao").get().build()).execute().use { r ->
                        if (!r.isSuccessful) null
                        else Api.json.decodeFromString(Ciao.serializer(), r.body?.string() ?: "").impronta
                    }
                } catch (e: Exception) {
                    null
                }
            })
        }
        return lavori.associate { (a, f) -> a to (try { f.get(4, TimeUnit.SECONDS) } catch (e: Exception) { null }) }
    }

    /**
     * Si accorge che il telefono cambia rete e rifà la scelta da solo (k-50): niente
     * da premere. Va chiamata all'avvio dell'app e della guardia; la seconda volta non fa niente.
     */
    fun osserva(contesto: Context) {
        if (osservata) return
        val c = contesto.applicationContext
        try {
            val cm = c.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
            osservata = true
            cm.registerNetworkCallback(NetworkRequest.Builder().build(), object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = rete(c)
                override fun onLost(network: Network) = rete(c)
            })
        } catch (e: Exception) {
            osservata = false
        }
    }

    @Volatile
    private var prossimaRivalutazione = 0L

    /** Una rete è comparsa o sparita: dopo un attimo (la rete si assesta) si rifà la scelta per ogni computer noto. */
    private fun rete(c: Context) {
        val quando = System.currentTimeMillis() + 1_500
        prossimaRivalutazione = quando
        pool.execute {
            try {
                Thread.sleep(1_600)
                if (prossimaRivalutazione != quando) return@execute // un'altra variazione è arrivata: conta l'ultima
                for (p in Postazioni.elenca(c)) ritrova(p.indirizzo, forza = true)
            } catch (e: Exception) {
                // La rete va e viene: un giro andato a vuoto non è un guasto.
            }
        }
    }
}
