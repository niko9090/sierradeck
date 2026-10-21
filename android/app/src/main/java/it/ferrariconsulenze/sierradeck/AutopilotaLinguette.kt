package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
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

// Le linguette Domande e File di un autopilota, e il suo Quaderno.
// Spostate così com'erano da Lavori.kt nella 0.83.0.

/** Il quaderno di una cartella: le schede lasciate dalle chat e dagli autopiloti. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun Quaderno(api: Api, cwd: String, onChiudi: () -> Unit) {
    var schede by remember { mutableStateOf<List<SchedaBreve>?>(null) }
    var aperta by remember { mutableStateOf<SchedaPiena?>(null) }
    // PC 0.70: la ricerca e il tag scelto, come sul PC.
    var domanda by remember { mutableStateOf("") }
    var tagScelto by remember { mutableStateOf<String?>(null) }
    // «Nessuna scheda» e «non riesco a leggerle» sono due cose diverse: prima
    // un 403 (cartella non conosciuta) si leggeva come un quaderno vuoto.
    var guasto by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(cwd) {
        schede = try { api.quaderno(cwd).schede } catch (e: Exception) {
            guasto = if (e is Api.Errore) Nota.spiega(e, "leggere il quaderno") else "Non sono riuscito a leggere il quaderno: ${e.message ?: "il computer non risponde"}"
            emptyList()
        }
    }

    AlertDialog(
        onDismissRequest = { if (aperta != null) aperta = null else onChiudi() },
        title = { Text(aperta?.titolo?.ifBlank { "Quaderno" } ?: "Quaderno") },
        text = {
            Column(Modifier.fillMaxWidth().height(380.dp).verticalScroll(rememberScrollState())) {
                val ap = aperta
                if (ap != null) {
                    Text(QuadernoVista.quandoBreve(ap.quando, java.time.Instant.now()), color = Banco.testoQuieto, fontSize = 11.sp)
                    Text(ap.corpo, color = Banco.testo, fontSize = 13.sp)
                } else when {
                    guasto != null -> Text(guasto!!, color = Banco.ambra, fontSize = 13.sp)
                    schede == null -> Text("Carico…", color = Banco.testoQuieto)
                    schede!!.isEmpty() -> Text("Nessuna scheda in questa cartella: il quaderno (.sierradeck/quaderno) si riempie quando le chat annotano decisioni, vincoli ed errori risolti.", color = Banco.testoQuieto)
                    else -> {
                        val tutte = schede!!
                        OutlinedTextField(value = domanda, onValueChange = { domanda = it }, singleLine = true,
                            placeholder = { Text("Cerca fra le schede", fontSize = 13.sp) }, modifier = Modifier.fillMaxWidth())
                        val tags = QuadernoVista.tuttiITag(tutte)
                        if (tags.isNotEmpty()) {
                            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                androidx.compose.material3.FilterChip(selected = tagScelto == null, onClick = { tagScelto = null }, label = { Text("Tutte ${tutte.size}") })
                                for ((t, n) in tags) {
                                    androidx.compose.material3.FilterChip(selected = tagScelto == t, onClick = { tagScelto = if (tagScelto == t) null else t }, label = { Text("$t $n") })
                                }
                            }
                        }
                        val ora = java.time.Instant.now()
                        val viste = QuadernoVista.filtra(tutte, domanda, tagScelto)
                        if (viste.isEmpty()) Text("Nessuna scheda per questa ricerca.", color = Banco.testoQuieto, fontSize = 13.sp)
                        for (s in viste) {
                            Column(Modifier.fillMaxWidth().clickable {
                                scope.launch { aperta = tenta("aprire la scheda del quaderno") { api.scheda(cwd, s.file) } }
                            }.padding(vertical = 8.dp)) {
                                Text(s.titolo.ifBlank { s.file }, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                if (s.assaggio.isNotBlank()) Text(s.assaggio, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
                                Text((listOf(QuadernoVista.quandoBreve(s.quando, ora)) + s.tag).joinToString(" · "), color = Banco.testoQuieto, fontSize = 11.sp)
                            }
                            HorizontalDivider(color = Banco.incisione)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = { if (aperta != null) aperta = null else onChiudi() }) {
                Text(if (aperta != null) "Indietro" else "Chiudi")
            }
        }
    )
}

/**
 * La linguetta «Domande» (0.38.0): una domanda per volta, con il testo intero,
 * le opzioni da toccare, la casella libera e «1 di N». Dopo la risposta,
 * domanda e risposta entrano nella chat qui sopra.
 */
