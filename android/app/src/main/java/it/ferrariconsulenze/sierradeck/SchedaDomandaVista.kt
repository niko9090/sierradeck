package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * I messaggi verso la chat come si mostrano (PC 0.72.1, `messaggiCompatti` in
 * `shared/stato-dal-vivo.ts`). Nicholas, 15/10: «vedo ancora un sacco di
 * messaggi "consegnato alle" che occupano tutto lo spazio». Un messaggio
 * arrivato è una spunta ✓; «in consegna» un puntino; una riga sola, e solo se
 * qualcosa è fermo: «in attesa da N min» con «Manda adesso». Pura.
 */
data class SegnoMessaggio(val id: String, val consegnato: Boolean, val titolo: String)
data class MessaggioFermo(val dettaglio: String, val quanti: Int, val testo: String, val mandaAdesso: Boolean)
data class MessaggiCompatti(val segni: List<SegnoMessaggio>, val fermo: MessaggioFermo?)

fun messaggiCompatti(m: List<StatoMessaggio>): MessaggiCompatti {
    val inAttesa = m.filter { it.stato == "in attesa" }
    // Dal più vecchio al più nuovo: l'ultimo arrivato a destra.
    val segni = m.reversed()
        .filter { it.stato == "consegnato" || it.stato == "in consegna" }
        .map { SegnoMessaggio(it.id, it.stato == "consegnato", "${it.dettaglio}: ${it.testo}") }
    val primo = inAttesa.firstOrNull()
    return MessaggiCompatti(
        segni,
        primo?.let { MessaggioFermo(it.dettaglio, inAttesa.size, it.testo, inAttesa.any { x -> x.mandaAdesso }) }
    )
}

/** Le spunte su una riga (toccandone una si legge ora e testo), e la riga di chi è fermo. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MessaggiCompattiVista(messaggi: List<StatoMessaggio>, onManda: () -> Unit) {
    val c = messaggiCompatti(messaggi)
    if (c.segni.isEmpty() && c.fermo == null) return
    var letto by remember { mutableStateOf<String?>(null) }
    Spacer(Modifier.height(8.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.Center) {
        Text("Messaggi per la chat", color = Banco.testoQuieto, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(end = 4.dp))
        for (s in c.segni) {
            Text(
                if (s.consegnato) "✓" else "⋯",
                color = if (s.consegnato) Banco.verde else Banco.testoQuieto,
                fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(4.dp)).toccoInLinea { letto = if (letto == s.titolo) null else s.titolo }.padding(horizontal = 2.dp)
            )
        }
    }
    letto?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp) }
    c.fermo?.let { f ->
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Text(f.dettaglio + if (f.quanti > 1) " · ${f.quanti} messaggi" else "", color = Banco.ambra, fontSize = 12.sp)
            Spacer(Modifier.width(8.dp))
            Text(f.testo, color = Banco.testo, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
            if (f.mandaAdesso) TextButton(onClick = onManda) { Text("Manda adesso", fontSize = 12.sp) }
        }
    }
}

/** Il testo di un tasto: le caselle di una scelta multipla, la ★ della consigliata. */
fun etichettaScelta(s: SceltaScheda): String =
    (when (s.spuntata) { true -> "☑ "; false -> "☐ "; null -> "" }) + (if (s.consigliata) "★ " else "") + s.testo

