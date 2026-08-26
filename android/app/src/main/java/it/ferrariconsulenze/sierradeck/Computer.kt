package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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

/** Numeri di token leggibili: 12.4k, 3.1M. */
private fun tokenBrevi(n: Long): String = when {
    n >= 1_000_000 -> "%.1fM".format(n / 1_000_000.0)
    n >= 1_000 -> "%.1fk".format(n / 1_000.0)
    else -> n.toString()
}

/**
 * «Computer»: ciò che si governa del banco da lontano — i workspace, i
 * salvataggi, i consumi, lo stile, e l'aggiornamento del computer.
 */
@Composable
fun Computer(api: Api, stato: Stato?) {
    val scope = rememberCoroutineScope()
    var consumi by remember { mutableStateOf<Consumi?>(null) }
    var salvataggi by remember { mutableStateOf<List<Salvataggio>>(emptyList()) }
    var pref by remember { mutableStateOf<Preferenze?>(null) }
    var aggiornamento by remember { mutableStateOf<Aggiornamento?>(null) }
    var nuovoWs by remember { mutableStateOf("") }
    var confermaCarica by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        consumi = try { api.consumi() } catch (_: Exception) { null }
        salvataggi = try { api.salvataggi().salvataggi } catch (_: Exception) { emptyList() }
        pref = try { api.preferenze().preferenze } catch (_: Exception) { null }
    }
    // Lo stato dell'aggiornamento cambia mentre scarica: si rinfresca.
    LaunchedEffect(Unit) {
        while (isActive) {
            aggiornamento = try { api.aggiornamento() } catch (_: Exception) { aggiornamento }
            delay(2000)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {

        // ─── Workspace ───
        Sezione("Workspace")
        val ws = stato?.workspace
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (nome in ws?.nomi ?: emptyList()) {
                FilterChip(
                    selected = nome == ws?.attivo,
                    onClick = { scope.launch { try { api.cambiaWorkspace(nome) } catch (_: Exception) {} } },
                    label = { Text(nome) }
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            OutlinedTextField(
                value = nuovoWs,
                onValueChange = { nuovoWs = it.take(40) },
                label = { Text("Nuovo workspace") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(8.dp))
            TextButton(
                enabled = nuovoWs.isNotBlank(),
                onClick = {
                    val n = nuovoWs.trim(); nuovoWs = ""
                    scope.launch { try { api.creaWorkspace(n) } catch (_: Exception) {} }
                }
            ) { Text("Crea") }
        }

        Divisore()

        // ─── Consumi ───
        Sezione("Consumi (token)")
        val c = consumi
        if (c == null) Text("Carico…", color = Banco.testoQuieto)
        else {
            QuotaRiga("Oggi", c.oggi)
            QuotaRiga("7 giorni", c.settimana)
            QuotaRiga("Totale", c.totale)
        }

        Divisore()

        // ─── Salvataggi ───
        Sezione("Salvataggi")
        if (salvataggi.isEmpty()) Text("Nessun salvataggio.", color = Banco.testoQuieto)
        else for (s in salvataggi) {
            Card(colors = CardDefaults.cardColors(containerColor = Banco.chassis), modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(s.nome, color = Banco.testo, maxLines = 1)
                        Text("${s.chat} chat · ${s.quando}", color = Banco.testoQuieto, fontSize = 12.sp)
                    }
                    OutlinedButton(onClick = { confermaCarica = s.nome }) { Text("Carica") }
                }
            }
        }

        Divisore()

        // ─── Impostazioni ───
        Sezione("Aspetto")
        val p = pref
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((chiave, etichetta) in listOf("banco" to "Banco", "foglio" to "Foglio")) {
                FilterChip(
                    selected = (p?.stile ?: "banco") == chiave,
                    onClick = {
                        pref = p?.copy(stile = chiave) ?: Preferenze(stile = chiave)
                        scope.launch { try { api.impostaStile(chiave) } catch (_: Exception) {} }
                    },
                    label = { Text(etichetta) }
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Chiarore del fondo", color = Banco.testoQuieto, fontSize = 12.sp)
        var chiarore by remember(p?.chiarore) { mutableStateOf((p?.chiarore ?: 20).toFloat()) }
        Slider(
            value = chiarore,
            onValueChange = { chiarore = it },
            valueRange = 0f..100f,
            onValueChangeFinished = {
                scope.launch { try { api.impostaChiarore(chiarore.toInt()) } catch (_: Exception) {} }
            }
        )

        Divisore()

        // ─── Aggiornamento del computer ───
        Sezione("Aggiornamento del computer")
        AggiornamentoPc(api, aggiornamento)

        Spacer(Modifier.height(24.dp))
    }

    // conferma caricamento salvataggio (sostituisce ciò che hai a schermo)
    val nome = confermaCarica
    if (nome != null) {
        AlertDialog(
            onDismissRequest = { confermaCarica = null },
            title = { Text("Caricare «$nome»?") },
            text = { Text("Sostituisce le chat che hai a schermo con quelle del salvataggio.") },
            confirmButton = {
                TextButton(onClick = {
                    confermaCarica = null
                    scope.launch { try { api.caricaSalvataggio(nome) } catch (_: Exception) {} }
                }) { Text("Carica") }
            },
            dismissButton = { TextButton(onClick = { confermaCarica = null }) { Text("Annulla") } }
        )
    }
}

@Composable
private fun AggiornamentoPc(api: Api, a: Aggiornamento?) {
    val scope = rememberCoroutineScope()
    when (a?.fase) {
        "disponibile" -> {
            Text("C’è la versione ${a.versione ?: ""}.", color = Banco.testo)
            Spacer(Modifier.height(8.dp))
            Button(onClick = { scope.launch { try { api.scaricaAggiornamento() } catch (_: Exception) {} } }) { Text("Scarica") }
        }
        "scarico" -> Text("Scarico ${a.versione ?: ""}… ${a.percento ?: 0}%", color = Banco.testoQuieto)
        "pronto" -> {
            Text("La ${a.versione ?: ""} è pronta. Installandola, il computer si chiude e riparte.", color = Banco.testo)
            Spacer(Modifier.height(8.dp))
            Button(onClick = { scope.launch { try { api.installaAggiornamento() } catch (_: Exception) {} } }) { Text("Installa e riavvia") }
        }
        "aggiornato" -> Text("Il computer è già aggiornato.", color = Banco.testoQuieto)
        else -> Text("Nessun aggiornamento in sospeso.", color = Banco.testoQuieto)
    }
}

@Composable
private fun QuotaRiga(nome: String, q: Quota) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(nome, color = Banco.testo, modifier = Modifier.width(90.dp))
        Text(
            "↑${tokenBrevi(q.ingresso)}  ↓${tokenBrevi(q.uscita)}  ⟳${tokenBrevi(q.cache)}  · ${q.chat} chat",
            color = Banco.testoQuieto,
            fontSize = 13.sp
        )
    }
}

@Composable
private fun Sezione(titolo: String) {
    Text(titolo, color = Banco.accento, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun Divisore() {
    Spacer(Modifier.height(16.dp))
    HorizontalDivider(color = Banco.incisione)
    Spacer(Modifier.height(16.dp))
}