@Composable
internal fun LinguettaDomande(api: Api, autopilota: String, schede: List<DomandaScheda>, onRisposto: () -> Unit) {
    var indice by remember { mutableStateOf(0) }
    var testo by remember { mutableStateOf("") }
    var nota by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    if (schede.isEmpty()) {
        Text("Nessuna domanda aperta: quando te ne fa una, compare qui.", color = Banco.testoQuieto, fontSize = 13.sp)
        return
    }
    val i = indice.coerceIn(0, schede.size - 1)
    val d = schede[i]
    fun manda(r: String) {
        if (r.isBlank() || inCorso) return
        inCorso = true
        nota = null
        scope.launch {
            try { api.rispondiScheda(d, autopilota, r.trim()); testo = ""; indice = 0; onRisposto() }
            catch (e: Exception) { nota = "Non sono riuscito a rispondere: ${e.message ?: "il computer non risponde"}" }
            inCorso = false
        }
    }
    // PC 0.72.1: la domanda essenziale (la frase, i tasti, il resto nel «?»).
    val scheda = d.scheda
    if (scheda != null) {
        if (schede.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(enabled = i > 0, onClick = { indice = i - 1 }) { Text("‹ prima") }
            Text("${i + 1} di ${schede.size}", color = Banco.testoQuieto, fontSize = 12.sp)
            TextButton(enabled = i < schede.size - 1, onClick = { indice = i + 1 }) { Text("dopo ›") }
        }
        SchedaDomandaVista(scheda, inCorso, if (d.tipo == "via") "Manda" else "Rispondi", onScelta = { manda(it.testo) }, onScrivi = { manda(it) })
        nota?.let { Text(it, color = Banco.rosso, fontSize = 12.sp) }
        return
    }
    Text(etichettaOrigine(d) + if (schede.size > 1) " · ${i + 1} di ${schede.size}" else "", color = Banco.testoQuieto, fontSize = 12.sp)
    if (schede.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(enabled = i > 0, onClick = { indice = i - 1 }) { Text("‹ prima") }
        TextButton(enabled = i < schede.size - 1, onClick = { indice = i + 1 }) { Text("dopo ›") }
    }
    Spacer(Modifier.height(6.dp))
    Text(d.testo, color = Banco.testo, fontSize = 15.sp)
    if (d.opzioni.isNotEmpty()) {
        Spacer(Modifier.height(8.dp))
        for (o in d.opzioni) Button(enabled = !inCorso, onClick = { manda(o) }, modifier = Modifier.padding(vertical = 2.dp)) { Text(o) }
    }
    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        value = testo,
        onValueChange = { testo = it },
        label = { Text(if (d.tipo == "via") "Oppure scrivigli cosa cambiare" else "La tua risposta") },
        maxLines = 4,
        modifier = Modifier.fillMaxWidth()
    )
    TastoMicrofono(testo) { testo = it }
    Spacer(Modifier.height(4.dp))
    Button(enabled = testo.isNotBlank() && !inCorso, onClick = { manda(testo) }) { Text(if (inCorso) "Mando…" else if (d.tipo == "via") "Manda" else "Rispondi") }
    nota?.let { Text(it, color = Banco.rosso, fontSize = 12.sp) }
    Text(
        if (d.tipo == "via") "«Vai» lo fa partire; se scrivi altro gli arriva come messaggio."
        else "La risposta arriva subito all’autopilota; nella chat qui sopra restano domanda e risposta. Poi la prossima, o la linguetta si chiude.",
        color = Banco.testoQuieto, fontSize = 11.sp
    )
}

