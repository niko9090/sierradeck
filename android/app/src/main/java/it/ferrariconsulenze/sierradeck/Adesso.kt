package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * «Adesso»: una cosa sola domina, in ordine di urgenza.
 *
 * È la schermata che risponde alla domanda «serve qualcosa da me?». Scollegato,
 * poi una domanda in attesa, poi un autopilota fermo, poi ciò che è in moto, e
 * quando non serve niente il vuoto vince: «Tutto in moto. Nessuno ti aspetta.»
 */
@Composable
fun Adesso(api: Api, stato: Stato?, connesso: Boolean) {
    when {
        !connesso && stato == null -> Attesa()
        !connesso -> Avviso("Non parlo con il computer.", "Controlla che SierraDeck sia acceso sulla stessa rete.")
        stato == null -> Attesa()
        stato.domande.isNotEmpty() -> Domande(api, stato.domande)
        stato.autopiloti.any { it.stato == "sospeso" || it.stato == "fallito" } ->
            Fermi(api, stato.autopiloti.filter { it.stato == "sospeso" || it.stato == "fallito" })
        stato.autopiloti.any { it.stato == "lavoro" || it.stato == "attesa" } || stato.chat.isNotEmpty() ->
            InMoto(stato)
        else -> Calma()
    }
}

@Composable
private fun Attesa() {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator(color = Banco.accento)
    }
}

@Composable
private fun Avviso(titolo: String, sotto: String) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(titolo, color = Banco.rosso, fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(sotto, color = Banco.testoQuieto, textAlign = TextAlign.Center)
    }
}

/** La domanda dell'autopilota: la cosa più grande della pagina, con dove
 *  rispondere sotto il pollice. Se ce n'è più d'una si mostra la prima. */
@Composable
private fun Domande(api: Api, domande: List<Domanda>) {
    val domanda = domande.first()
    var risposta by remember(domanda.id) { mutableStateOf("") }
    var inCorso by remember(domanda.id) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center
    ) {
        Serigrafia("Ti sta chiedendo", Banco.ambra)
        Spacer(Modifier.height(12.dp))
        Text(domanda.testo, color = Banco.testo, fontSize = 22.sp)
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(
            value = risposta,
            onValueChange = { risposta = it },
            label = { Text("La tua risposta") },
            modifier = Modifier.fillMaxWidth().height(140.dp)
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {
                inCorso = true
                scope.launch {
                    try { api.rispondi(domanda.id, risposta) } catch (_: Exception) {} finally { inCorso = false }
                }
            },
            enabled = !inCorso && risposta.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (inCorso) "Mando…" else "Rispondi") }
    }
}

/** Autopiloti fermi: rosso non pulsante, e il tasto per rimetterli in moto. */
@Composable
private fun Fermi(api: Api, fermi: List<AutopilotaBreve>) {
    val scope = rememberCoroutineScope()
    Column(
        Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Spacer(Modifier.height(4.dp))
        for (ap in fermi) {
            Tessera(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Serigrafia("Si è fermato", Banco.rosso)
                    Spacer(Modifier.height(6.dp))
                    Text(ap.nome, color = Banco.testo, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    if (ap.motivo.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(ap.motivo, color = Banco.testoQuieto)
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(onClick = {
                        scope.launch { try { api.riprendiAutopilota(ap.id) } catch (_: Exception) {} }
                    }) { Text("Riprendi") }
                }
            }
        }
    }
}

/** Il polso: chi è al lavoro e cosa sta scrivendo, a colpo d'occhio. */
@Composable
private fun InMoto(stato: Stato) {
    val alLavoro = stato.autopiloti.filter { it.stato == "lavoro" || it.stato == "attesa" }
    Column(
        Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Spacer(Modifier.height(4.dp))
        Serigrafia("In moto", Banco.verde)
        for (ap in alLavoro) {
            Tessera(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.padding(end = 8.dp)) {
                        Text(ap.nome, color = Banco.testo, fontWeight = FontWeight.Bold)
                        if (ap.motivo.isNotBlank()) Text(ap.motivo, color = Banco.testoQuieto, fontSize = 13.sp)
                    }
                }
            }
        }
        for (c in stato.chat) {
            Tessera(Modifier.fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().padding(14.dp)) {
                    Text(c.titolo.ifBlank { c.cwd }, color = Banco.testo, fontWeight = FontWeight.Bold)
                    if (!c.ultimaRiga.isNullOrBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(c.ultimaRiga!!, color = Banco.testoQuieto, fontSize = 13.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun Calma() {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Tutto in moto.", color = Banco.testo, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text("Nessuno ti aspetta.", color = Banco.testoQuieto, fontSize = 16.sp)
    }
}
