package it.ferrariconsulenze.sierradeck.schermate.altro

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import it.ferrariconsulenze.sierradeck.nucleo.Chat
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.schermate.comune.Aiuto
import it.ferrariconsulenze.sierradeck.schermate.comune.TastoAzioniChat
import it.ferrariconsulenze.sierradeck.schermate.comune.tocco
import it.ferrariconsulenze.sierradeck.schermate.radice.SezioneAltro
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.vecchie.AltriComputer
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneAggiornamenti
import it.ferrariconsulenze.sierradeck.schermate.notifiche.SchermataNotifiche
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneConsumi
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneDrive
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneErroriApp
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneInfo
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneQuadernoPersonale
import it.ferrariconsulenze.sierradeck.schermate.vecchie.SezioneSalute
import kotlinx.coroutines.launch

/**
 * **Altro** (app 11/11): sei voci, una per tocco. Dentro, per ora, le sezioni
 * di prima che funzionano già (aggiornamenti, salute, Drive…); le voci nuove
 * sono «Tutte le chat» e «Scollega questo telefono» in Aiuto.
 */
@Composable
fun SchermataAltro(
    api: Api,
    chat: List<Chat>,
    aperta: SezioneAltro?,
    onApri: (SezioneAltro) -> Unit,
    onIndietro: () -> Unit,
    onApriChat: (String) -> Unit,
    onScollega: suspend (Boolean) -> String?
) {
    if (aperta == null) { ElencoAltro(onApri); return }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onIndietro) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Indietro") }
            Text(aperta.titolo, style = MaterialTheme.typography.titleMedium, color = Banco.testo)
        }
        Box(Modifier.fillMaxSize()) {
            when (aperta) {
                SezioneAltro.AGGIORNAMENTI -> Column(Modifier.verticalScroll(rememberScrollState())) { SezioneAggiornamenti(api) }
                SezioneAltro.AVVISI -> SchermataNotifiche()
                SezioneAltro.SALUTE -> Linguette(listOf("Salute", "Computer", "Consumi")) { i ->
                    when (i) { 0 -> SezioneSalute(api); 1 -> AltriComputer(api); else -> SezioneConsumi(api) }
                }
                SezioneAltro.CHAT -> TutteLeChat(api, chat, onApriChat)
                SezioneAltro.DRIVE -> Linguette(listOf("Drive", "Quaderno personale")) { i ->
                    if (i == 0) Column(Modifier.verticalScroll(rememberScrollState())) { SezioneDrive(api) } else SezioneQuadernoPersonale(api)
                }
                SezioneAltro.INFO -> Column(Modifier.verticalScroll(rememberScrollState())) {
                    SezioneInfo(api)
                    SezioneErroriApp(api)
                    Scollega(onScollega)
                }
            }
        }
    }
}

/** Due o tre parti di una voce, a linguette: ognuna a tutto schermo. */
@Composable
private fun Linguette(nomi: List<String>, contenuto: @Composable (Int) -> Unit) {
    var i by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        androidx.compose.material3.TabRow(selectedTabIndex = i, containerColor = Banco.chassis, contentColor = Banco.accento) {
            nomi.forEachIndexed { n, nome -> androidx.compose.material3.Tab(selected = i == n, onClick = { i = n }, text = { Text(nome) }, modifier = Modifier.heightIn(min = 48.dp)) }
        }
        Box(Modifier.fillMaxSize()) { contenuto(i) }
    }
}

@Composable
fun ElencoAltro(onApri: (SezioneAltro) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
        items(SezioneAltro.entries, key = { it.name }) { s ->
            Column(Modifier.fillMaxWidth().tocco { onApri(s) }.heightIn(min = 64.dp).padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text(s.titolo, style = MaterialTheme.typography.titleMedium, color = Banco.testo)
                Text(s.sotto, style = MaterialTheme.typography.bodyMedium, color = Banco.testoQuieto)
            }
            HorizontalDivider(color = Banco.incisione)
        }
    }
}

/** Tutte le chat del PC: tocco = la apre; «⋯» Rinomina e Chiudi (con conferma). */
@Composable
fun TutteLeChat(api: Api?, chat: List<Chat>, onApriChat: (String) -> Unit) {
    var nota by remember { mutableStateOf<String?>(null) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
        nota?.let { item { Text(it, color = Banco.testoQuieto, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) } }
        if (chat.isEmpty()) item { Text("Nessuna chat accesa.", color = Banco.testoQuieto, modifier = Modifier.padding(16.dp)) }
        items(chat, key = { it.id }) { c ->
            val titolo = c.nome ?: c.titolo.ifBlank { "Chat" }
            Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).tocco { onApriChat(c.id) }.padding(horizontal = 16.dp, vertical = 10.dp)) {
                    Text(titolo, style = MaterialTheme.typography.titleSmall, color = Banco.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val sotto = listOfNotNull(c.workspace, when { c.chiede -> "aspetta te"; c.aspetta -> "ha finito, aspetta te"; c.governata -> "la guida l’autopilota"; else -> null }).joinToString(" · ")
                    if (sotto.isNotEmpty()) Text(sotto, style = MaterialTheme.typography.bodySmall, color = if (c.chiede) Banco.ambra else Banco.testoQuieto)
                }
                TastoAzioniChat(api, c.id, titolo, onEsito = { nota = it })
            }
        }
    }
}

/**
 * «Scollega questo telefono»: chiede conferma, il PC toglie il telefono dal
 * suo elenco e il telefono dimentica il PC. Se il PC non risponde lo dice, e
 * offre di dimenticarlo solo qui (il PC lo tiene finché non lo togli da lì).
 */
@Composable
fun Scollega(onScollega: suspend (Boolean) -> String?) {
    var chiedi by remember { mutableStateOf(false) }
    var problema by remember { mutableStateOf<String?>(null) }
    var lavora by remember { mutableStateOf(false) }
    val ambito = rememberCoroutineScope()
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { chiedi = true }, enabled = !lavora, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                Text("Scollega questo telefono", color = Banco.rosso)
            }
            Aiuto("Il computer toglie questo telefono dal suo elenco e il telefono lo dimentica. Per tornare a usarlo serve un accoppiamento nuovo (il QR).", di = "Scollega")
        }
    }
    if (chiedi) AlertDialog(
        onDismissRequest = { chiedi = false },
        title = { Text("Scollegare questo telefono?") },
        text = { Text("Per riusarlo col computer servirà di nuovo il QR.") },
        confirmButton = {
            Button(onClick = {
                chiedi = false; lavora = true
                ambito.launch { problema = onScollega(false); lavora = false }
            }, colors = ButtonDefaults.buttonColors(containerColor = Banco.rosso)) { Text("Scollega") }
        },
        dismissButton = { TextButton(onClick = { chiedi = false }) { Text("Annulla") } }
    )
    problema?.let { p ->
        AlertDialog(
            onDismissRequest = { problema = null },
            title = { Text("Il computer non l’ha presa") },
            text = { Text("$p\n\nPuoi dimenticarlo solo da qui: sul computer il telefono resta nell’elenco finché non lo togli da lì.") },
            confirmButton = { Button(onClick = { problema = null; ambito.launch { problema = onScollega(true) } }) { Text("Dimentica solo qui") } },
            dismissButton = { TextButton(onClick = { problema = null }) { Text("Annulla") } }
        )
    }
}
