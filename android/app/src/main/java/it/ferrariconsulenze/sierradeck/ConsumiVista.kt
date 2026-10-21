package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.border
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions

/** Numeri di token leggibili: 12.4k, 3.1M. */
private fun tokenBrevi(n: Long): String = when {
    n >= 1_000_000 -> "%.1fM".format(n / 1_000_000.0)
    n >= 1_000 -> "%.1fk".format(n / 1_000.0)
    else -> n.toString()
}

/** I consumi (app 2.61.0 in Salute, 2.83.0 in Altro): token, limiti del piano, contesto delle chat. */
@Composable
fun SezioneConsumi(api: Api) {
    var consumi by remember { mutableStateOf<Consumi?>(null) }
    // I consumi si rileggono ogni mezzo minuto, come fa il computer: letti una
    // volta sola all'apertura della scheda, i limiti del piano restavano quelli
    // di quando l'avevi aperta — e una finestra di 5 ore che sale all'80%
    // mentre guardi e' proprio la notizia che serve.
    LaunchedEffect(Unit) {
        while (isActive) {
            consumi = try { api.consumi() } catch (_: Exception) { consumi }
            Davanti.pausa(30_000)
        }
    }
        // ─── Consumi ───
        Sezione("Consumi (token)", aiuto = "↑ token mandati a Claude, ↓ token ricevuti, ⟳ letti dalla cache (costano molto meno); «chat» è quante conversazioni hanno lavorato nel periodo.")
        val c = consumi
        if (c == null) Text("Carico…", color = Banco.testoQuieto)
        else {
            QuotaRiga("Oggi", c.oggi)
            QuotaRiga("7 giorni", c.settimana)
            QuotaRiga("Totale", c.totale)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("LIMITI DEL PIANO", color = Banco.testoQuieto, fontSize = 12.sp, letterSpacing = 1.sp)
                Aiuto(
                    "La finestra di 5 ore: al 100% le chat si fermano fino all’azzeramento. La settimana: il tetto settimanale su tutti i modelli. " +
                        "I numeri sono gli stessi di /usage in Claude Code e arrivano dalla riga di stato di Claude Code dopo la prima risposta di una chat aperta dal computer (solo con abbonamento Pro o Max). " +
                        "Fra tutte le chat aperte dal computer vale la lettura più recente; si aggiornano a ogni risposta, e qui ogni mezzo minuto. Una lettura di più di 20 minuti è segnata vecchia: il valore vero può essere più alto.",
                    di = "Limiti del piano"
                )
            }
            val l = c.limiti
            FinestraRiga("Finestra di 5 ore", l?.cinqueOre)
            FinestraRiga("Settimana", l?.settimana)
            Text(
                if (l == null) "Non ancora letti."
                else "Letti " + quandoLetti(l.letti, System.currentTimeMillis()) + ".",
                color = Banco.testoQuieto, fontSize = 12.sp
            )
            // Il contesto di ogni chat aperta, con la frase del computer
            // (0.37): uguale alla console e alla pagina.
            if (c.chatAperte.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text("CONTESTO DELLE CHAT APERTE", color = Banco.testoQuieto, fontSize = 12.sp, letterSpacing = 1.sp)
                    Aiuto("Il contesto è la memoria di lavoro della chat: si conta come Claude Code, solo con i token in ingresso. Al 90% conviene farle riassumere dove è arrivata, prima che lo compatti da sola.", di = "Contesto")
                }
                for (ch in c.chatAperte) {
                    Spacer(Modifier.height(4.dp))
                    Text(rigaContesto(ch), color = Banco.testo, fontSize = 12.sp)
                }
            }
            c.freno?.let { fr ->
                Spacer(Modifier.height(8.dp))
                Text("FRENO DEGLI AUTOPILOTI", color = Banco.testoQuieto, fontSize = 12.sp, letterSpacing = 1.sp)
                Text("${fr.titolo}: ${fr.spiegazione.ifEmpty { fr.motivo }}", color = Banco.testoQuieto, fontSize = 12.sp)
            }
            c.costo?.let { k ->
                Spacer(Modifier.height(6.dp))
                Text(
                    "Spesa stimata: oggi ${"%.2f".format(k.oggi)} $, 7 giorni ${"%.2f".format(k.settimana)} $.",
                    color = Banco.testoQuieto, fontSize = 12.sp
                )
            }
        }
}

