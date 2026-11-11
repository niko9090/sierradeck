package it.ferrariconsulenze.sierradeck.schermate.comune

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import it.ferrariconsulenze.sierradeck.dati.CodaInvii
import it.ferrariconsulenze.sierradeck.dati.Telefono
import it.ferrariconsulenze.sierradeck.nucleo.DomandaLavoro
import it.ferrariconsulenze.sierradeck.nucleo.RegoleSchermate
import it.ferrariconsulenze.sierradeck.nucleo.RuoloTelefono
import it.ferrariconsulenze.sierradeck.nucleo.SceltaLavoro
import it.ferrariconsulenze.sierradeck.nucleo.TipoDomanda
import it.ferrariconsulenze.sierradeck.nucleo.Tono
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco

/** I pezzi che «Lavoro» e «Workspace» hanno in comune (app 11/11). */

fun coloreTono(t: Tono): Color = when (t) {
    Tono.FERMO -> Banco.rosso
    Tono.ASPETTA -> Banco.ambra
    Tono.LAVORA -> Banco.verde
    Tono.RIPOSO -> Banco.testoQuieto
}

fun coloreRuolo(colore: String?, ruolo: String): Color =
    Color((RegoleSchermate.argbRuolo(colore) ?: RegoleSchermate.argbRuolo(RegoleSchermate.coloreRuolo(ruolo)) ?: 0xFF9AA1A9L).toInt())

/** La barra dell'avanzamento: piena di colore, sottile. */
@Composable
fun BarraAvanzamento(percento: Int, colore: Color = Banco.accento, modifier: Modifier = Modifier) {
    LinearProgressIndicator(
        progress = { percento.coerceIn(0, 100) / 100f },
        color = colore, trackColor = Banco.incisione,
        modifier = modifier.fillMaxWidth().heightIn(min = 6.dp).clip(RoundedCornerShape(3.dp))
            .semantics { contentDescription = "$percento per cento" }
    )
}

/** I pallini di chi lavora, ognuno del colore del suo ruolo. */
@Composable
fun PalliniRuoli(ruoli: List<RuoloTelefono>) {
    if (ruoli.isEmpty()) return
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.semantics { contentDescription = "Al lavoro: " + ruoli.joinToString { it.ruolo } }
    ) {
        for (r in ruoli.take(8)) Box(Modifier.size(10.dp).clip(CircleShape).background(coloreRuolo(r.colore, r.ruolo)))
        if (ruoli.size > 8) Text("+${ruoli.size - 8}", style = MaterialTheme.typography.labelMedium, color = Banco.testoQuieto)
    }
}

/**
 * Una domanda per te: la frase, i tasti (la consigliata piena), la riga
 * «Se non rispondi…» e «Scrivi tu». Il consenso ha tre tasti larghi, uno per
 * riga, con la conseguenza sotto; «Sì, sempre» chiede conferma.
 */
@Composable
fun SchedaDomandaNuova(d: DomandaLavoro, onRispondi: (String) -> Unit, onScriviTu: (() -> Unit)?) {
    var conferma by remember(d.chiave) { mutableStateOf<SceltaLavoro?>(null) }
    val colore = if (d.rischiosa) Banco.rosso else Banco.ambra
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(colore))
                Spacer(Modifier.width(8.dp))
                Text(d.chi, style = MaterialTheme.typography.labelLarge, color = colore)
            }
            Text(d.testo, style = MaterialTheme.typography.titleMedium, color = Banco.testo)
            val r = d.risposta
            if (r != null) {
                Text("Hai risposto: $r", style = MaterialTheme.typography.bodyMedium, color = Banco.verde)
                return@Column
            }
            if (d.tipo == TipoDomanda.CONSENSO) {
                for (s in d.scelte) Column(Modifier.fillMaxWidth()) {
                    TastoScelta(s, largo = true) { if (s.conConferma) conferma = s else onRispondi(s.testo) }
                    s.conseguenza?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Banco.testoQuieto, modifier = Modifier.padding(start = 4.dp, top = 2.dp)) }
                }
            } else {
                for (s in d.scelte) TastoScelta(s, largo = true) { onRispondi(s.testo) }
            }
            d.rigaSotto?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = if (d.rischiosa) Banco.rosso else Banco.testoQuieto) }
            if (d.libera && onScriviTu != null) TextButton(onClick = onScriviTu, modifier = Modifier.heightIn(min = 48.dp)) { Text("Scrivi tu") }
        }
    }
    conferma?.let { s ->
        AlertDialog(
            onDismissRequest = { conferma = null },
            title = { Text("Sì, sempre?") },
            text = { Text(s.conseguenza ?: "Non te lo chiede più per questo.") },
            confirmButton = { Button(onClick = { conferma = null; onRispondi(s.testo) }) { Text("Sì, sempre") } },
            dismissButton = { TextButton(onClick = { conferma = null }) { Text("Annulla") } }
        )
    }
}