/**
 * Una domanda essenziale (PC 0.72.1): chi chiede in piccolo, la domanda in una
 * frase, le scelte come tasti (la consigliata segnata), «Scrivi tu», e il resto
 * dietro un «?» chiuso. Nessuna cronologia. Uguale al PC e alla pagina.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchedaDomandaVista(
    s: SchedaDomanda,
    inCorso: Boolean,
    etichettaManda: String,
    onScelta: (SceltaScheda) -> Unit,
    onScrivi: (String) -> Unit
) {
    var aperti by remember(s.domanda, s.chi) { mutableStateOf(false) }
    var testo by remember(s.domanda, s.chi) { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(
                s.chi + (s.poi?.takeIf { it > 0 }?.let { if (it == 1) " · poi un’altra" else " · poi altre $it" } ?: ""),
                color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f)
            )
            if (s.dettagli.isNotEmpty()) {
                Text(
                    "?",
                    color = if (aperti) Banco.testo else Banco.testoQuieto,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .border(1.dp, Banco.incisione, RoundedCornerShape(50))
                        .tocco { aperti = !aperti }
                        .padding(horizontal = 10.dp, vertical = 2.dp)
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        SelectionContainer { Text(s.domanda, color = Banco.testo, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
        s.risposta?.let { Text(if (it.startsWith("chiusa: superata")) it else "risposta dall’autopilota: $it", color = Banco.verde, fontSize = 12.sp) }
        if (aperti) {
            Column(
                Modifier.fillMaxWidth().padding(top = 6.dp).background(Banco.chassis, RoundedCornerShape(6.dp)).padding(8.dp)
            ) {
                for (d in s.dettagli) {
                    Text(d.etichetta.uppercase(), color = Banco.testoQuieto, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    SelectionContainer { Text(d.testo, color = Banco.testo, fontSize = 13.sp) }
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
        if (s.scelte.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (c in s.scelte) {
                    Text(
                        etichettaScelta(c),
                        color = Banco.testo,
                        fontSize = 14.sp,
                        fontWeight = if (c.consigliata) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (c.consigliata) Banco.accento.copy(alpha = 0.18f) else Banco.fondo)
                            .border(if (c.consigliata) 2.dp else 1.dp, if (c.consigliata) Banco.accento else Banco.incisione, RoundedCornerShape(8.dp))
                            .tocco(enabled = !inCorso) { onScelta(c) }
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = testo,
                onValueChange = { testo = it.take(50_000) },
                placeholder = { Text(s.segnaposto, color = Banco.testoQuieto, fontSize = 13.sp) },
                textStyle = LocalTextStyle.current.copy(fontSize = 14.sp, color = Banco.testo),
                maxLines = 4,
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
                onClick = { val t = testo.trim(); testo = ""; onScrivi(t) }
            ) { Text(if (inCorso) "…" else etichettaManda) }
        }
        // Il microfono (2.75.0): il testo dettato va nel campo, non parte da solo.
        TastoMicrofono(testo) { testo = it.take(50_000) }
    }
}

/**
 * Gli specialisti dell'autopilota (PC 0.73.0): come è organizzato il lavoro,
 * poi uno per chat — il ruolo con il suo colore, lo stato, il compito, l'ultima
 * cosa detta e «Guarda», che apre la sua chat (se è aperta sul PC).
 */
@Composable
fun SpecialistiVista(s: Specialisti, onGuarda: (String) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(if (s.elenco.size > 1) "SPECIALISTI (${s.elenco.size})" else "LA SUA CHAT", color = Banco.testoQuieto, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        LegendaAttivita()
    }
    if (s.riga.isNotBlank()) Text(s.riga, color = Banco.testoQuieto, fontSize = 12.sp)
    for (x in s.elenco) {
        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            // PC 0.82.0: una riga per agente — colore fisso e simbolo di cosa fa, ruolo, stato e da quanto.
            val att = Attivita.diSpecialista(x)
            Row(verticalAlignment = Alignment.CenterVertically) {
                SegnoAttivita(att)
                Spacer(Modifier.width(6.dp))
                Text(x.ruolo, color = Attivita.coloreDi(att), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text(" · " + RegoleAgenti.statoEQuanto(x), color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
                // PC 0.74.0: chi ha finito ha chiuso la sua chat da solo.
                if (x.chiusa) Text("chat chiusa", color = Banco.testoQuieto, fontSize = 12.sp)
                else x.sessionId?.let { sid -> TextButton(onClick = { onGuarda(sid) }) { Text("Guarda", fontSize = 12.sp) } }
            }
            val cosa = x.cosa.ifBlank { x.compito }
            if (cosa.isNotBlank()) Text(cosa, color = Banco.testo, fontSize = 12.sp, maxLines = 2)
            if (x.ultimaAzione.isNotBlank()) Text(x.ultimaAzione, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 2)
        }
    }
}

/** Il colore di un ruolo, dalla tabella unica (PC 0.82.0). */
fun coloreRuolo(c: String) = Attivita.colore(c)

/** I testi della riga di un agente, uguali al PC (provati in `RegoleAgentiTest`). */
object RegoleAgenti {
    /** «al lavoro · da 12 min», «aspetta te», «finita»; da un PC più vecchio lo stato in parole che manda. */
    fun statoEQuanto(x: Specialista): String {
        if (x.attivita == null) return x.stato
        return listOf(Attivita.parolaStato(Attivita.diSpecialista(x)), x.quanto).filter { it.isNotBlank() }.joinToString(" · ")
    }
}
