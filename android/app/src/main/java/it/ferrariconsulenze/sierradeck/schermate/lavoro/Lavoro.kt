package it.ferrariconsulenze.sierradeck.schermate.lavoro

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.ferrariconsulenze.sierradeck.dati.CodaInvii
import it.ferrariconsulenze.sierradeck.nucleo.ComponiLavoro
import it.ferrariconsulenze.sierradeck.nucleo.Conversazione
import it.ferrariconsulenze.sierradeck.nucleo.DomandaLavoro
import it.ferrariconsulenze.sierradeck.nucleo.Linea
import it.ferrariconsulenze.sierradeck.nucleo.RegoleSchermate
import it.ferrariconsulenze.sierradeck.nucleo.SchedaWorkspace
import it.ferrariconsulenze.sierradeck.nucleo.Stato
import it.ferrariconsulenze.sierradeck.nucleo.VistaLavoro
import it.ferrariconsulenze.sierradeck.schermate.comune.BarraAvanzamento
import it.ferrariconsulenze.sierradeck.schermate.comune.CasellaScrivi
import it.ferrariconsulenze.sierradeck.schermate.comune.PalliniRuoli
import it.ferrariconsulenze.sierradeck.schermate.comune.SchedaDomandaNuova
import it.ferrariconsulenze.sierradeck.schermate.comune.Tessera
import it.ferrariconsulenze.sierradeck.schermate.comune.coloreTono
import it.ferrariconsulenze.sierradeck.schermate.comune.mettiInCoda
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * **Lavoro** (app 11/11): in cima chi ti chiede qualcosa, poi i workspace in
 * ordine (fermo › aspetta te › al lavoro › a riposo). Le domande arrivano da
 * `/api/domande`, rilette quando lo stato del PC cambia.
 *
 * [leggiDomande] è la chiamata al PC: fuori dalla schermata, così le foto la
 * sostituiscono con dati finti.
 */
@Composable
fun SchermataLavoro(
    pc: String,
    stato: Stato?, quando: Long, vecchia: Boolean,
    leggiDomande: suspend () -> List<Conversazione>?,
    onApriWorkspace: (String) -> Unit,
    onVersione: () -> Unit,
    evidenzia: String? = null,
    ora: () -> Long = System::currentTimeMillis
) {
    var conversazioni by remember(pc) { mutableStateOf<List<Conversazione>>(emptyList()) }
    val risposte = remember(pc) { mutableStateMapOf<String, String>() }
    // Le risposte ancora in viaggio restano «Hai risposto» anche riaprendo l'app.
    val invii = CodaInvii.pronta?.invii?.collectAsState()
    val inViaggio = invii?.value.orEmpty().filter { it.pc == pc && it.casella.startsWith("domanda:") }
        .associate { it.casella.removePrefix("domanda:") to it.testo }
    LaunchedEffect(pc, stato?.domandeInAttesa, quando) {
        leggiDomande()?.let { conversazioni = it }
    }
    val vista = ComponiLavoro.componi(stato, quando, vecchia, conversazioni, inViaggio + risposte, ora())
    var scriviTu by remember { mutableStateOf<DomandaLavoro?>(null) }
    var scriviA by remember { mutableStateOf(false) }

    fun rispondi(d: DomandaLavoro, testo: String) {
        val (rotta, corpo) = ComponiLavoro.strada(d.via, testo)
        if (mettiInCoda(pc, rotta, corpo, "domanda:${d.chiave}", testo)) risposte[d.chiave] = testo
    }

    CorpoLavoro(
        vista = vista,
        evidenzia = evidenzia,
        onRispondi = ::rispondi,
        onScriviTu = { scriviTu = it },
        onApriWorkspace = onApriWorkspace,
        onScriviA = { scriviA = true },
        onVersione = onVersione
    )

    scriviTu?.let { d ->
        DialogoScrivi(
            titolo = d.testo, casella = "domanda-libera:${d.chiave}", segnaposto = d.segnaposto,
            onManda = { t -> rispondi(d, t); scriviTu = null; true },
            onChiudi = { scriviTu = null }
        )
    }
    if (scriviA) DialogoScriviA(pc, vista.schede, onChiudi = { scriviA = false })
}

