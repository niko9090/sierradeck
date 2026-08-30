package it.ferrariconsulenze.sierradeck

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import okhttp3.Dns
import okhttp3.OkHttpClient
import java.net.InetAddress
import java.util.concurrent.TimeUnit

/**
 * **Da quale rete** parlare col computer.
 *
 * Sembra una domanda senza senso — il telefono ha una rete — e invece ne ha
 * quasi sempre tre insieme: il wifi, i dati mobili, e una VPN. Android ne
 * sceglie una come predefinita, e la sceglie guardando **chi porta a Internet**,
 * non chi porta al computer di casa. Basta un wifi che il telefono giudica
 * scadente, o una VPN accesa, perché una richiesta a `192.168.1.191` esca dai
 * dati mobili o entri nel tunnel — e da lì quell'indirizzo non esiste.
 *
 * Il risultato, per chi guarda lo schermo, è «non risponde»: identico a un
 * computer spento, a un indirizzo sbagliato, a un cavo staccato. Ed è la strada
 * che ha fatto perdere un pomeriggio, perché dalla parte del computer era tutto
 * a posto e non c'era niente da trovare.
 *
 * Quindi la rete non si lascia scegliere a Android: la si dice.
 *
 * - Un indirizzo di **casa** (10, 192.168, 172.16–31, 169.254) esiste solo
 *   sulla rete locale: si manda dal wifi, o dall'ethernet di un tablet in dock,
 *   e mai da altro.
 * - Un indirizzo **Tailscale** (100.64–100.127) esiste solo *dentro* il tunnel:
 *   lì la rete giusta è quella predefinita, VPN compresa. Forzarlo sul wifi
 *   sarebbe l'errore speculare.
 */
object Rete {

    /**
     * Il contesto dell'applicazione, se qualcuno ce l'ha dato.
     *
     * `Api` viene costruita in una dozzina di punti, alcuni dentro composable e
     * altri dentro ricevitori: passarle un contesto ovunque sarebbe un diff
     * lungo tre volte il problema. Lo si deposita una volta, all'avvio di ogni
     * porta d'ingresso dell'app, e chi non l'ha ricevuto si comporta come prima.
     */
    @Volatile
    private var contesto: Context? = null

    /** Un client per rete, riusati: aprire connessioni nuove ogni volta costa. */
    private val clienti = mutableMapOf<String, OkHttpClient>()

    fun ricorda(qualsiasi: Context) {
        if (contesto == null) contesto = qualsiasi.applicationContext
    }

    /**
     * Il client giusto per quell'host.
     *
     * Se non si sa niente della rete — nessun contesto, nessun wifi, un host che
     * non è di casa — si torna quello predefinito: peggio di prima non si sta
     * mai, e un'app che non parte perché non ha trovato un wifi sarebbe un
     * rimedio peggiore del male.
     */
    fun clientePer(host: String): OkHttpClient {
        val rete = if (soloDaCasa(host)) reteLocale() else null
        return cliente(rete)
    }

    /**
     * Un indirizzo che **esiste solo sulla rete locale**.
     *
     * Tailscale no, di proposito: quello vive nel tunnel, ed è l'unico caso in
     * cui la rete predefinita è anche quella giusta.
     */
    fun soloDaCasa(host: String): Boolean {
        val pezzi = host.split('.')
        if (pezzi.size != 4) return false
        val n = pezzi.map { it.toIntOrNull() ?: return false }
        if (n.any { it < 0 || it > 255 }) return false
        val (a, b) = n
        return when {
            a == 10 -> true
            a == 192 && b == 168 -> true
            a == 172 && b in 16..31 -> true
            a == 169 && b == 254 -> true
            else -> false
        }
    }

    /**
     * La rete di casa: wifi, o ethernet per chi ha il tablet in un dock.
     *
     * Si scartano esplicitamente le VPN: una VPN a maglia può dichiararsi
     * capace di tutto, e su una richiesta a `192.168.x.x` sarebbe la risposta
     * sbagliata data con sicurezza.
     */
    private fun reteLocale(): Network? = try {
        val cm = contesto?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        cm?.allNetworks?.firstOrNull { rete ->
            val c = cm.getNetworkCapabilities(rete)
            c != null &&
                !c.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
                (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
        }
    } catch (e: Exception) {
        null
    }

    /**
     * Com'è messo il telefono adesso, in parole.
     *
     * Serve al messaggio d'errore: «non risponde» da solo manda a controllare
     * l'indirizzo e il computer, cioè le due cose che quasi sempre stanno bene.
     * Dire **da dove** ci si è provati sposta lo sguardo dove serve.
     */
    fun comeSiamoMessi(): String {
        val cm = try {
            contesto?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        } catch (e: Exception) {
            null
        } ?: return ""
        var wifi = false
        var vpn = false
        var dati = false
        try {
            for (rete in cm.allNetworks) {
                val c = cm.getNetworkCapabilities(rete) ?: continue
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) vpn = true
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) wifi = true
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) wifi = true
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) dati = true
            }
        } catch (e: Exception) {
            return ""
        }
        return when {
            !wifi && dati -> "Il telefono è solo sui dati mobili: un indirizzo di casa da lì non esiste. Accendi il wifi di casa."
            !wifi -> "Il telefono non è su nessun wifi."
            vpn -> "Sei sul wifi, ma c'è anche una VPN attiva. Se il computer lo raggiungi in VPN, usa il suo indirizzo Tailscale (quello che comincia per 100.)."
            else -> "Sei sul wifi: controlla che sia quello di casa e non una rete ospiti."
        }
    }

    private fun cliente(rete: Network?): OkHttpClient {
        val chiave = rete?.toString() ?: "predefinita"
        synchronized(clienti) {
            clienti[chiave]?.let { return it }
            // La chiave e' l'identificativo della rete, e Android ne assegna
            // uno **nuovo** ogni volta che il wifi si riattacca. Senza questa
            // riga la mappa cresceva di una voce a ogni riaggancio — con
            // dentro il suo bacino di connessioni — e non ne usciva piu'
            // niente. Una rete nuova vuol dire che quelle di prima non
            // servono: si tiene la predefinita, che non cambia mai, e si
            // ricomincia.
            if (rete != null) clienti.keys.retainAll(setOf("predefinita"))
            val b = OkHttpClient.Builder()
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
            if (rete != null) {
                // `socketFactory` lega **la connessione** a quella rete: senza,
                // il socket lo assegna Android alla predefinita e tutto questo
                // ragionamento non arriva fino al filo.
                b.socketFactory(rete.socketFactory)
                b.dns(object : Dns {
                    override fun lookup(hostname: String): List<InetAddress> = try {
                        rete.getAllByName(hostname).toList()
                    } catch (e: Exception) {
                        Dns.SYSTEM.lookup(hostname)
                    }
                })
            }
            val fatto = b.build()
            clienti[chiave] = fatto
            return fatto
        }
    }
}
