package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Una riga del menu Specialisti nella chat dell'autopilota (stesse regole di `menu-specialisti.ts` del PC). */
data class RigaMenu(
    val id: String,
    val titolo: String,
    /** Da 0 a 95, solo per chi lavora. */
    val percentuale: Int?,
    val cosaFa: String,
    /** «mancano circa 12 min», «attesa circa 20 min», o vuoto. */
    val manca: String,
    val inRitardo: Boolean,
    /** Il nome del workspace, solo se non è quello della chat. */
    val altroWorkspace: String,
    val corrente: Boolean,
    val posizione: Int?,
    val prenotata: Boolean,
    val parcheggiata: Boolean,
    val fermaRichiesta: Boolean
)

data class MenuApp(val etichetta: String, val lavorano: List<RigaMenu>, val inFila: List<RigaMenu>, val totale: String)

object MenuSpecialisti {
    const val SPIEGAZIONE =
        "«↑ Precedenza» porta uno specialista in cima alla fila: prende il prossimo posto libero prima degli altri. " +
            "Non ferma mai chi sta già lavorando: cambia solo l’ordine di chi aspetta. «Ferma» invece interrompe chi lavora, " +
            "lo mette in cima alla fila e il suo lavoro resta salvato sul suo ramo; riparte per primo quando si libera un posto. " +
            "La percentuale è una stima, non arriva mai a 100 prima della fine."

    private fun norma(t: String): String = t.replace('\\', '/').trimEnd('/').removePrefix("cartella:").lowercase()

    private fun durata(min: Double): String {
        val m = maxOf(1, Math.round(min).toInt())
        if (m < 60) return "$m min"
        return "${m / 60} h" + if (m % 60 > 0) " ${m % 60} min" else ""
    }

    private fun corto(t: String): String {
        val s = t.replace(Regex("\\s+"), " ").trim()
        return if (s.length > 60) s.take(59).trimEnd() + "…" else s
    }

    private fun riga(
        id: String, workspace: String, wsNome: String?, compito: String?, descrizione: String, titolo: String?, cosaFa: String?,
        percentuale: Double?, minuti: Double?, inRitardo: Boolean, posizione: Int?, prenotata: Boolean, parcheggiata: Boolean,
        fermaRichiesta: Boolean, inAttesa: Boolean, miei: List<String>
    ): RigaMenu {
        val corrente = norma(workspace) in miei
        val base = titolo?.takeIf { it.isNotBlank() } ?: ((compito?.let { "$it: " } ?: "") + descrizione)
        return RigaMenu(
            id = id, titolo = corto(base),
            percentuale = if (!inAttesa && percentuale != null) Math.round(percentuale).toInt().coerceIn(0, 95) else null,
            cosaFa = cosaFa?.let { corto(it) } ?: "",
            manca = if (minuti == null) "" else (if (inAttesa) "attesa circa " else "mancano circa ") + durata(minuti),
            inRitardo = inRitardo,
            altroWorkspace = if (corrente) "" else (wsNome?.takeIf { it.isNotBlank() } ?: SpecialistiAttesa.nomeWorkspace(workspace)),
            corrente = corrente, posizione = if (inAttesa) posizione else null,
            prenotata = prenotata, parcheggiata = parcheggiata, fermaRichiesta = fermaRichiesta
        )
    }

    /** Il menu: prima chi lavora in questa chat (`riferimenti` = la chiave o la cartella del suo workspace), poi gli altri; la fila resta com'è. */
    fun menu(v: VistaAttesaApp, riferimenti: List<String>): MenuApp {
        val miei = riferimenti.filter { it.isNotEmpty() }.map { norma(it) }
        val tutti = v.alLavoro.map {
            riga(it.id, it.workspace, it.workspaceNome, it.compito, it.descrizione, it.titolo, it.cosaFa, it.percentuale, it.minutiStimati,
                it.inRitardo, null, false, false, it.fermaRichiesta, false, miei)
        }
        val lavorano = tutti.filter { it.corrente } + tutti.filter { !it.corrente }
        val inFila = v.inFila.map {
            riga(it.id, it.workspace, it.workspaceNome, it.compito, it.descrizione, it.titolo, it.cosaFa, null, it.minutiStimati,
                it.inRitardo, it.posizione, it.prenotata, it.parcheggiata, false, true, miei)
        }
        val etichetta = if (lavorano.isEmpty() && inFila.isEmpty()) "Specialisti · nessuno"
        else "Specialisti ${lavorano.size}" + if (inFila.isNotEmpty()) " · ${inFila.size} in fila" else ""
        val totale = v.totale?.takeIf { it.compiti > 0 }?.let { "circa ${durata(it.minuti)} per finire tutto" } ?: ""
        return MenuApp(etichetta, lavorano, inFila, totale)
    }
}

/**
 * Il tasto «Specialisti 2 · 1 in fila» in testa alla chat dell'autopilota e il suo
 * menu: chi lavora (percentuale, cosa fa, tempo), chi è in fila, il totale, e
 * per ognuno «↑ Precedenza» (non ferma mai nessuno) e «Ferma» (solo per chi lavora).
 * Rilegge la lista ogni 4 secondi a menu aperto, ogni 20 a menu chiuso.
 */