/** Il disegno di «Lavoro», da una [VistaLavoro] già pronta (lo usano anche le foto). */
@Composable
fun CorpoLavoro(
    vista: VistaLavoro,
    evidenzia: String? = null,
    onRispondi: (DomandaLavoro, String) -> Unit = { _, _ -> },
    onScriviTu: (DomandaLavoro) -> Unit = {},
    onApriWorkspace: (String) -> Unit = {},
    onScriviA: () -> Unit = {},
    onVersione: () -> Unit = {}
) {
    val elenco = rememberLazyListState()
    LaunchedEffect(evidenzia, vista.domande.size) {
        val i = vista.domande.indexOfFirst { it.chiave == evidenzia }
        if (i >= 0) elenco.animateScrollToItem(i + 1)
    }
    LazyColumn(
        Modifier.fillMaxSize(), state = elenco,
        contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item(key = "linea") { RigaLinea(vista) }
        vista.versionePronta?.let { v ->
            item(key = "versione") {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Versione $v pronta", style = MaterialTheme.typography.bodyLarge, color = Banco.accento, modifier = Modifier.weight(1f))
                    TextButton(onClick = onVersione, modifier = Modifier.heightIn(min = 48.dp)) { Text("Vedi") }
                }
            }
        }
        if (vista.domande.isNotEmpty()) {
            item(key = "titolo-domande") {
                Text("Ti chiedono · ${vista.domande.count { it.risposta == null }}", style = MaterialTheme.typography.titleMedium, color = Banco.ambra, fontWeight = FontWeight.SemiBold)
            }
            items(vista.domande, key = { "d-" + it.chiave }) { d ->
                SchedaDomandaNuova(d, onRispondi = { onRispondi(d, it) }, onScriviTu = { onScriviTu(d) })
            }
        }
        if (vista.nessunWorkspace) {
            item(key = "vuoto") {
                Text("Nessun workspace: creane uno dal PC.", style = MaterialTheme.typography.bodyLarge, color = Banco.testoQuieto, modifier = Modifier.padding(vertical = 24.dp))
            }
        } else {
            items(vista.schede, key = { "w-" + it.id }) { s -> SchedaWs(s) { onApriWorkspace(s.id) } }
            if (vista.schede.isNotEmpty()) item(key = "scrivi-a") {
                OutlinedButton(onClick = onScriviA, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Scrivi a un workspace") }
            }
        }
    }
}

@Composable
private fun RigaLinea(v: VistaLavoro) {
    when (v.linea) {
        Linea.COLLEGO -> Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            Spacer(Modifier.width(10.dp))
            Text("Mi collego…", style = MaterialTheme.typography.bodyMedium, color = Banco.testoQuieto)
        }
        Linea.VECCHI -> if (v.quando > 0) Text(
            "Vedo i dati delle ${SimpleDateFormat("HH:mm", Locale.ITALY).format(Date(v.quando))}",
            style = MaterialTheme.typography.labelMedium, color = Banco.ambra
        )
        Linea.OK -> {}
    }
}

@Composable
private fun SchedaWs(s: SchedaWorkspace, onClick: () -> Unit) {
    val colore = coloreTono(s.tono)
    Tessera(Modifier.fillMaxWidth(), onClick = onClick) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.nome, style = MaterialTheme.typography.labelLarge, color = Banco.testoQuieto, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (s.domande > 0) Text("${s.domande} per te", style = MaterialTheme.typography.labelLarge, color = Banco.ambra)
            }
            Text(s.frase, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = colore)
            s.percento?.let { BarraAvanzamento(it, colore) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { PalliniRuoli(s.ruoli) }
                RegoleSchermate.mancaCirca(s.mancaMin)?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = Banco.testoQuieto) }
            }
        }
    }
}

/** Una casella in un dialogo: per «Scrivi tu» e per «Scrivi a un workspace». */
@Composable
fun DialogoScrivi(titolo: String, casella: String, segnaposto: String, onManda: (String) -> Boolean, onChiudi: () -> Unit) {
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text(titolo, style = MaterialTheme.typography.titleMedium, maxLines = 3, overflow = TextOverflow.Ellipsis) },
        text = { CasellaScrivi(casella, segnaposto, onManda) },
        confirmButton = { TextButton(onClick = onChiudi) { Text("Chiudi") } }
    )
}

@Composable
private fun DialogoScriviA(pc: String, schede: List<SchedaWorkspace>, onChiudi: () -> Unit) {
    var scelto by remember { mutableStateOf<SchedaWorkspace?>(null) }
    val s = scelto
    if (s == null) {
        AlertDialog(
            onDismissRequest = onChiudi,
            title = { Text("A quale workspace?") },
            text = {
                Column {
                    for (w in schede) TextButton(onClick = { scelto = w }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                        Text(w.nome, modifier = Modifier.fillMaxWidth())
                    }
                }
            },
            confirmButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
        )
    } else {
        DialogoScrivi(
            titolo = "A ${s.nome}", casella = "ap:${s.id}", segnaposto = "Scrivi…",
            onManda = { t ->
                val corpo = buildJsonObject { put("autopilota", s.id); put("testo", t) }.toString()
                mettiInCoda(pc, "/api/autopilota/dialogo", corpo, "ap:${s.id}", t).also { if (it) onChiudi() }
            },
            onChiudi = onChiudi
        )
    }
}
