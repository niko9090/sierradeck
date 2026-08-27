package it.ferrariconsulenze.sierradeck

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * Quello che non può aspettare, dove stai già guardando.
 *
 * Prima c'era una scheda apposta, «Adesso». Era vuota quasi sempre, e quando
 * non lo era diceva cose urgenti in una stanza in fondo al corridoio: dovevi
 * andarci tu, e proprio nel momento in cui contava. Le urgenze si portano a chi
 * guarda.
 *
 * Quindi: niente, il 90% del tempo. E quando c'è qualcosa, una banda in cima a
 * qualunque schermata, del colore di ciò che sta succedendo — ambra per una
 * domanda che aspetta, rosso per un autopilota fermo, rosso per il computer che
 * non risponde. Un tocco e si fa la cosa, senza cambiare pagina.
 */
@Composable
fun BandaUrgenze(api: Api, stato: Stato?, connesso: Boolean) {
    val domanda = stato?.domande?.firstOrNull()
    val fermi = stato?.autopiloti?.filter { it.stato == "sospeso" || it.stato == "fallito" } ?: emptyList()
    var rispondendo by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val urgenza: Urgenza? = when {
        !connesso && stato == null -> null
        !connesso -> Urgenza(
            colore = Banco.rosso,
            titolo = "Non parlo con il computer",
            sotto = "Controlla che SierraDeck sia acceso, sulla stessa rete.",
            azione = null,
            onAzione = {}
        )
        domanda != null -> Urgenza(
            colore = Banco.ambra,
            titolo = "Ti sta chiedendo una cosa",
            sotto = domanda.testo,
            azione = "Rispondi",
            onAzione = { rispondendo = true }
        )
        fermi.isNotEmpty() -> Urgenza(
            colore = Banco.rosso,
            titolo = if (fermi.size == 1) "«${fermi.first().nome}» si è fermato" else "${fermi.size} autopiloti fermi",
            sotto = fermi.first().motivo.ifBlank { "Aspetta che tu lo rimetta in moto." },
            azione = "Riprendi",
            onAzione = {
                scope.launch {
                    for (ap in fermi) try { api.riprendiAutopilota(ap.id) } catch (_: Exception) {}
                }
            }
        )
        else -> null
    }

    AnimatedVisibility(
        visible = urgenza != null,
        enter = expandVertically(),
        exit = shrinkVertically()
    ) {
        urgenza?.let { u ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(u.colore.copy(alpha = 0.14f))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Il filetto di colore a sinistra: si riconosce con la coda
                // dell'occhio, prima ancora di leggere.
                Column(
                    Modifier.width(3.dp).height(38.dp).background(u.colore)
                ) {}
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(u.titolo, color = u.colore, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(u.sotto, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 2)
                }
                if (u.azione != null) {
                    Spacer(Modifier.width(10.dp))
                    Button(onClick = u.onAzione) { Text(u.azione) }
                }
            }
        }
    }

    if (rispondendo && domanda != null) {
        DialogoRisposta(api, domanda, onChiudi = { rispondendo = false })
    }
}

private data class Urgenza(
    val colore: Color,
    val titolo: String,
    val sotto: String,
    val azione: String?,
    val onAzione: () -> Unit
)

/**
 * Rispondere alla domanda senza lasciare quello che stavi facendo.
 *
 * Una finestra e non una schermata: la domanda arriva mentre sei da un'altra
 * parte, e dopo aver risposto vuoi tornare esattamente lì.
 */
@Composable
private fun DialogoRisposta(api: Api, domanda: Domanda, onChiudi: () -> Unit) {
    var risposta by remember(domanda.id) { mutableStateOf("") }
    var inCorso by remember(domanda.id) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = { if (!inCorso) onChiudi() },
        title = { Serigrafia("Ti sta chiedendo", Banco.ambra) },
        text = {
            Column {
                Text(domanda.testo, color = Banco.testo, fontSize = 16.sp)
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = risposta,
                    onValueChange = { risposta = it },
                    placeholder = { Text("La tua risposta", color = Banco.testoQuieto) },
                    modifier = Modifier.fillMaxWidth().height(130.dp)
                )
            }
        },
        confirmButton = {
            Button(
                enabled = !inCorso && risposta.isNotBlank(),
                onClick = {
                    inCorso = true
                    scope.launch {
                        try { api.rispondi(domanda.id, risposta) } catch (_: Exception) {}
                        inCorso = false
                        onChiudi()
                    }
                }
            ) { Text(if (inCorso) "Mando…" else "Rispondi") }
        },
        dismissButton = {
            TextButton(enabled = !inCorso, onClick = onChiudi) { Text("Più tardi") }
        }
    )
}

/** Le voci di una fila, con lo spazio giusto in mezzo. */
@Composable
fun FilaSpaziata(spazio: Int = 8, contenuto: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(spazio.dp)) { contenuto() }
}
