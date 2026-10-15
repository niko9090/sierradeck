package it.ferrariconsulenze.sierradeck

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * Perché il telefono non si collega a nessun PC (app 2.75.1, PC 0.75.1).
 * Nicholas, 15/10: l'app diceva solo «non risponde»; il 14/10 la causa era
 * Tailscale spento sul telefono da un giorno. Ora si dice il motivo probabile
 * e il rimedio, con il tasto giusto.
 *
 * I quattro casi, in quest'ordine:
 * 1. il PC risponde ma non riconosce la chiave (401/403) → «Riprova»;
 * 2. il PC si raggiunge solo con Tailscale e Tailscale è spento qui → «Apri Tailscale»;
 * 3. il PC è sulla rete di casa e il telefono non c'è (né Tailscale) → «Apri Tailscale»;
 * 4. altrimenti: nessun PC risponde, con l'elenco di cosa si è provato.
 */
data class ReteTelefono(
    /** Una VPN accesa (Tailscale è una VPN per Android). */
    val vpn: Boolean,
    /** Il telefono ha un indirizzo Tailscale (100.64.0.0/10). */
    val indirizzoTailscale: Boolean,
    /** Collegato a un wifi. */
    val wifi: Boolean
) {
    val tailscaleAcceso: Boolean get() = vpn || indirizzoTailscale
}

enum class CasoNonCollego { CHIAVE, TAILSCALE_SPENTO, FUORI_CASA, NESSUNA_RISPOSTA }

data class Diagnosi(
    val caso: CasoNonCollego,
    val titolo: String,
    val rimedio: String,
    /** Dietro il «?». */
    val dettagli: String,
    /** «apri-tailscale» o «riprova». */
    val azione: String
)

object PercheNonCollego {
    /** Dopo quanti giri andati a vuoto si spiega il perché (un singhiozzo non è un guasto). */
    const val GIRI_PRIMA_DI_SPIEGARE = 2
    const val PACCHETTO_TAILSCALE = "com.tailscale.ipn"

    fun diagnosi(rete: ReteTelefono, indirizziPc: List<String>, chiaveRifiutata: Boolean, provate: List<String>): Diagnosi {
        val elenco = if (provate.isEmpty()) "" else " Ho provato: " + provate.joinToString("; ") + "."
        if (chiaveRifiutata) return Diagnosi(
            CasoNonCollego.CHIAVE,
            "Il PC risponde ma non riconosce questo telefono",
            "Riprova: se continua, ricollega il telefono.",
            "Il computer c'è e risponde, ma rifiuta la chiave di questo telefono (401 o 403): il telefono è stato tolto dal computer, o il computer è stato reinstallato. Per ricollegarlo: sul computer apri Impostazioni → Client e inquadra il codice QR da «Aggiungi un computer».$elenco",
            "riprova"
        )
        val strade = indirizziPc.mapNotNull { Linea.stradaDiIndirizzo(it) }.toSet()
        val soloTailscale = strade.isNotEmpty() && strade.all { it == "tailscale" }
        if (soloTailscale && !rete.tailscaleAcceso) return Diagnosi(
            CasoNonCollego.TAILSCALE_SPENTO,
            "Tailscale è spento su questo telefono",
            "Accendilo: il PC si raggiunge solo con Tailscale.",
            "Questo PC è salvato con il suo indirizzo Tailscale (100.x), e sul telefono non c'è nessuna VPN accesa né un indirizzo Tailscale. Apri Tailscale, accendilo con lo stesso account del PC, e torna qui: il collegamento riparte da solo.$elenco",
            "apri-tailscale"
        )
        if ("lan" in strade && !rete.tailscaleAcceso && (!rete.wifi || "tailscale" !in strade)) return Diagnosi(
            CasoNonCollego.FUORI_CASA,
            "Non sei sulla rete di casa: accendi Tailscale",
            "Fuori casa il PC si raggiunge solo con Tailscale.",
            (if (rete.wifi) "Il telefono è su un wifi, ma il PC non risponde al suo indirizzo di casa: probabilmente è un altro wifi. " else "Il telefono non è su un wifi: con i dati mobili l'indirizzo di casa del PC non si raggiunge. ") +
                "Accendi Tailscale sul telefono (con lo stesso account del PC), oppure collegati al wifi di casa.$elenco",
            "apri-tailscale"
        )
        return Diagnosi(
            CasoNonCollego.NESSUNA_RISPOSTA,
            "Nessun PC risponde",
            "Controlla che il PC sia acceso con SierraDeck aperto.",
            "Nessuna strada ha avuto risposta: il PC è spento o in sospensione, SierraDeck è chiuso, oppure il firewall di Windows blocca la porta. " +
                (if (rete.tailscaleAcceso) "Tailscale sul telefono è acceso: controlla che sia acceso anche sul PC, con lo stesso account. " else "") + elenco.trim(),
            "riprova"
        )
    }

    /** La rete del telefono adesso (sola lettura). */
    fun leggiRete(contesto: Context): ReteTelefono {
        val cm = contesto.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        var vpn = false
        var wifi = false
        try {
            @Suppress("DEPRECATION")
            for (n in cm?.allNetworks ?: emptyArray()) {
                val c = cm?.getNetworkCapabilities(n) ?: continue
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) vpn = true
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) wifi = true
            }
        } catch (_: Exception) { }
        val ts = try {
            NetworkInterface.getNetworkInterfaces()?.toList().orEmpty().flatMap { it.inetAddresses.toList() }
                .filterIsInstance<Inet4Address>().any { a -> val b = a.address; (b[0].toInt() and 0xFF) == 100 && (b[1].toInt() and 0xFF) in 64..127 }
        } catch (_: Exception) { false }
        return ReteTelefono(vpn, ts, wifi)
    }

    /** Apre Tailscale; se non c'è, la sua pagina sul Play Store. */
    fun apriTailscale(contesto: Context) {
        val apri = contesto.packageManager.getLaunchIntentForPackage(PACCHETTO_TAILSCALE)
        try {
            if (apri != null) { contesto.startActivity(apri.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return }
            contesto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PACCHETTO_TAILSCALE")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            try { contesto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PACCHETTO_TAILSCALE")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { }
        }
    }
}

/** La banda in cima quando non c'è collegamento: il motivo, il rimedio, un tasto, il «?». */
@Composable
fun BandaNonCollego(d: Diagnosi, onRiprova: () -> Unit) {
    val contesto = LocalContext.current
    Column(Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 14.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(d.titolo, color = Banco.ambra, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Aiuto(d.dettagli, di = d.titolo)
        }
        Text(d.rimedio, color = Banco.testoQuieto, fontSize = 12.sp)
        Row {
            if (d.azione == "apri-tailscale") OutlinedButton(onClick = { PercheNonCollego.apriTailscale(contesto) }, modifier = Modifier.padding(top = 4.dp, end = 8.dp)) { Text("Apri Tailscale", fontSize = 12.sp) }
            OutlinedButton(onClick = onRiprova, modifier = Modifier.padding(top = 4.dp)) { Text("Riprova", fontSize = 12.sp) }
        }
    }
}
