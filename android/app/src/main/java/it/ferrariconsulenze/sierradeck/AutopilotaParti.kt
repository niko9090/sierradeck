package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme

// I pezzi del dettaglio di un autopilota: i comandi, i passaggi, i criteri, le chat e l'albero.
// Spostati così com'erano da Lavori.kt nella 0.83.0.

@Composable
internal fun AzioniAutopilota(api: Api, id: String, stato: String, workspace: String? = null) {
    val scope = rememberCoroutineScope()
    var inCorso by remember(id, stato) { mutableStateOf(false) }
    // «Sposta in…» (PC 0.81.0): i workspace del PC si leggono quando servono.
    var nomiWs by remember(id) { mutableStateOf<List<String>?>(null) }
    nomiWs?.let { nomi ->
        SceltaWorkspace("Sposta l’autopilota in…", nomi, tranne = workspace, onScegli = { verso ->
            nomiWs = null
            scope.launch {
                if (tentaGestione("spostarlo", SuPc.corrente?.nome) { api.spostaAutopilota(id, verso) } != null)
                    Nota.mostra("Il suo lavoro ora compare in «$verso». La cartella e le chat già aperte restano dove sono.")
            }
        }, onChiudi = { nomiWs = null })
    }
    /** `cosa` all'infinito: finisce in «Non sono riuscito a …» se il computer dice di no. */
    fun fai(cosa: String, azione: suspend () -> Unit) {
        inCorso = true
        scope.launch {
            tenta(cosa, azione)
            inCorso = false
        }
    }
    when (stato) {
        "pronto" -> Button(
            enabled = !inCorso,
            shape = MaterialTheme.shapes.small,
            onClick = { fai("farlo partire") { api.vaiAutopilota(id) } },
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (inCorso) "Parto…" else "Vai — comincia a lavorare") }
        "lavoro" -> OutlinedButton(
            enabled = !inCorso,
            shape = MaterialTheme.shapes.small,
            onClick = { fai("fermarlo") { api.fermaAutopilota(id) } },
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (inCorso) "Fermo…" else "Ferma — riprende quando vuoi") }
        // Aspetta una tua risposta: il gesto giusto e' rispondere, non
        // fermarlo. Prima c'era solo «Ferma», come se stesse lavorando.
        "attesa" -> Column {
            Text(
                "Ti ha fatto una domanda e aspetta la risposta: scrivila nella casella qui sotto (o nella scheda Domande). Finché non rispondi non va avanti.",
                color = Banco.ambra, fontSize = 13.sp
            )
            Spacer(Modifier.height(6.dp))
            OutlinedButton(
                enabled = !inCorso,
                shape = MaterialTheme.shapes.small,
                onClick = { fai("fermarlo") { api.fermaAutopilota(id) } },
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (inCorso) "Fermo…" else "Oppure fermalo — riprende quando vuoi") }
        }
        "finito" -> Text(
            "Ha finito. Non c’è altro da fare.",
            color = Banco.testoQuieto,
            fontSize = 13.sp
        )
        // Si sta preparando: «Riprendi» qui faceva ripartire la preparazione
        // sotto quella in corso. Si aspetta, o si ferma.
        "intervista" -> OutlinedButton(
            enabled = !inCorso,
            shape = MaterialTheme.shapes.small,
            onClick = { fai("fermarlo") { api.fermaAutopilota(id) } },
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (inCorso) "Fermo…" else "Si sta preparando (legge il progetto; se ha un dubbio ti chiede qui e nelle Domande): ferma") }
        else -> Column {
            Button(
                enabled = !inCorso,
                shape = MaterialTheme.shapes.small,
                onClick = { fai("riprenderlo") { api.riprendiAutopilota(id) } },
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (inCorso) "Riprendo…" else "Riprendi da dove si è fermato") }
            // Archiviare un autopilota fermo (app 2.56.0), come dal pannello del PC.
            if (stato == "sospeso" || stato == "fallito") {
                TextButton(enabled = !inCorso, onClick = { inCorso = true; scope.launch { tentaGestione("archiviarlo", SuPc.corrente?.nome, FunzionePc.PARITA) { api.archiviaAutopilota(id, true) }; inCorso = false } }) {
                    Text("Archivia — esce dall’elenco dei lavori, non si cancella niente")
                }
            }
        }
    }
    TextButton(enabled = !inCorso, onClick = {
        scope.launch { tentaGestione("leggere i workspace", SuPc.corrente?.nome) { api.stato().workspace.nomi }?.let { nomi ->
            if (nomi.any { it != workspace }) {
                nomiWs = nomi
            } else {
                Nota.mostra("Sul computer non c’è un altro workspace.")
            }
        } }
    }) {
        Text("Sposta in un altro workspace…" + if (!workspace.isNullOrBlank()) " (adesso «$workspace»)" else "", fontSize = 12.sp)
    }
}

