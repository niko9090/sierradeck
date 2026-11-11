package it.ferrariconsulenze.sierradeck.schermate.workspace

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.ferrariconsulenze.sierradeck.nucleo.AvanzamentoAutopilota
import it.ferrariconsulenze.sierradeck.nucleo.Battuta
import it.ferrariconsulenze.sierradeck.nucleo.ComponiWorkspace
import it.ferrariconsulenze.sierradeck.nucleo.RegoleSchermate
import it.ferrariconsulenze.sierradeck.nucleo.RigaChat
import it.ferrariconsulenze.sierradeck.nucleo.RigaChiLavora
import it.ferrariconsulenze.sierradeck.nucleo.RigaRichiesta
import it.ferrariconsulenze.sierradeck.nucleo.TestaWorkspace
import it.ferrariconsulenze.sierradeck.nucleo.VistaAttesa
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.BarraAvanzamento
import it.ferrariconsulenze.sierradeck.schermate.comune.CasellaScrivi
import it.ferrariconsulenze.sierradeck.schermate.comune.InviiInCoda
import it.ferrariconsulenze.sierradeck.schermate.comune.TastoScelta
import it.ferrariconsulenze.sierradeck.schermate.comune.coloreRuolo
import it.ferrariconsulenze.sierradeck.schermate.comune.coloreTono
import it.ferrariconsulenze.sierradeck.schermate.comune.mettiInCoda
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Le letture della pagina, fuori dalla schermata: le foto le danno finte. */
interface FonteWorkspace {
    suspend fun chat(): List<Battuta>?
    suspend fun avanzamento(): AvanzamentoAutopilota?
    suspend fun attesa(): VistaAttesa?
    /** Le righe di uno specialista, solo da leggere. */
    suspend fun specialista(id: String): List<String>?
    /** «Precedenza» (cima) o «Ferma»: true se il PC l'ha presa. */
    suspend fun mossa(id: String, mossa: String): Boolean
}

/** Una chat del workspace, per il «⋯». */
data class ChatDelWorkspace(val id: String, val titolo: String)

/**
 * **La pagina di un workspace** (app 11/11): due righe fisse in alto (frase,
 * barra, tempo), poi due linguette, «Chat» con l'autopilota e «Chi lavora».
 */
@Composable
fun SchermataWorkspace(
    pc: String,
    id: String,
    testa: TestaWorkspace,
    /** Cambia quando cambia lo stato del PC: le letture si rifanno. */
    battito: Long,
    fonte: FonteWorkspace,
    chats: List<ChatDelWorkspace>,
    onApriChat: (String) -> Unit,
    onIndietro: () -> Unit,
    ora: () -> Long = System::currentTimeMillis
) {
    var battute by remember(id) { mutableStateOf<List<Battuta>?>(null) }
    var avanzamento by remember(id) { mutableStateOf<AvanzamentoAutopilota?>(null) }
    var attesa by remember(id) { mutableStateOf<VistaAttesa?>(null) }
    val risposte = remember(id) { mutableStateMapOf<String, String>() }
    LaunchedEffect(id, battito) {
        fonte.chat()?.let { battute = it }
        fonte.avanzamento()?.let { avanzamento = it }
        fonte.attesa()?.let { attesa = it }
    }
    val righe = ComponiWorkspace.chat(battute.orEmpty(), ora())
    val chi = ComponiWorkspace.chiLavora(testa.nome, attesa, avanzamento?.orchestratore)
    val richieste = ComponiWorkspace.richieste(avanzamento?.coda)

    CorpoWorkspace(
        pc = pc, id = id, testa = testa.copy(perche = testa.perche ?: avanzamento?.calo?.let { it.percheParole ?: it.perche }),
        righe = righe, caricata = battute != null, chi = chi, richieste = richieste, chats = chats,
        risposte = risposte,
        onRispondi = { idDomanda, testo ->
            val corpo = buildJsonObject { put("domanda", idDomanda); put("risposta", testo) }.toString()
            if (mettiInCoda(pc, "/api/rispondi", corpo, "domanda:$idDomanda", testo)) risposte[idDomanda] = testo
        },
        fonte = fonte, onApriChat = onApriChat, onIndietro = onIndietro
    )
}

