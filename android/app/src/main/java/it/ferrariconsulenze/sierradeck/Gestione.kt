package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * Le finestre per gestire chat e workspace dal telefono (app 2.55.0), con le
 * conferme e i testi del PC (`AzioniTelefono`). Valgono per il PC accoppiato
 * e, attraverso il ponte, per gli altri PC: `api` è già quella giusta.
 */

/**
 * Cosa dire quando un'azione di gestione non va: una rotta che quel PC non ha
 * ancora (404 «non trovato»), un PC accoppiato di prima della 0.55.0 che non
 * la lascia passare dal ponte (403 «riquadro remoto»), o il motivo vero.
 */
fun spiegaGestione(e: Api.Errore, cosa: String, nomePc: String?): String = when {
    e.codice == 404 && e.corpo.contains("\"non trovato\"") -> FunzioniPc.testoMancante(FunzionePc.GESTIONE, nomePc)
    e.codice == 403 && e.corpo.contains("riquadro remoto") ->
        "Il PC a cui il telefono è accoppiato è di prima della 0.55.0 e attraverso il ponte lascia solo guardare e scrivere: aggiorna lui (Computer → Aggiornamento) e da qui potrai $cosa anche sugli altri PC."
    else -> Nota.spiega(e, cosa)
}

/** La conferma: titolo, cosa succede e cosa no per esteso, e il tasto con il nome dell'azione. */
@Composable
fun DialogoConferma(c: Conferma, pericolo: Boolean = false, onSi: () -> Unit, onNo: () -> Unit) {
    AlertDialog(
        onDismissRequest = onNo,
        title = { Text(c.titolo) },
        text = { Text(c.testo, fontSize = 14.sp) },
        confirmButton = { TextButton(onClick = onSi) { Text(c.azione, color = if (pericolo) Banco.rosso else Banco.accento) } },
        dismissButton = { TextButton(onClick = onNo) { Text("Annulla") } }
    )
}

/**
 * I workspace di un PC: andarci, crearne uno, rinominarlo, eliminarlo. Le
 * stesse azioni del pannello Workspace del PC, che sul PC le esegue la sua
 * finestra (copia di sicurezza prima di eliminare, terminali spenti).
 */