/**
 * La linguetta «File» (0.38.0): i file cambiati, per chat, con lo stato, le
 * righe e se sono gia' in commit; toccando un file, il diff. Solo lettura.
 */
@Composable
internal fun LinguettaFile(api: Api, autopilota: String) {
    var file by remember(autopilota) { mutableStateOf<FileAutopilota?>(null) }
    var guasto by remember(autopilota) { mutableStateOf<String?>(null) }
    var scelto by remember(autopilota) { mutableStateOf<Pair<String, String>?>(null) }
    var diff by remember(autopilota) { mutableStateOf<String?>(null) }
    // Un computer piu' vecchio della 0.38.0 non ha i file: si dice, senza chiedere.
    val spenta = FunzioniPc.disponibile(FunzionePc.FILE_AUTOPILOTA, PcCorrente.versione) == false
    LaunchedEffect(autopilota, spenta) {
        if (spenta) { guasto = FunzioniPc.testoMancante(FunzionePc.FILE_AUTOPILOTA); return@LaunchedEffect }
        while (isActive) {
            try { file = api.fileAutopilota(autopilota); guasto = null } catch (e: Exception) {
                guasto = FunzioniPc.spiega(e, FunzionePc.FILE_AUTOPILOTA)
            }
            Davanti.pausa(4000)
        }
    }
    LaunchedEffect(scelto) {
        val s = scelto ?: return@LaunchedEffect
        diff = null
        diff = try { api.diffAutopilota(autopilota, s.first, s.second).diff } catch (e: Exception) { "⚠ ${e.message ?: "diff non disponibile"}" }
    }
    RigaConAiuto("I file che ha cambiato: tocca un file per vedere le righe.", "I file che ha cambiato, per la cartella del progetto e per il worktree di ogni sua chat. Tocca un file per vedere le righe tolte e aggiunte. Qui si guarda soltanto.")
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    val f = file
    if (f == null && guasto == null) Text("Leggo i file…", color = Banco.testoQuieto, fontSize = 13.sp)
    f?.gruppi?.forEach { g ->
        Spacer(Modifier.height(8.dp))
        Etichetta(g.nome.uppercase() + (g.ramo?.let { " · $it" } ?: ""))
        Text("Confronto ${g.base}", color = Banco.testoQuieto, fontSize = 11.sp)
        g.errore?.let { Text("⚠ $it", color = Banco.ambra, fontSize = 12.sp) }
        if (g.errore == null && g.file.isEmpty()) Text("Nessun file cambiato.", color = Banco.testoQuieto, fontSize = 12.sp)
        for (x in g.file) {
            Column(Modifier.fillMaxWidth().clickable { scelto = if (scelto == g.chiave to x.percorso) null else g.chiave to x.percorso }.padding(vertical = 4.dp)) {
                Text(x.percorso, color = Banco.testo, fontSize = 13.sp)
                Text(rigaFile(x), color = if (x.salvato) Banco.testoQuieto else Banco.ambra, fontSize = 11.sp)
            }
        }
    }
    val s = scelto
    if (s != null) {
        Spacer(Modifier.height(8.dp))
        Etichetta(s.second)
        val t = diff
        if (t == null) Text("Leggo il diff…", color = Banco.testoQuieto, fontSize = 12.sp)
        else for (r in righeDiff(t)) Text(
            r.testo,
            color = when (r.tipo) { "piu" -> Banco.verde; "meno" -> Banco.rosso; "testa", "blocco" -> Banco.testoQuieto; else -> Banco.testo },
            fontSize = 11.sp,
            fontFamily = FontTerminale
        )
    }
}