@Composable
fun CorpoWorkspace(
    pc: String,
    id: String,
    testa: TestaWorkspace,
    righe: List<RigaChat>,
    caricata: Boolean,
    chi: List<RigaChiLavora>,
    richieste: List<RigaRichiesta>,
    chats: List<ChatDelWorkspace>,
    risposte: Map<String, String> = emptyMap(),
    onRispondi: (String, String) -> Unit = { _, _ -> },
    fonte: FonteWorkspace? = null,
    onApriChat: (String) -> Unit = {},
    onIndietro: () -> Unit = {},
    linguettaIniziale: Int = 0
) {
    var linguetta by rememberSaveable(id) { mutableStateOf(linguettaIniziale) }
    var guarda by remember(id) { mutableStateOf<RigaChiLavora?>(null) }
    Column(Modifier.fillMaxSize()) {
        Intestazione(testa, chats, onApriChat, onIndietro)
        TabRow(selectedTabIndex = linguetta, containerColor = Banco.chassis, contentColor = Banco.accento) {
            Tab(selected = linguetta == 0, onClick = { linguetta = 0 }, text = { Text("Chat") }, modifier = Modifier.heightIn(min = 48.dp))
            Tab(selected = linguetta == 1, onClick = { linguetta = 1 }, text = { Text("Chi lavora · ${chi.count { it.alLavoro }}") }, modifier = Modifier.heightIn(min = 48.dp))
        }
        Box(Modifier.weight(1f)) {
            if (linguetta == 0) LinguettaChat(righe, caricata, risposte, onRispondi, casella = "ap:$id")
            else LinguettaChiLavora(chi, richieste, fonte, onGuarda = { guarda = it })
        }
        if (linguetta == 0) CasellaScrivi(
            casella = "ap:$id", segnaposto = "Scrivi all’autopilota…",
            onManda = { t ->
                val corpo = buildJsonObject { put("autopilota", id); put("testo", t) }.toString()
                mettiInCoda(pc, "/api/autopilota/dialogo", corpo, "ap:$id", t)
            },
            modifier = Modifier.imePadding()
        )
    }
    guarda?.let { g -> if (fonte != null) Specialista(g, fonte) { guarda = null } }
}

