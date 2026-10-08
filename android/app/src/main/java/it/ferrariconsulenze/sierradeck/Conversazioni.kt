package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * Come si risponde a una conversazione: il percorso e il corpo, uguali al PC e
 * alla pagina (`richiestaRisposta` in `shared/domande-conversazioni.ts`).
 * Pura: si prova senza Compose.
 */
fun richiestaRisposta(via: ViaRisposta, testo: String): Pair<String, Map<String, String>> = when (via.via) {
    "rispondi" -> "/api/rispondi" to mapOf("domanda" to (via.domanda ?: ""), "risposta" to testo)
    "dialogo" -> "/api/autopilota/dialogo" to mapOf("autopilota" to (via.autopilota ?: ""), "testo" to testo)
    else -> "/api/scrivi" to mapOf("chat" to (via.chat ?: ""), "testo" to testo)
}

/**
 * Quante domande aspettano te: il numero del computer (0.37.2), lo stesso del
 * tasto «Domande» del PC e della colonna. Da un computer piu' vecchio si conta
 * come prima, domande piu' scelte.
 */
fun domandeInAttesa(s: Stato): Int = s.domandeInAttesa ?: (s.domande.size + s.chat.count { it.chiede })

/**
 * La scheda Domande come conversazioni a messaggi (0.36.0).
 *
 * Nicholas (30/09): la scheda com'era non gli piaceva. Adesso e' una chat:
 * sopra chi ti scrive — gli autopiloti che chiedono, le chat che aspettano —
 * e sotto la conversazione aperta. Con un autopilota si parla con lui (la
 * stessa conversazione della sua scheda, con la domanda in fondo); con una chat
 * che aspetta e' lei a scrivere la domanda o il permesso, con le opzioni da
 * toccare, e si risponde da qui. Le compone il computer: PC, pagina e app
 * mostrano la stessa cosa.
 */
@Composable
fun VistaConversazioni(api: Api, elenco: List<Conversazione>, onRiletto: () -> Unit, onApriAutopilota: (String) -> Unit = {}) {
    var apertaChiave by remember { mutableStateOf<String?>(null) }
    val aperta = elenco.firstOrNull { it.chiave == apertaChiave } ?: elenco.first()
    // Quello che hai appena mandato, finche' il computer non lo rimette nel filo.
    val mandati = remember { mutableStateMapOf<String, List<String>>() }
    var testo by remember(aperta.chiave) { mutableStateOf("") }
    var nota by remember(aperta.chiave) { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val lista = rememberLazyListState()

    val inAttesa = (mandati[aperta.chiave] ?: emptyList())
        .filter { t -> aperta.messaggi.none { it.da == "tu" && (it.testo == t || it.testo == "scelto: $t") } }
    val quanti = aperta.messaggi.size + inAttesa.size
    LaunchedEffect(aperta.chiave, quanti) { if (quanti > 0) lista.animateScrollToItem(quanti - 1) }

    fun manda(azione: suspend () -> Unit, ricordo: String) {
        inCorso = true
        nota = null
        scope.launch {
            try {
                azione()
                mandati[aperta.chiave] = (mandati[aperta.chiave] ?: emptyList()) + ricordo
                testo = ""
                onRiletto()
            } catch (e: Exception) {
                nota = SceltaVista.rifiuto(e, "mandarlo")
            }
            inCorso = false
        }
    }

    Column(Modifier.fillMaxSize().background(Banco.fondo)) {
        // Chi ti scrive: una fila che scorre di lato, come le chat di un messaggero.
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).background(Banco.chassis).padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            for (c in elenco) {
                val sel = c.chiave == aperta.chiave
                Row(
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .border(if (sel) 2.dp else 1.dp, if (sel) Banco.accento else Banco.incisione, RoundedCornerShape(16.dp))
                        .clickable { apertaChiave = c.chiave }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(if (c.chiede) Banco.ambra else Banco.testoQuieto))
                    Spacer(Modifier.width(6.dp))
                    Text(titoloConSegno(c), color = if (c.suPc != null) ColoreRemoto else Banco.testo, fontSize = 13.sp, maxLines = 1, fontWeight = if (sel || c.suPc != null) FontWeight.Bold else FontWeight.Normal)
                }
            }
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
            Text(
                (if (aperta.tipo == "autopilota") "Autopilota · " else if (aperta.chiede) "Chat · aspetta che tu scelga · " else "Chat · ha finito il turno · ") + aperta.sotto,
                color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 2
            )
            // Le domande di un autopilota si rispondono nella sua scheda,
            // linguetta «Domande», una per volta (0.38.0).
            val ap = aperta.autopilota
            if (aperta.tipo == "autopilota" && ap != null) {
                Text(
                    "Ti aspetta con " + (if ((aperta.quante ?: 1) == 1) "una domanda" else "${aperta.quante} domande") +
                        ". Si rispondono nella sua scheda, linguetta «Domande», una per volta; dopo la risposta restano nella chat con lui.",
                    color = Banco.ambra, fontSize = 12.sp
                )
                Button(onClick = { onApriAutopilota(ap) }) { Text("Apri la sua linguetta Domande") }
            }
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp), state = lista) {
            items(aperta.messaggi) { m ->
                Messaggio(m, aperta, inCorso) { o ->
                    // Una chat: si sceglie nell'elenco del terminale. Un autopilota
                    // (domande iniziali, «Pubblico adesso?»): toccare un'opzione e'
                    // rispondere con quel testo.
                    val scelte = aperta.scelte
                    // «Type something.» (2.52.5): si scrive nel campo qui sotto.
                    if (scelte != null && o.libera) nota = SceltaVista.SCRIVI
                    else if (scelte != null) manda({ api.scegli(scelte.chat, o.testo) }, o.testo)
                    else manda({ api.rispondiConversazione(aperta.risposta, o.testo) }, o.testo)
                }
            }
            items(inAttesa) { t -> Messaggio(MessaggioConversazione(da = "tu", testo = t), aperta, true, "tu · mandato, aspetto il computer") {} }
        }
        Column(Modifier.fillMaxWidth().background(Banco.chassis).padding(10.dp)) {
            nota?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = testo,
                    onValueChange = { testo = it.take(50_000) },
                    placeholder = { Text(aperta.segnaposto, color = Banco.testoQuieto, fontSize = 13.sp) },
                    textStyle = LocalTextStyle.current.copy(fontSize = 14.sp, color = Banco.testo),
                    maxLines = 5,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Banco.accento,
                        unfocusedBorderColor = Banco.incisione,
                        focusedContainerColor = Banco.fondo,
                        unfocusedContainerColor = Banco.fondo,
                        focusedTextColor = Banco.testo,
                        unfocusedTextColor = Banco.testo
                    ),
                    modifier = Modifier.weight(1f)
                )
                Spacer(Modifier.width(8.dp))
                Button(
                    enabled = !inCorso && testo.isNotBlank(),
                    shape = MaterialTheme.shapes.small,
                    onClick = { val t = testo.trim(); manda({ api.rispondiConversazione(aperta.risposta, t) }, t) }
                ) { Text(if (inCorso) "…" else if (aperta.risposta.via == "rispondi") "Rispondi" else "Manda") }
            }
            Text(
                if (aperta.risposta.via == "rispondi") "La risposta arriva subito alla chat ferma." else "Arriva nella chat come se l’avessi scritto lì.",
                color = Banco.testoQuieto, fontSize = 11.sp
            )
        }
    }
}

