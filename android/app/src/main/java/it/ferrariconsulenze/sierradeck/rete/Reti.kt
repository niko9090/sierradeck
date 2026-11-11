package it.ferrariconsulenze.sierradeck.rete

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import okhttp3.Dns
import okhttp3.OkHttpClient
import java.net.InetAddress
import java.util.concurrent.TimeUnit

/**
 * Le reti del telefono, viste dal Centralino. Un'interfaccia perché le prove
 * girano senza Android (`RetiFinte` nei test).
 */
interface Reti {
    fun adesso(): Strade.RetiAdesso
    /** Il cliente per una strada: quella di casa legata al wifi/ethernet, le altre sulla rete predefinita (VPN compresa). */
    fun cliente(tipo: TipoStrada): OkHttpClient
    /** Chiama `cambiata` ogni volta che una rete compare, sparisce o cambia (VPN comprese). */
    fun osserva(cambiata: () -> Unit)
}

/**
 * Le reti vere. La rete non si lascia scegliere ad Android: un indirizzo di casa
 * esce dal wifi (o dall'ethernet di un tablet), mai dai dati mobili o dentro una
 * VPN; Tailscale passa dalla predefinita, che con la VPN accesa è il tunnel.
 * Il perché per intero sta in `Rete` (il codice di prima).
 */
class RetiAndroid(contesto: Context) : Reti {
    private val cm = contesto.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    private val base = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(Strade.NORMALE_MS, TimeUnit.MILLISECONDS)
        .writeTimeout(Strade.NORMALE_MS, TimeUnit.MILLISECONDS)
        .build()
    @Volatile private var casa: Pair<Network, OkHttpClient>? = null

    private fun reteCasa(): Network? = try {
        cm?.allNetworks?.firstOrNull { r ->
            val c = cm.getNetworkCapabilities(r)
            c != null && !c.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
                (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
        }
    } catch (e: Exception) {
        null
    }

    override fun adesso(): Strade.RetiAdesso {
        val c = cm ?: return Strade.RetiAdesso(casa = false, vpn = false)
        val reti = try { c.allNetworks.toList() } catch (e: Exception) { emptyList() }
        val vpn = reti.any { c.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true }
        val casa = reteCasa()
        val etichetta = casa?.let { n ->
            try { c.getLinkProperties(n)?.routes?.firstOrNull { it.isDefaultRoute }?.gateway?.hostAddress } catch (e: Exception) { null }
        }
        return Strade.RetiAdesso(casa = casa != null, vpn = vpn, etichettaCasa = etichetta?.let { "wifi:$it" })
    }

    override fun cliente(tipo: TipoStrada): OkHttpClient {
        if (tipo != TipoStrada.CASA) return base
        val rete = reteCasa() ?: return base
        casa?.let { (n, cl) -> if (n == rete) return cl }
        val legato = base.newBuilder()
            .socketFactory(rete.socketFactory)
            .dns(object : Dns {
                override fun lookup(hostname: String): List<InetAddress> = try { rete.getAllByName(hostname).toList() } catch (e: Exception) { Dns.SYSTEM.lookup(hostname) }
            })
            .build()
        casa = rete to legato
        return legato
    }

    override fun osserva(cambiata: () -> Unit) {
        val c = cm ?: return
        try {
            // Senza togliere NOT_VPN la richiesta di rete esclude le VPN: accendere
            // Tailscale non svegliava nessuno (controllo del collegamento, 11/11).
            val richiesta = NetworkRequest.Builder().removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build()
            c.registerNetworkCallback(richiesta, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = cambiata()
                override fun onLost(network: Network) = cambiata()
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = Unit
            })
        } catch (e: Exception) {
            // Senza osservatore si riprova lo stesso, con le attese.
        }
    }
}