/** Una finestra dei limiti del piano: nome, percentuale, azzeramento, e la barra colorata. */
@Composable
internal fun FinestraRiga(nome: String, f: Finestra?) {
    val p = if (f == null) 0 else f.percento.toInt().coerceIn(0, 100)
    val colore = if (p >= 95) Banco.rosso else if (p >= 80) Banco.ambra else Banco.accento
    val quando = f?.resettaIl?.let { " · si azzera " + java.text.SimpleDateFormat("EEE HH:mm", java.util.Locale.ITALY).format(java.util.Date(it)) } ?: ""
    Spacer(Modifier.height(6.dp))
    Row(Modifier.fillMaxWidth()) {
        Text(nome, color = Banco.testo, fontSize = 13.sp, modifier = Modifier.weight(1f))
        // PC 0.70: la parola del PC con il suo colore, prima della frase.
        f?.vista?.let { Text("${it.parola} · ", color = coloreVista(it.colore), fontSize = 12.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) }
        Text(fraseFinestra(f, quando), color = Banco.testoQuieto, fontSize = 12.sp)
    }
    Spacer(Modifier.height(4.dp))
    Box(Modifier.fillMaxWidth().height(8.dp).background(Banco.chassisAlto, RoundedCornerShape(4.dp))) {
        Box(Modifier.fillMaxWidth(p / 100f).height(8.dp).background(colore, RoundedCornerShape(4.dp)))
    }
}

@Composable
internal fun QuotaRiga(nome: String, q: Quota) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(nome, color = Banco.testo, modifier = Modifier.width(90.dp))
        Text(
            "↑${tokenBrevi(q.ingresso)}  ↓${tokenBrevi(q.uscita)}  ⟳${tokenBrevi(q.cache)}  · ${q.chat} chat",
            color = Banco.testoQuieto,
            fontSize = 13.sp
        )
    }
}

/**
 * Quando sono stati letti i limiti: «alle 14:20» se è oggi, «ieri alle 14:20»,
 * altrimenti con la data. Prima era sempre «alle HH:mm», e un numero di tre
 * giorni fa sembrava di adesso.
 */
/**
 * La frase di una finestra del piano: quella del computer quando c'e' (dalla
 * 0.37, con «letto N minuti fa», «azzerata, in attesa…», «lettura vecchia»),
 * altrimenti come prima.
 */
fun fraseFinestra(f: Finestra?, quando: String = ""): String = when {
    f == null -> "non ancora letta"
    !f.etichetta.isNullOrBlank() -> f.etichetta
    else -> "${f.percento.toInt().coerceIn(0, 100)}% usato$quando"
}

/** «Portfolio · Opus 5: 42% · 84k di 200k token», con la frase del computer. */
fun rigaContesto(c: ChatConsumo): String {
    val nome = c.titolo?.ifBlank { null } ?: c.sessione.take(8)
    val modello = c.modello?.let { " · $it" } ?: ""
    val parola = c.vista?.let { "${it.parola} · " } ?: ""
    return "$nome$modello: $parola${c.contestoEtichetta ?: c.contesto?.let { "${it.percento}%" } ?: "contesto non ancora letto"}"
}

fun quandoLetti(letti: Long, adesso: Long, zona: java.util.TimeZone = java.util.TimeZone.getDefault()): String {
    val cal = { t: Long -> java.util.Calendar.getInstance(zona).apply { timeInMillis = t } }
    val l = cal(letti); val a = cal(adesso)
    val ora = java.text.SimpleDateFormat("HH:mm", java.util.Locale.ITALY).apply { timeZone = zona }.format(java.util.Date(letti))
    val stessoGiorno = { x: java.util.Calendar, y: java.util.Calendar -> x.get(java.util.Calendar.YEAR) == y.get(java.util.Calendar.YEAR) && x.get(java.util.Calendar.DAY_OF_YEAR) == y.get(java.util.Calendar.DAY_OF_YEAR) }
    if (stessoGiorno(l, a)) return "alle $ora"
    val ieri = cal(adesso).apply { add(java.util.Calendar.DAY_OF_YEAR, -1) }
    if (stessoGiorno(l, ieri)) return "ieri alle $ora"
    val data = java.text.SimpleDateFormat("d MMM", java.util.Locale.ITALY).apply { timeZone = zona }.format(java.util.Date(letti))
    return "il $data alle $ora (da allora nessuna chat aperta dal computer ha risposto)"
}