@Composable
fun TastoScelta(s: SceltaLavoro, largo: Boolean, onClick: () -> Unit) {
    val m = (if (largo) Modifier.fillMaxWidth() else Modifier).heightIn(min = 48.dp)
    if (s.consigliata) Button(onClick = onClick, modifier = m, colors = ButtonDefaults.buttonColors(containerColor = Banco.accento)) {
        Text(s.etichetta, fontWeight = FontWeight.SemiBold)
    } else OutlinedButton(onClick = onClick, modifier = m) { Text(s.etichetta, color = Banco.testo) }
}

/**
 * La casella per scrivere: microfono, graffetta (se serve) e «Manda». La bozza
 * resta sul telefono a ogni lettera ([CodaInvii.bozza]); il messaggio entra
 * nella coda prima di partire, così non si perde se la rete cade.
 */
@Composable
fun CasellaScrivi(casella: String, segnaposto: String, onManda: (String) -> Boolean, onAllega: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    val coda = CodaInvii.pronta
    val bozze = coda?.bozze?.collectAsState()
    var locale by rememberSaveable(casella) { mutableStateOf("") }
    val testo = bozze?.value?.get(casella) ?: locale
    fun cambia(t: String) { if (coda != null) coda.bozza(casella, t) else locale = t }
    Row(modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.Bottom) {
        TastoMicrofono(testo) { cambia(it) }
        if (onAllega != null) IconButton(onClick = onAllega) { Icon(Icons.Filled.AttachFile, contentDescription = "Allega un file") }
        OutlinedTextField(
            value = testo, onValueChange = { cambia(it) },
            placeholder = { Text(segnaposto) },
            modifier = Modifier.weight(1f), maxLines = 6,
            colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Banco.testo, unfocusedTextColor = Banco.testo)
        )
        IconButton(
            onClick = { val t = testo.trim(); if (t.isNotEmpty() && onManda(t)) { if (coda == null) locale = "" } },
            enabled = testo.isNotBlank()
        ) { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Manda") }
    }
}

/** I messaggi ancora in coda di una casella: «in invio…» o «Non l’ha presa · Riprova». */
@Composable
fun InviiInCoda(casella: String) {
    val coda = CodaInvii.pronta ?: return
    val invii by coda.invii.collectAsState()
    val miei = invii.filter { it.casella == casella }
    for (i in miei) Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalAlignment = Alignment.End) {
        Text(i.testo, color = Banco.testo, style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Banco.accentoTenue).padding(10.dp))
        if (i.rifiutato == null) Text("in invio…", style = MaterialTheme.typography.labelSmall, color = Banco.testoQuieto)
        else Row(verticalAlignment = Alignment.CenterVertically) {
            Text(RegoleSchermate.fraseErrore(it.ferrariconsulenze.sierradeck.nucleo.TipoErrore.RIFIUTO), style = MaterialTheme.typography.labelSmall, color = Banco.rosso)
            Aiuto(i.rifiutato)
            TextButton(onClick = { Telefono.pronto?.let { t -> coda.riprovaOra(t.ambito, i.id) } }) { Text("Riprova") }
            TextButton(onClick = { coda.togli(i.id) }) { Text("Togli") }
        }
    }
}

/** Mette un messaggio nella coda degli invii e lo fa partire; false se la coda non c'è (app non avviata). */
fun mettiInCoda(pc: String, rotta: String, corpo: String, casella: String, testo: String): Boolean {
    val coda = CodaInvii.pronta ?: return false
    val t = Telefono.pronto ?: return false
    coda.manda(t.ambito, pc, rotta, corpo, casella, testo)
    return true
}