/** Un messaggio: tuo a destra, suo a sinistra, una nota quieta; le opzioni da toccare sotto. */
@Composable
private fun Messaggio(m: MessaggioConversazione, c: Conversazione, occupato: Boolean, chi: String? = null, onOpzione: (Opzione) -> Unit) {
    if (m.da == "nota") {
        Text(
            (m.quando?.drop(11)?.take(5)?.let { "$it  " } ?: "") + m.testo,
            color = Banco.testoQuieto, fontSize = 11.sp, fontFamily = FontTerminale,
            modifier = Modifier.padding(vertical = 2.dp)
        )
        return
    }
    val tuo = m.da == "tu"
    val domanda = m.tono == "domanda"
    val forma = RoundedCornerShape(10.dp)
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = if (tuo) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier
                .fillMaxWidth(0.9f)
                .then(if (domanda) Modifier.border(1.dp, Banco.ambra, forma) else Modifier)
                .background(if (domanda) Banco.ambra.copy(alpha = 0.10f) else if (tuo) Banco.accento.copy(alpha = 0.12f) else Banco.verde.copy(alpha = 0.10f), forma)
                .padding(horizontal = 10.dp, vertical = 6.dp)
        ) {
            Text(
                chi ?: ((if (tuo) "tu" else c.titolo) + (m.quando?.drop(11)?.take(5)?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")),
                color = Banco.testoQuieto, fontSize = 11.sp
            )
            // Il testo si seleziona e si copia (tocco lungo).
            SelectionContainer { Text(m.testo, color = Banco.testo, fontSize = 14.sp) }
            val opzioni = m.opzioni
            if (!opzioni.isNullOrEmpty()) {
                Spacer(Modifier.height(6.dp))
                for (o in opzioni) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Banco.fondo)
                            .border(if (o.scelta) 2.dp else 1.dp, if (o.scelta) Banco.ambra else Banco.incisione, RoundedCornerShape(8.dp))
                            .clickable(enabled = !occupato) { onOpzione(o) }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TestoOpzione(o)
                    }
                }
            }
        }
    }
}
