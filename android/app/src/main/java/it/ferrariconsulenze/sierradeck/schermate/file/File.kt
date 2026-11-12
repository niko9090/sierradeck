package it.ferrariconsulenze.sierradeck.schermate.file

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import it.ferrariconsulenze.sierradeck.dati.CodaFile
import it.ferrariconsulenze.sierradeck.dati.Telefono
import it.ferrariconsulenze.sierradeck.nucleo.Allegati
import it.ferrariconsulenze.sierradeck.nucleo.FileVista
import it.ferrariconsulenze.sierradeck.nucleo.SchedaWorkspace
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.BarraAvanzamento
import it.ferrariconsulenze.sierradeck.schermate.comune.Tessera
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.sottofondo.Ricevuti
import it.ferrariconsulenze.sierradeck.sottofondo.RicevitoreConsegne
import it.ferrariconsulenze.sierradeck.sottofondo.Ricevuto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Un file appena scelto dal telefono, prima di sapere dove va. */
data class FileDaMandare(val uri: Uri, val nome: String, val byte: Long)

/**
 * **File** (app 11/11): in cima «Manda un file» (scegli il file, poi il
 * workspace, con i recenti per primi, poi conferma); sotto quelli in viaggio
 * con la barra (ripartono da soli) e i ricevuti dal PC con Apri, Salva e
 * Condividi. «Sfoglia i PC» sta dietro un tasto.
 */
@Composable
fun SchermataFile(
    pc: String,
    workspace: List<SchedaWorkspace>,
    sfoglia: @Composable () -> Unit
) {
    val contesto = LocalContext.current
    var aperto by rememberSaveable { mutableStateOf(false) }
    if (aperto) {
        BackHandler { aperto = false }
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().background(Banco.chassis), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { aperto = false }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Indietro") }
                Text("Sfoglia i PC", style = MaterialTheme.typography.titleMedium, color = Banco.testo)
            }
            sfoglia()
        }
        return
    }
    var scelto by remember { mutableStateOf<FileDaMandare?>(null) }
    val prendi = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { u -> if (u != null) scelto = leggi(contesto, u) }
    val inViaggio = CodaFile.pronta?.voci?.collectAsState()?.value.orEmpty().filter { it.pc == pc }
    val ricevuti = remember(Ricevuti.versione) { Ricevuti.elenca(contesto) }
    CorpoFile(
        inViaggio = inViaggio, ricevuti = ricevuti,
        onManda = { prendi.launch("*/*") },
        onSfoglia = { aperto = true }
    )
    scelto?.let { f -> DialogoDestinazione(pc, f, workspace) { scelto = null } }
}

@Composable
fun CorpoFile(
    inViaggio: List<CodaFile.Voce>,
    ricevuti: List<Ricevuto>,
    onManda: () -> Unit = {},
    onSfoglia: () -> Unit = {}
) {
    val contesto = LocalContext.current
    val ambito = rememberCoroutineScope()
    var nota by remember { mutableStateOf<String?>(null) }
    var controllo by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item(key = "manda") {
            Button(onClick = onManda, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Manda un file") }
        }
        if (inViaggio.isNotEmpty()) {
            item(key = "t-viaggio") { Text("In viaggio", style = MaterialTheme.typography.titleSmall, color = Banco.testo, modifier = Modifier.padding(top = 8.dp)) }
            items(inViaggio, key = { "v-" + it.id }) { v -> RigaInViaggio(v) }
        }
        item(key = "t-ricevuti") {
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Ricevuti dal PC", style = MaterialTheme.typography.titleSmall, color = Banco.testo, modifier = Modifier.weight(1f))
                TextButton(onClick = {
                    if (controllo) return@TextButton
                    controllo = true
                    ambito.launch {
                        nota = try {
                            val (n, problemi) = RicevitoreConsegne.giro(contesto)
                            when { problemi.isNotEmpty() -> "Qualcosa non è arrivato."; n == 0 -> "Nessun file nuovo."; n == 1 -> "Arrivato 1 file."; else -> "Arrivati $n file." }
                        } catch (e: CancellationException) { throw e } catch (_: Exception) { "Il computer non risponde. Riprova fra poco." } finally { controllo = false }
                    }
                }) { Text(if (controllo) "Controllo…" else "Controlla") }
            }
        }
        nota?.let { item(key = "nota") { Text(it, style = MaterialTheme.typography.bodySmall, color = Banco.testoQuieto) } }
        if (ricevuti.isEmpty()) item(key = "vuoto") { Text("Nessun file ricevuto.", color = Banco.testoQuieto) }
        items(ricevuti, key = { "r-" + it.id + it.file }) { r ->
            RigaRicevuto(r, onNota = { nota = it })
        }
        item(key = "sfoglia") {
            HorizontalDivider(color = Banco.incisione, modifier = Modifier.padding(vertical = 8.dp))
            OutlinedButton(onClick = onSfoglia, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Sfoglia i PC") }
        }
    }
}