@Composable
fun GestioneWorkspace(api: Api, workspace: Workspace, nomePc: String?, onChiudi: () -> Unit) {
    val scope = rememberCoroutineScope()
    var nuovo by remember { mutableStateOf("") }
    var rinomina by remember { mutableStateOf<String?>(null) }
    var nomeNuovo by remember { mutableStateOf("") }
    var elimina by remember { mutableStateOf<String?>(null) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    fun fai(cosa: String, azione: suspend () -> Unit) {
        inCorso = true
        scope.launch {
            try { azione(); errore = null } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Api.Errore) {
                errore = spiegaGestione(e, cosa, nomePc)
            } catch (e: Exception) { errore = "Non sono riuscito a $cosa: ${e.message ?: "il computer non risponde"}" }
            inCorso = false
        }
    }
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text(if (nomePc.isNullOrBlank()) "Workspace" else "Workspace di $nomePc") },
        text = {
            Column(Modifier.fillMaxWidth().heightIn(max = 460.dp).verticalScroll(rememberScrollState())) {
                Text(
                    "Un workspace è una disposizione di chat sul computer. Andarci lo mette davanti sul computer (le chat degli altri continuano a lavorare). Eliminarlo toglie le sue chat dalla disposizione ma non cancella le conversazioni.",
                    color = Banco.testoQuieto, fontSize = 12.sp
                )
                errore?.let { Spacer(Modifier.height(6.dp)); Text(it, color = Banco.rosso, fontSize = 12.sp) }
                Spacer(Modifier.height(8.dp))
                for (n in workspace.nomi) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(n, color = if (n == workspace.attivo) Banco.accento else Banco.testo, fontWeight = if (n == workspace.attivo) FontWeight.Bold else FontWeight.Normal)
                            val quante = workspace.chat.count { it.workspace == n }
                            Text((if (n == workspace.attivo) "davanti sul computer · " else "") + if (quante == 1) "1 chat" else "$quante chat", color = Banco.testoQuieto, fontSize = 11.sp)
                        }
                        if (n != workspace.attivo) TextButton(enabled = !inCorso, onClick = { fai("passare a «$n»") { api.cambiaWorkspace(n) } }) { Text("Vai") }
                        TextButton(enabled = !inCorso, onClick = { rinomina = n; nomeNuovo = n }) { Text("Rinomina") }
                        TextButton(enabled = !inCorso, onClick = {
                            if (workspace.nomi.size <= 1) errore = AzioniTelefono.ULTIMO_WORKSPACE else elimina = n
                        }) { Text("Elimina", color = Banco.rosso) }
                    }
                    HorizontalDivider(color = Banco.incisione)
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = nuovo, onValueChange = { nuovo = it.take(AzioniTelefono.NOME_WORKSPACE_MAX) }, singleLine = true,
                        placeholder = { Text("Nome del nuovo") }, modifier = Modifier.weight(1f))
                    TextButton(enabled = !inCorso && nuovo.isNotBlank(), onClick = {
                        val e = AzioniTelefono.erroreNomeWorkspace(nuovo, workspace.nomi)
                        if (e != null) errore = e else { val n = nuovo.trim(); nuovo = ""; fai("creare il workspace «$n»") { api.creaWorkspace(n) } }
                    }) { Text("Crea") }
                }
                Text("Crearlo lo mette anche davanti sul computer, vuoto: le chat nuove che apri da qui ci finiscono dentro.", color = Banco.testoQuieto, fontSize = 11.sp)
            }
        },
        confirmButton = { TextButton(onClick = onChiudi) { Text("Chiudi") } }
    )
    rinomina?.let { vecchio ->
        AlertDialog(
            onDismissRequest = { rinomina = null },
            title = { Text(AzioniTelefono.confermaRinominaWorkspace(vecchio).titolo) },
            text = {
                Column {
                    Text(AzioniTelefono.confermaRinominaWorkspace(vecchio).testo, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(value = nomeNuovo, onValueChange = { nomeNuovo = it.take(AzioniTelefono.NOME_WORKSPACE_MAX) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val e = AzioniTelefono.erroreNomeWorkspace(nomeNuovo, workspace.nomi.filter { it != vecchio })
                    rinomina = null
                    if (e != null) errore = e else if (nomeNuovo.trim() != vecchio) {
                        val n = nomeNuovo.trim()
                        fai("rinominare «$vecchio»") { api.rinominaWorkspace(vecchio, n) }
                    }
                }) { Text("Rinomina") }
            },
            dismissButton = { TextButton(onClick = { rinomina = null }) { Text("Annulla") } }
        )
    }
    elimina?.let { n ->
        DialogoConferma(AzioniTelefono.confermaEliminaWorkspace(n), pericolo = true,
            onSi = { elimina = null; fai("eliminare il workspace «$n»") { api.eliminaWorkspace(n) } },
            onNo = { elimina = null })
    }
}

/** Dove spostare una chat: gli altri workspace di quel PC. */
@Composable
fun SceltaWorkspace(titolo: String, nomi: List<String>, tranne: String?, onScegli: (String) -> Unit, onChiudi: () -> Unit) {
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text(titolo) },
        text = {
            Column(Modifier.fillMaxWidth().heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
                val altri = nomi.filter { it != tranne }
                if (altri.isEmpty()) Text("Non ci sono altri workspace su questo computer: creane uno da «Workspace» nell’elenco delle chat.", color = Banco.testoQuieto, fontSize = 13.sp)
                for (n in altri) {
                    Text(n, color = Banco.testo, modifier = Modifier.fillMaxWidth().clickable { onScegli(n) }.padding(vertical = 10.dp))
                    HorizontalDivider(color = Banco.incisione)
                }
            }
        },
        confirmButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
}

/** Il workspace in cui aprire una chat nuova: una riga di scelte, il predefinito è quello davanti. */
@Composable
fun SceltaWorkspaceRiga(nomi: List<String>, scelto: String, onScegli: (String) -> Unit) {
    if (nomi.isEmpty()) return
    Text("Nel workspace:", color = Banco.testoQuieto, fontSize = 12.sp)
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (n in nomi) {
            androidx.compose.material3.FilterChip(selected = n == scelto, onClick = { onScegli(n) }, label = { Text(n, fontSize = 12.sp) })
        }
    }
    Spacer(Modifier.width(1.dp))
}

/** Come `tenta`, con le spiegazioni della gestione (PC vecchio, ponte vecchio). */
suspend fun <T> tentaGestione(cosa: String, nomePc: String?, azione: suspend () -> T): T? =
    try {
        azione()
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Api.Errore) {
        Nota.mostra(spiegaGestione(e, cosa, nomePc)); null
    } catch (e: Exception) {
        Nota.mostra("Non sono riuscito a $cosa: ${e.message ?: "il computer non risponde"}"); null
    }
