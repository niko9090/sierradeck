package it.ferrariconsulenze.sierradeck.rete

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import it.ferrariconsulenze.sierradeck.dati.Collegamento

/** Un PC visto sulla rete locale con l'annuncio `_sierradeck._tcp`. */
data class Trovato(val impronta: String, val indirizzo: String, val nome: String)

/**
 * La scoperta in rete locale (k-50): il PC si annuncia come `_sierradeck._tcp`
 * (mDNS / DNS-SD) e il telefono, sulla stessa WiFi, lo trova senza conoscerne
 * l'indirizzo.
 *
 * Serve a due cose: mostrare nell'ingresso i computer vicini (un tocco e
 * l'indirizzo è nel campo), e dare a `Percorsi` un indirizzo fresco per i PC già
 * accoppiati (il router può aver cambiato i numeri).
 *
 * Non basta a collegarsi: senza il codice di abbinamento o la chiave il PC non
 * risponde a niente, e gli indirizzi non privati si scartano comunque
 * (`Indirizzi.accettabile`). Si accende quando l'app è davanti e si spegne
 * quando va via.
 *
 * Android vuole la «multicast lock» per ricevere i pacchetti mDNS; da Android 16
 * serve anche il permesso sulla rete locale (nel manifest, chiesto all'avvio).
 */
object Scoperta {

    const val TIPO = "_sierradeck._tcp."

    /** Quelli visti adesso: lo legge l'ingresso. */
    var trovati by mutableStateOf<List<Trovato>>(emptyList())
        private set

    private val vistiPerNome = LinkedHashMap<String, Trovato>()
    private var gestore: NsdManager? = null
    private var ascolto: NsdManager.DiscoveryListener? = null
    private var blocco: WifiManager.MulticastLock? = null
    private val daRisolvere = ArrayDeque<NsdServiceInfo>()
    private var risolvendo = false

    /** Gli indirizzi visti per quell'impronta (vuoto se non c'è o se non è stata ancora vista). */
    fun indirizziDi(impronta: String): List<String> =
        if (impronta.isBlank()) emptyList()
        else synchronized(vistiPerNome) { vistiPerNome.values.filter { it.impronta == impronta }.map { it.indirizzo } }

    /** Si può fidare di un servizio visto? Solo se ha un'impronta e un indirizzo privato. */
    fun valido(impronta: String, indirizzo: String): Boolean = Percorsi.annuncioValido(impronta, indirizzo)

    @Synchronized
    fun avvia(contesto: Context) {
        if (ascolto != null) return
        val c = contesto.applicationContext
        try {
            val wifi = c.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            blocco = wifi?.createMulticastLock("sierradeck-nsd")?.apply { setReferenceCounted(false); acquire() }
            val nsd = c.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return
            gestore = nsd
            val l = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(tipo: String) {}
                override fun onStartDiscoveryFailed(tipo: String, errore: Int) { fermaInterno() }
                override fun onStopDiscoveryFailed(tipo: String, errore: Int) {}
                override fun onDiscoveryStopped(tipo: String) {}
                override fun onServiceFound(info: NsdServiceInfo) { accoda(info) }
                override fun onServiceLost(info: NsdServiceInfo) {
                    synchronized(vistiPerNome) { vistiPerNome.remove(info.serviceName) }
                    pubblica()
                }
            }
            ascolto = l
            nsd.discoverServices(TIPO, NsdManager.PROTOCOL_DNS_SD, l)
        } catch (e: Exception) {
            fermaInterno()
        }
    }

    @Synchronized
    fun ferma() = fermaInterno()

    private fun fermaInterno() {
        try { ascolto?.let { gestore?.stopServiceDiscovery(it) } } catch (e: Exception) { /* già fermo */ }
        ascolto = null
        try { blocco?.takeIf { it.isHeld }?.release() } catch (e: Exception) { /* già rilasciato */ }
        blocco = null
        synchronized(vistiPerNome) { vistiPerNome.clear() }
        daRisolvere.clear()
        risolvendo = false
        pubblica()
    }

    // Android risolve un servizio alla volta: gli altri aspettano.
    @Synchronized
    private fun accoda(info: NsdServiceInfo) {
        daRisolvere.addLast(info)
        prossimo()
    }

    @Synchronized
    private fun prossimo() {
        if (risolvendo) return
        val info = daRisolvere.removeFirstOrNull() ?: return
        val nsd = gestore ?: return
        risolvendo = true
        try {
            @Suppress("DEPRECATION")
            nsd.resolveService(info, object : NsdManager.ResolveListener {
                override fun onResolveFailed(i: NsdServiceInfo, errore: Int) { finito() }
                override fun onServiceResolved(i: NsdServiceInfo) {
                    try {
                        val impronta = i.attributes["id"]?.toString(Charsets.UTF_8) ?: ""
                        val ip = i.host?.hostAddress ?: ""
                        val a = Collegamento.pulisci("$ip:${i.port}")
                        if (ip.isNotBlank() && valido(impronta, a)) {
                            synchronized(vistiPerNome) {
                                vistiPerNome[i.serviceName] = Trovato(impronta, a, i.serviceName.removePrefix("SierraDeck-"))
                            }
                            pubblica()
                        }
                    } finally {
                        finito()
                    }
                }
            })
        } catch (e: Exception) {
            finito()
        }
    }

    @Synchronized
    private fun finito() {
        risolvendo = false
        prossimo()
    }

    private fun pubblica() {
        trovati = synchronized(vistiPerNome) { vistiPerNome.values.toList() }
    }
}