@Composable
private fun Intestazione(t: TestaWorkspace, chats: List<ChatDelWorkspace>, onApriChat: (String) -> Unit, onIndietro: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val colore = coloreTono(t.tono)
    Column(Modifier.fillMaxWidth().background(Banco.chassis).padding(end = 4.dp, bottom = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onIndietro) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Indietro") }
            Column(Modifier.weight(1f)) {
                Text(t.nome, style = MaterialTheme.typography.labelMedium, color = Banco.testoQuieto, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(t.frase, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = colore, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Altro") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    if (chats.isEmpty()) DropdownMenuItem(text = { Text("Nessuna chat in questo workspace") }, onClick = { menu = false }, enabled = false)
                    for (c in chats) DropdownMenuItem(text = { Text(c.titolo, maxLines = 1, overflow = TextOverflow.Ellipsis) }, onClick = { menu = false; onApriChat(c.id) })
                }
            }
        }
        Row(Modifier.padding(start = 16.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { t.percento?.let { BarraAvanzamento(it, colore) } }
            t.percento?.let { Text(" $it%", style = MaterialTheme.typography.labelMedium, color = Banco.testo) }
            RegoleSchermate.mancaCirca(t.mancaMin)?.let { Text(" · $it", style = MaterialTheme.typography.labelMedium, color = Banco.testoQuieto) }
            if (t.percento != null) Aiuto(
                "La percentuale è quanto del lavoro chiesto è già fatto e unito." + (t.perche?.let { "\n\nUltimo cambio: $it" } ?: ""),
                di = "la percentuale"
            )
        }
    }
}

@Composable
private fun LinguettaChat(righe: List<RigaChat>, caricata: Boolean, risposte: Map<String, String>, onRispondi: (String, String) -> Unit, casella: String) {
    val elenco = rememberLazyListState()
    LaunchedEffect(righe.size) { if (righe.isNotEmpty()) elenco.scrollToItem(righe.size) }
    LazyColumn(Modifier.fillMaxSize(), state = elenco, contentPadding = PaddingValues(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (caricata && righe.isEmpty()) item { Text("Ancora niente: scrivigli cosa vuoi fare.", color = Banco.testoQuieto, modifier = Modifier.padding(16.dp)) }
        if (!caricata) item { Text("Leggo la chat…", color = Banco.testoQuieto, modifier = Modifier.padding(16.dp)) }
        items(righe, key = { it.chiave }) { r -> RigaDiChat(r, risposte, onRispondi) }
        item(key = "coda") { InviiInCoda(casella) }
    }
}

@Composable
private fun RigaDiChat(r: RigaChat, risposte: Map<String, String>, onRispondi: (String, String) -> Unit) {
    when (r) {
        is RigaChat.Bolla -> Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = if (r.tua) Arrangement.End else Arrangement.Start) {
            SelectionContainer {
                Text(r.testo, color = Banco.testo, style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.widthIn(max = 320.dp).clip(RoundedCornerShape(14.dp))
                        .background(if (r.tua) Banco.accentoTenue else Banco.chassis).padding(12.dp))
            }
        }
        is RigaChat.Traguardo -> Text("✓ " + r.testo, style = MaterialTheme.typography.bodySmall, color = Banco.verde, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 16.dp))
        is RigaChat.Decisa -> Column(Modifier.padding(horizontal = 16.dp)) {
            Text(r.testo, style = MaterialTheme.typography.bodySmall, color = Banco.testoQuieto, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(r.riga, style = MaterialTheme.typography.bodySmall, color = Banco.testo)
        }
        is RigaChat.Successo -> {
            var aperta by remember(r.chiave) { mutableStateOf(false) }
            Column(Modifier.padding(horizontal = 16.dp)) {
                TextButton(onClick = { aperta = !aperta }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text((if (aperta) "▾ " else "▸ ") + "Cosa è successo · ${r.note.size}", color = Banco.testoQuieto)
                }
                if (aperta) SelectionContainer { Text(r.note.joinToString("\n"), style = MaterialTheme.typography.bodySmall, color = Banco.testoQuieto) }
            }
        }
        is RigaChat.Domanda -> {
            val colore = if (r.rischiosa) Banco.rosso else Banco.ambra
            Column(
                Modifier.padding(horizontal = 12.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(colore.copy(alpha = 0.14f)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(r.testo, color = Banco.testo, style = MaterialTheme.typography.bodyLarge)
                val data = risposte[r.id]
                if (data != null) Text("Hai risposto: $data", color = Banco.verde, style = MaterialTheme.typography.bodyMedium)
                else {
                    for (s in r.scelte) TastoScelta(s, largo = true) { onRispondi(r.id, s.testo) }
                    r.rigaSotto?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colore) }
                }
            }
        }
    }
}

@Composable
private fun LinguettaChiLavora(chi: List<RigaChiLavora>, richieste: List<RigaRichiesta>, fonte: FonteWorkspace?, onGuarda: (RigaChiLavora) -> Unit) {
    var conferma by remember { mutableStateOf<Pair<RigaChiLavora, String>?>(null) }
    var esito by remember { mutableStateOf<String?>(null) }
    val ambito = rememberCoroutineScope()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (chi.isEmpty()) item { Text("Adesso non lavora nessuno.", color = Banco.testoQuieto) }
        items(chi, key = { "c-" + it.id }) { r ->
            RigaChi(r, onClick = { onGuarda(r) }, onPrecedenza = { conferma = r to "cima" }, onFerma = { conferma = r to "ferma" })
        }
        esito?.let { item { Text(it, color = Banco.testoQuieto, style = MaterialTheme.typography.bodySmall) } }
        if (richieste.isNotEmpty()) {
            item { Text("Le tue richieste", style = MaterialTheme.typography.titleSmall, color = Banco.testo, modifier = Modifier.padding(top = 12.dp)) }
            items(richieste, key = { "r-" + it.id }) { q ->
                Column(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(q.titolo, color = Banco.testo, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(q.stato, color = Banco.testoQuieto, style = MaterialTheme.typography.labelMedium)
                    }
                    BarraAvanzamento(q.percento)
                }
            }
        }
    }
    conferma?.let { (r, mossa) ->
        val nome = if (mossa == "cima") "Dare la precedenza" else "Fermare"
        AlertDialog(
            onDismissRequest = { conferma = null },
            title = { Text("$nome a «${r.titolo}»?") },
            text = { Text(if (mossa == "cima") "Passa davanti agli altri in fila." else "Si ferma; puoi farlo ripartire dal PC.") },
            confirmButton = {
                Button(onClick = {
                    conferma = null
                    ambito.launch { esito = if (fonte?.mossa(r.id, mossa) == true) "Fatto." else RegoleSchermate.fraseErrore(it.ferrariconsulenze.sierradeck.nucleo.TipoErrore.RETE) }
                }) { Text(if (mossa == "cima") "Precedenza" else "Ferma") }
            },
            dismissButton = { TextButton(onClick = { conferma = null }) { Text("Annulla") } }
        )
    }
}