@Composable
private fun RigaInViaggio(v: CodaFile.Voce) {
    val coda = CodaFile.pronta
    val ambito = rememberCoroutineScope()
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(v.nome, fontWeight = FontWeight.SemiBold, color = Banco.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val (riga, colore) = when (v.stato) {
                "arrivato" -> "Arrivato a ${v.destNome}" to Banco.verde
                "rifiutato" -> "Il computer non l’ha preso" to Banco.rosso
                "invio" -> "Va a ${v.destNome} · ${v.percento}%" to Banco.testoQuieto
                else -> (if (v.messaggio != null) "In attesa del computer: riparte da solo" else "In coda per ${v.destNome}") to Banco.ambra
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(riga, style = MaterialTheme.typography.bodySmall, color = colore, modifier = Modifier.weight(1f))
                v.messaggio?.takeIf { v.stato != "arrivato" }?.let { Aiuto(it, di = "l’invio") }
            }
            if (v.stato == "invio" || (v.stato == "attesa" && v.fatti > 0)) BarraAvanzamento(v.percento)
            if (v.stato == "rifiutato" || v.stato == "arrivato") Row {
                if (v.stato == "rifiutato") TextButton(onClick = { coda?.riprova(v.id); Telefono.pronto?.let { t -> t.ambito.launch { coda?.svuota(v.pc) } } }) { Text("Riprova") }
                TextButton(onClick = { coda?.togli(v.id) }) { Text("Togli") }
            }
        }
    }
}

@Composable
private fun RigaRicevuto(r: Ricevuto, onNota: (String) -> Unit) {
    val contesto = LocalContext.current
    val ambito = rememberCoroutineScope()
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(r.nome, fontWeight = FontWeight.SemiBold, color = Banco.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("${FileVista.misura(r.byte)} · " + java.text.SimpleDateFormat("d MMM HH:mm", java.util.Locale.ITALIAN).format(java.util.Date(r.quando)),
                style = MaterialTheme.typography.bodySmall, color = Banco.testoQuieto)
            r.nota?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Banco.testo) }
            r.salvatoIn?.let { Text("Salvato in $it", style = MaterialTheme.typography.bodySmall, color = Banco.verde) }
            // Il tasto di testo ha 12 dp di margine: si rientra, così «Apri» sta sotto il nome.
            Row(Modifier.offset(x = (-12).dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { try { contesto.startActivity(Ricevuti.intentApri(contesto, r)) } catch (_: Exception) { onNota("Nessuna app sa aprire ${r.nome}: prova Condividi.") } }) { Text("Apri") }
                TextButton(onClick = { ambito.launch { onNota(withContext(Dispatchers.IO) { RicevitoreConsegne.salva(contesto, r.id) }) } }) { Text("Salva") }
                TextButton(onClick = { contesto.startActivity(Ricevuti.intentCondividi(contesto, r)) }) { Text("Condividi") }
            }
        }
    }
}

/** Dove va il file: un workspace (i recenti per primi), poi la conferma. */
@Composable
private fun DialogoDestinazione(pc: String, f: FileDaMandare, workspace: List<SchedaWorkspace>, onChiudi: () -> Unit) {
    val contesto = LocalContext.current
    val recenti = remember { contesto.getSharedPreferences("sierradeck-file-recenti", Context.MODE_PRIVATE) }
    val ordinati = remember(workspace) { workspace.sortedByDescending { recenti.getLong("$pc|${it.id}", 0L) } }
    var dove by remember { mutableStateOf<SchedaWorkspace?>(null) }
    val troppo = Allegati.controlla(f.nome, f.byte.coerceAtLeast(0))
    val d = dove
    if (troppo != null) {
        AlertDialog(onDismissRequest = onChiudi, title = { Text("Non si può mandare") }, text = { Text(troppo) }, confirmButton = { TextButton(onClick = onChiudi) { Text("Chiudi") } })
        return
    }
    if (d == null) AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("A quale workspace?") },
        text = {
            Column {
                if (ordinati.isEmpty()) Text("Nessun workspace: creane uno dal PC.", color = Banco.testoQuieto)
                for (w in ordinati) TextButton(onClick = { dove = w }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(w.nome, modifier = Modifier.fillMaxWidth()) }
            }
        },
        confirmButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    ) else AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Mandare il file?") },
        text = { Text("«${f.nome}»" + (if (f.byte >= 0) " (${FileVista.misura(f.byte)})" else "") + " a ${d.nome}.") },
        confirmButton = {
            Button(onClick = {
                recenti.edit().putLong("$pc|${d.id}", System.currentTimeMillis()).apply()
                onChiudi()
                val t = Telefono.pronto ?: return@Button
                val coda = CodaFile.pronta ?: return@Button
                t.ambito.launch(Dispatchers.IO) {
                    try {
                        val (sha, byte) = Allegati.impronta(contesto.contentResolver.openInputStream(f.uri) ?: return@launch)
                        coda.metti(pc, f.nome, byte, sha, "autopilota", d.id, d.nome) { contesto.contentResolver.openInputStream(f.uri) ?: throw java.io.IOException("il file non si apre") }
                        coda.svuota(pc)
                    } catch (e: CancellationException) { throw e } catch (_: Exception) { }
                }
            }) { Text("Manda") }
        },
        dismissButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
}

private fun leggi(c: Context, u: Uri): FileDaMandare {
    var nome = u.lastPathSegment?.substringAfterLast('/') ?: "file"
    var byte = -1L
    try {
        c.contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { k ->
            if (k.moveToFirst()) {
                val n = k.getColumnIndex(OpenableColumns.DISPLAY_NAME); val s = k.getColumnIndex(OpenableColumns.SIZE)
                if (n >= 0 && !k.isNull(n)) nome = k.getString(n)
                if (s >= 0 && !k.isNull(s)) byte = k.getLong(s)
            }
        }
    } catch (_: Exception) { }
    return FileDaMandare(u, nome, byte)
}