@Composable
fun MenuSpecialistiChat(api: Api, riferimenti: List<String>, modifier: Modifier = Modifier) {
    var aperto by remember { mutableStateOf(false) }
    var vista by remember { mutableStateOf<VistaAttesaApp?>(null) }
    var vecchio by remember { mutableStateOf(false) }
    var avviso by remember { mutableStateOf<String?>(null) }
    var daFermare by remember { mutableStateOf<RigaMenu?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(aperto) {
        while (isActive) {
            try {
                val v = api.attesaSpecialisti()
                vecchio = v.posti.tetto <= 0
                vista = v; avviso = null
            } catch (_: Exception) { if (aperto) avviso = SpecialistiAttesa.avvisoRete(false) }
            Davanti.pausa(if (aperto) 4_000 else 20_000)
        }
    }
    fun mossa(chiamata: suspend () -> VistaAttesaApp) {
        scope.launch {
            try { vista = chiamata(); avviso = null } catch (_: Exception) {
                avviso = SpecialistiAttesa.avvisoRete(true)
                try { vista = api.attesaSpecialisti() } catch (_: Exception) { }
            }
        }
    }

    val v = vista
    val m = if (v == null || vecchio) null else MenuSpecialisti.menu(v, riferimenti)
    TextButton(onClick = { aperto = true; daFermare = null }, modifier = modifier.heightIn(min = 48.dp)) {
        Text((m?.etichetta ?: "Specialisti") + " ▾", fontSize = 13.sp)
    }
    if (!aperto) return

    AlertDialog(
        onDismissRequest = { aperto = false; daFermare = null },
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Specialisti", fontWeight = FontWeight.Bold)
                Aiuto(MenuSpecialisti.SPIEGAZIONE, di = "Precedenza")
            }
        },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                if (v == null) Text(avviso ?: "Leggo la lista…", color = Banco.testoQuieto, fontSize = 14.sp)
                else if (m == null) Text("Serve la versione nuova del servizio sul computer.", color = Banco.testoQuieto, fontSize = 14.sp)
                else {
                    avviso?.let { Text(it, color = Banco.rosso, fontSize = 13.sp) }
                    Serigrafia("Al lavoro adesso")
                    if (m.lavorano.isEmpty()) Text("Nessuno al lavoro", color = Banco.testoQuieto, fontSize = 14.sp)
                    for (r in m.lavorano) RigaDelMenu(r, lavora = true, daFermare = daFermare?.id == r.id,
                        onPrecedenza = { mossa { api.attesaPriorita(r.id, "cima") } },
                        onFerma = { daFermare = r }, onSiFerma = { daFermare = null; mossa { api.attesaPriorita(r.id, "ferma") } },
                        onNoFerma = { daFermare = null })
                    Spacer(Modifier.height(8.dp))
                    Serigrafia("In fila")
                    if (m.inFila.isEmpty()) Text("Nessuno in fila", color = Banco.testoQuieto, fontSize = 14.sp)
                    for (r in m.inFila) RigaDelMenu(r, lavora = false, daFermare = false,
                        onPrecedenza = { mossa { api.attesaPriorita(r.id, "cima") } }, onFerma = {}, onSiFerma = {}, onNoFerma = {})
                    if (m.totale.isNotEmpty()) Text(m.totale, color = Banco.testo, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                }
            }
        },
        confirmButton = { TextButton(onClick = { aperto = false; daFermare = null }) { Text("Chiudi") } }
    )
}

@Composable
private fun RigaDelMenu(
    r: RigaMenu, lavora: Boolean, daFermare: Boolean,
    onPrecedenza: () -> Unit, onFerma: () -> Unit, onSiFerma: () -> Unit, onNoFerma: () -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(
            (r.posizione?.let { "$it° " } ?: "") + r.titolo + if (r.altroWorkspace.isNotEmpty()) " · ${r.altroWorkspace}" else "",
            color = Banco.testo, fontSize = 14.sp, fontWeight = if (r.corrente) FontWeight.Bold else FontWeight.Normal
        )
        r.percentuale?.let { p ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 3.dp)) {
                LinearProgressIndicator(progress = { p / 100f }, color = Banco.verde, trackColor = Banco.incisione, modifier = Modifier.weight(1f).height(6.dp))
                Text("  $p%", color = Banco.testo, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        if (r.cosaFa.isNotEmpty()) Text(r.cosaFa, color = Banco.testoQuieto, fontSize = 13.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        val sotto = listOfNotNull(
            r.manca.ifEmpty { null }, if (r.inRitardo) "in ritardo" else null, if (r.prenotata) "tocca a lui" else null,
            if (r.parcheggiata) "fermato, riparte per primo" else null, if (r.fermaRichiesta) "fermata chiesta…" else null
        ).joinToString(" · ")
        if (sotto.isNotEmpty()) Text(sotto, color = if (r.inRitardo || r.prenotata) Banco.ambra else Banco.testoQuieto, fontSize = 13.sp)
        if (daFermare) {
            Text("Lo fermo e lo metto in cima alla fila: il suo lavoro resta salvato.", color = Banco.ambra, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = onSiFerma) { Text("Sì, ferma") }
                OutlinedButton(onClick = onNoFerma) { Text("No") }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = onPrecedenza, enabled = lavora || r.posizione != 1) { Text("↑ Precedenza") }
                if (lavora && !r.fermaRichiesta) OutlinedButton(onClick = onFerma) { Text("Ferma") }
            }
        }
    }
}