@Composable
private fun RigaChi(r: RigaChiLavora, onClick: () -> Unit, onPrecedenza: () -> Unit, onFerma: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val colore = coloreRuolo(r.colore, r.ruolo)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Banco.chassis), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).heightIn(min = 56.dp).padding(12.dp).let { m -> m }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(colore))
                Spacer(Modifier.width(8.dp))
                Text(r.ruolo, style = MaterialTheme.typography.labelLarge, color = colore)
                Spacer(Modifier.width(8.dp))
                Text(r.stato, style = MaterialTheme.typography.labelMedium, color = Banco.testoQuieto)
            }
            TextButton(onClick = onClick, contentPadding = PaddingValues(0.dp)) {
                Text(r.titolo, style = MaterialTheme.typography.bodyMedium, color = Banco.testo, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.fillMaxWidth())
            }
            r.percento?.let { BarraAvanzamento(it, colore) }
        }
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Altro per ${r.titolo}") }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                if (!r.alLavoro) DropdownMenuItem(text = { Text("Precedenza") }, onClick = { menu = false; onPrecedenza() })
                DropdownMenuItem(text = { Text("Ferma") }, onClick = { menu = false; onFerma() })
            }
        }
    }
}

/** La chat di uno specialista, solo da leggere. */
@Composable
private fun Specialista(r: RigaChiLavora, fonte: FonteWorkspace, onChiudi: () -> Unit) {
    var righe by remember(r.id) { mutableStateOf<List<String>?>(null) }
    LaunchedEffect(r.id) { righe = fonte.specialista(r.id) ?: emptyList() }
    BackHandler(onBack = onChiudi)
    Column(Modifier.fillMaxSize().background(Banco.fondo)) {
        Row(Modifier.fillMaxWidth().background(Banco.chassis), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onChiudi) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Indietro") }
            Column(Modifier.weight(1f)) {
                Text(r.ruolo, style = MaterialTheme.typography.labelMedium, color = coloreRuolo(r.colore, r.ruolo))
                Text(r.titolo, style = MaterialTheme.typography.titleSmall, color = Banco.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        val l = righe
        if (l == null) Text("Leggo…", color = Banco.testoQuieto, modifier = Modifier.padding(16.dp))
        else if (l.isEmpty()) Text("Non ha ancora scritto niente.", color = Banco.testoQuieto, modifier = Modifier.padding(16.dp))
        else SelectionContainer {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(l) { Text(it, style = MaterialTheme.typography.bodySmall, color = Banco.testo) }
            }
        }
    }
}