@Composable
internal fun Passaggi(passi: List<Passo>, mostraNota: Boolean = true) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (p in passi) {
            val colore = when (p.stato) {
                "fatto" -> Banco.verde
                "corrente" -> Banco.accento
                "attesa" -> Banco.ambra
                "fermo" -> Banco.rosso
                else -> Banco.incisione
            }
            Column(Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(colore))
                Spacer(Modifier.height(4.dp))
                Text(p.nome, color = if (p.stato == "davanti") Banco.testoQuieto else Banco.testo, fontSize = 12.sp)
            }
        }
    }
    val nota = passi.firstOrNull { it.nota != null }?.nota
    if (nota != null && mostraNota) {
        Spacer(Modifier.height(6.dp))
        Text(nota, color = Banco.testoQuieto, fontSize = 13.sp)
    }
}

/** La barra della misura e, accanto al dettaglio, quante volte e' intervenuto (i cicli). */
@Composable
internal fun Misura(m: MisuraPasso, cicli: Int) {
    val colore = when (m.tono) {
        "lavoro" -> Banco.verde
        "attesa" -> Banco.ambra
        "fermo" -> Banco.rosso
        else -> Banco.accento
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        LinearProgressIndicator(
            progress = { m.percento / 100f },
            color = colore,
            trackColor = Banco.incisione,
            modifier = Modifier.weight(1f).height(6.dp)
        )
        Spacer(Modifier.size(10.dp))
        Text("${m.percento}%", color = colore, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
    // «3 criteri su 7 · 12 interventi», come sul computer e sulla pagina: i
    // cicli arrivavano da sempre e nessuna schermata li mostrava.
    val riga = listOf("${m.dettaglio} ${m.di}".trim(), interventiInParole(cicli)).filter { it.isNotBlank() }
    if (riga.isNotEmpty()) {
        Text(riga.joinToString(" · "), color = Banco.testoQuieto, fontSize = 12.sp)
    }
}

/** «12 interventi», «1 intervento». */
internal fun interventiInParole(n: Int): String = if (n == 1) "1 intervento" else "$n interventi"

/**
 * La prima riga non vuota di quello che un comando ha stampato, tagliata a
 * sessanta caratteri: serve a capire perche' non e' passato, non ad archiviare.
 */
private fun primaRigaUscita(uscita: String): String {
    val riga = uscita.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: ""
    return if (riga.length > 60) riga.take(60) + "…" else riga
}

/**
 * «supervisore →» e' come il servizio marca le proprie decisioni per
 * ritrovarle: una sigla interna, che letta da fuori sembra un errore. Stessa
 * regola della pagina: se la freccia c'e' ed e' nei primi venti caratteri, si
 * tiene solo quello che viene dopo.
 */
internal fun senzaSigla(cosa: String): String {
    val freccia = cosa.indexOf('→')
    return if (freccia == -1 || freccia > 20) cosa else cosa.substring(freccia + 1).trim()
}

@Composable
internal fun Criterio(c: Criterio) {
    Column(Modifier.padding(vertical = 5.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Text(if (c.soddisfatto) "✓ " else "◦ ", color = if (c.soddisfatto) Banco.verde else Banco.testoQuieto)
            Text(c.descrizione, color = Banco.testo, modifier = Modifier.weight(1f))
        }
        if (c.comando != null) {
            // Accanto al comando, com'e' finita l'ultima volta: «passato», o la
            // prima riga di quello che ha stampato. Senza, la spunta non ha storia.
            val verifica = c.ultimaVerifica
            val esito = when {
                verifica == null -> ""
                verifica.codice == 0 -> " · passato"
                else -> primaRigaUscita(verifica.uscita).takeIf { it.isNotBlank() }?.let { " · $it" }
                    ?: " · non passato (codice ${verifica.codice ?: "?"})"
            }
            Text(c.comando + esito, color = Banco.testoQuieto, fontSize = 12.sp, fontFamily = FontTerminale, modifier = Modifier.padding(start = 18.dp))
        }
        if (c.raggiuntoIl != null) {
            // Solo l'ora: la data intera in ISO non si legge, e «alle 14:32»
            // e' tutto quello che serve per sapere se e' successo adesso o stamattina.
            val ora = oraLocale(c.raggiuntoIl)
            Text(
                if (ora.isNotBlank()) "raggiunto alle $ora" else "raggiunto ${c.raggiuntoIl}",
                color = Banco.verde, fontSize = 11.sp, modifier = Modifier.padding(start = 18.dp)
            )
        }
    }
}

@Composable
internal fun Etichetta(testo: String) {
    Serigrafia(testo)
    Spacer(Modifier.height(4.dp))
}

/**
 * Una riga della chat con lui: una battuta (tua a destra, sua a sinistra) o
 * una nota — la sua voce di lavoro, una riga quieta con il filo colorato a
 * sinistra come nel diario. La domanda aperta e il «dammi il via» sono ambra,
 * come ogni «tocca a te» del programma.
 */
@Composable
internal fun RigaChat(b: Battuta, nomeSuo: String, onVai: () -> Unit) {
    // L'ora del telefono, come sul PC (0.79.0): l'istante arriva in UTC.
    val ora = oraLocale(b.quando)
    if (b.da == "nota") {
        val filo = when (b.tono) {
            "decisione" -> Banco.accento
            "correzione" -> Banco.ambra
            "fine", "traguardo" -> Banco.verde
            "fermo" -> Banco.rosso
            else -> Banco.incisione
        }
        // PC 0.79.0: le righe corte dei traguardi si leggono come le battute.
        val forte = b.tono == "fine" || b.tono == "fermo" || b.tono == "traguardo"
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.width(2.dp).height(16.dp).background(filo))
            Spacer(Modifier.width(6.dp))
            Text(ora, color = Banco.testoQuieto, fontSize = 11.sp, fontFamily = FontTerminale)
            Spacer(Modifier.width(6.dp))
            Text(
                b.testo + (b.volte?.let { " ×$it" } ?: "") + (b.dettaglio?.let { " — $it" } ?: ""),
                color = if (forte) Banco.testo else Banco.testoQuieto,
                fontSize = 11.sp,
                modifier = Modifier.weight(1f)
            )
        }
        return
    }
    val lui = b.da == "lui"
    val ambra = b.tono == "domanda" || b.tono == "pronto"
    val forma = MaterialTheme.shapes.small
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (lui) Arrangement.Start else Arrangement.End) {
        Column(
            Modifier
                .fillMaxWidth(0.92f)
                .padding(vertical = 4.dp)
                .then(if (ambra) Modifier.border(1.dp, Banco.ambra, forma) else Modifier)
                .background(
                    when {
                        ambra -> Banco.ambra.copy(alpha = 0.10f)
                        lui -> Banco.verde.copy(alpha = 0.10f)
                        else -> Banco.accento.copy(alpha = 0.12f)
                    },
                    forma
                )
                .padding(horizontal = 10.dp, vertical = 6.dp)
        ) {
            Text(
                (if (lui) nomeSuo.ifBlank { "lui" } else "tu") + " · " + ora,
                color = Banco.testoQuieto,
                fontSize = 11.sp
            )
            Text(b.testo, color = Banco.testo, fontSize = 13.sp)
            val dettaglio = b.dettaglio
            if (!dettaglio.isNullOrBlank()) Text(dettaglio, color = Banco.testoQuieto, fontSize = 11.sp)
            if (b.tono == "pronto") {
                Spacer(Modifier.height(4.dp))
                Button(onClick = onVai, shape = forma) { Text("Vai") }
            }
        }
    }
}

/** Una sotto-chat nell'albero: LED, compito, stato, ramo, giri. */
@Composable
internal fun RigaAlbero(f: NodoAlbero) {
    val colore = when (f.stato) { "lavoro" -> Banco.verde; "bloccata" -> Banco.ambra; else -> Banco.testoQuieto }
    Row(Modifier.padding(start = 8.dp, top = 4.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.width(1.dp).height(34.dp).background(Banco.incisione))
        Spacer(Modifier.width(8.dp))
        Box(Modifier.padding(top = 5.dp).size(8.dp).clip(CircleShape).background(colore))
        Spacer(Modifier.width(8.dp))
        Column {
            // PC 0.71: il ruolo, con la parola e il colore decisi dal PC.
            f.ruolo?.let { r -> Text(r.parola, color = coloreVista(r.colore), fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            Text(f.titolo, color = Banco.testo, fontSize = 13.sp)
            Text(
                f.parola + (if (f.approvata) " · approvato e unito" else "") + " · ${f.cicli} " + (if (f.cicli == 1) "giro" else "giri") + (f.ramo?.let { " · $it" } ?: ""),
                color = Banco.testoQuieto, fontSize = 11.sp
            )
        }
    }
}
