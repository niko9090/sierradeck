package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.border
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.text.style.TextAlign

/** Il colore che riassume lo stato di un autopilota (un punto, non una teoria). */
fun coloreStato(stato: String): Color = when (stato) {
    "lavoro" -> Banco.verde
    "pronto", "attesa" -> Banco.ambra
    "sospeso", "fallito" -> Banco.rosso
    "finito" -> Banco.testoQuieto
    else -> Banco.testoQuieto
}

/**
 * Il colore del LED **come lo ha deciso il computer** (`led` in `/api/stato`,
 * dalla stessa funzione della console). L'app se lo ricalcolava da `stato` e
 * sbagliava dove conta: «finito» era blu acceso mentre PC e pagina lo
 * spengono. Con un computer vecchio (`led` vuoto) si ripiega sullo stato.
 */
fun coloreLed(led: String, stato: String): Color = when (led) {
    "led--lavoro" -> Banco.verde
    "led--attesa" -> Banco.ambra
    "led--fermo" -> Banco.rosso
    "led--finito" -> Banco.testoQuieto
    else -> coloreStato(stato)
}

/**
 * «Lavori»: gli autopiloti, con dentro tutto quello che il pannello del computer
 * mostra — dove sono nel percorso, i criteri che si sono dati, cosa hanno deciso.
 */
@Composable
fun Lavori(api: Api, stato: Stato?) {
    var aperto by remember { mutableStateOf<String?>(null) }
    var delega by remember { mutableStateOf(false) }
    val lista = stato?.autopiloti ?: emptyList()

    LaunchedEffect(lista, aperto) {
        if (aperto != null && lista.none { it.id == aperto }) aperto = null
    }

    val breve = lista.firstOrNull { it.id == aperto }
    if (breve != null) {
        BackHandler { aperto = null }
        DettaglioAutopilota(api, breve, onIndietro = { aperto = null })
    } else {
        Column(Modifier.fillMaxSize()) {
            FasciaLavori(lista) { delega = true }
            if (lista.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Nessun autopilota.", color = Banco.testo, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Un autopilota è un lavoro che porti a termine da solo: gli dici l’obiettivo e la cartella, e lui apre le chat che servono.",
                            color = Banco.testoQuieto,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { delega = true }) { Text("Affida un lavoro") }
                    }
                }
            } else {
                // Prima quelli che aspettano te, poi quelli che lavorano, poi il
                // resto: da un telefono si guarda per sapere se serve qualcosa,
                // e la risposta non deve stare in fondo a una lista.
                val ordinati = lista.sortedBy { urgenzaDi(it.stato) }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 6.dp)) {
                    items(ordinati, key = { it.id }) { ap ->
                        VoceAutopilota(ap) { aperto = ap.id }
                    }
                }
            }
        }
        if (delega) Delega(api, onChiudi = { delega = false })
    }
}

@Composable
private fun Punto(colore: Color) {
    Box(Modifier.size(10.dp).clip(CircleShape).background(colore))
}

/**
 * Il dettaglio di un autopilota: la chat con lui in alto, le linguette sotto.
 *
 * Come la sezione sul PC (0.29.0). Nicholas: «in alto la parte di chat e
 * nelle varie tab le altre info, così vedo tutto senza scorrere come un
 * matto». La chat arriva composta dal computer (`AutopilotaDettaglio.chat`):
 * quello che gli hai chiesto, l'intervista, le sue decisioni come note, il
 * dialogo, la domanda aperta. Con una domanda aperta la casella risponde
 * (arriva subito alla chat ferma); altrimenti parla con il supervisore, che
 * risponde in qualche minuto.
 */
@Composable
private fun DettaglioAutopilota(api: Api, breve: AutopilotaBreve, onIndietro: () -> Unit) {
    var d by remember(breve.id) { mutableStateOf<AutopilotaDettaglio?>(null) }
    var quadernoAperto by remember { mutableStateOf(false) }
    var eliminando by remember { mutableStateOf(false) }
    // La casella: cosa stai scrivendo, se lo stai mandando, e cosa e' andato
    // storto l'ultima volta (un 409 e' un computer da aggiornare).
    var messaggio by remember(breve.id) { mutableStateOf("") }
    var mandando by remember(breve.id) { mutableStateOf(false) }
    var notaDialogo by remember(breve.id) { mutableStateOf<String?>(null) }
    var linguetta by remember(breve.id) { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    val lista = rememberLazyListState()

    LaunchedEffect(breve.id) {
        while (isActive) {
            try { d = api.autopilota(breve.id) } catch (_: Exception) {}
            delay(2000)
        }
    }

    val det = d
    val chat = det?.chat ?: emptyList()
    val pensa = det?.pensa == true
    val guarda = det != null && det.stato == "intervista" && !det.domanda
    val righe = chat.size + (if (pensa || guarda) 1 else 0)
    // In fondo, come ogni chat: si scorre quando cambia il numero delle righe,
    // non a ogni rilettura, cosi' chi sta rileggendo l'inizio non viene
    // riportato giu' ogni due secondi.
    LaunchedEffect(righe) {
        if (righe > 0) lista.animateScrollToItem(righe - 1)
    }

    Column(Modifier.fillMaxSize()) {
        Column {
            Row(
                Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onIndietro, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro", tint = Banco.testo)
                }
                Spacer(Modifier.width(6.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        breve.nome,
                        color = Banco.testo,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        fontSize = 15.sp
                    )
                    val s = det?.stato ?: breve.stato
                    Text(statoInParole(s), color = coloreStato(s), fontSize = 12.sp)
                    // **Perche'** si e' fermato: «fermo» da solo manda a cercare
                    // altrove. Come la pagina: prima la strada che sta provando,
                    // altrimenti il motivo della sospensione.
                    if (s == "sospeso" || s == "fallito") {
                        val strategia = det?.strategia?.takeIf { it.isNotBlank() } ?: breve.strategia.takeIf { it.isNotBlank() }
                        val perche = if (strategia != null) "bloccato, provo: $strategia"
                            else det?.motivoSospensione?.takeIf { it.isNotBlank() } ?: breve.motivo
                        if (perche.isNotBlank()) {
                            Text(perche, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 3)
                        }
                    }
                }
                Punto(coloreLed(breve.led, det?.stato ?: breve.stato))
            }
            HorizontalDivider(color = Banco.incisione)
        }

        // Il gesto principale sta **fuori** dallo scorrimento: il momento in
        // cui vuoi premere «Riprendi» e' proprio dopo aver letto perche' si e'
        // fermato.
        Column(Modifier.fillMaxWidth().background(Banco.fondo).padding(horizontal = 16.dp, vertical = 8.dp)) {
            AzioniAutopilota(api, breve.id, det?.stato ?: breve.stato)
        }
        HorizontalDivider(color = Banco.incisione)

        // ─── la chat con lui: la meta' di sopra ───
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp)) {
            if (det != null && det.passaggi.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Passaggi(det.passaggi)
                Spacer(Modifier.height(6.dp))
                Misura(det.misura, det.cicli)
            }
            Spacer(Modifier.height(6.dp))
            Serigrafia("Chat con lui")
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = lista) {
                items(chat) { b ->
                    RigaChat(b, breve.nome) {
                        scope.launch { tenta("farlo partire") { api.vaiAutopilota(breve.id) } }
                    }
                }
                if (pensa) item {
                    Text(
                        "● sta pensando alla risposta… di solito entro qualche minuto. Puoi scrivergli altro: risponde in ordine.",
                        color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp)
                    )
                } else if (guarda) item {
                    Text(
                        "● sta guardando il progetto per capire cosa serve: se ha un dubbio te lo chiede qui.",
                        color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp)
                    )
                }
            }
            val domanda = det != null && det.domanda && det.domandaId != null
            OutlinedTextField(
                value = messaggio,
                onValueChange = { messaggio = it },
                label = { Text(if (domanda) "La tua risposta" else "Scrivigli qui: una domanda, un vincolo, «fermati», «riprendi»…") },
                maxLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    enabled = messaggio.isNotBlank() && !mandando,
                    shape = MaterialTheme.shapes.small,
                    onClick = {
                        val testo = messaggio.trim()
                        val idDomanda = det?.domandaId
                        mandando = true
                        scope.launch {
                            try {
                                if (domanda && idDomanda != null) api.rispondi(idDomanda, testo)
                                else api.dialogaAutopilota(breve.id, testo)
                                messaggio = ""
                                notaDialogo = null
                                try { d = api.autopilota(breve.id) } catch (_: Exception) {}
                            } catch (e: Api.Errore) {
                                notaDialogo = if (e.codice == 409)
                                    "Questo computer non sa ancora dialogare con gli autopiloti: aggiornalo."
                                else "Non sono riuscito a mandarlo (HTTP ${e.codice})."
                            } catch (e: Exception) {
                                notaDialogo = "Non sono riuscito a mandarlo: ${e.message ?: "il computer non risponde"}"
                            }
                            mandando = false
                        }
                    }
                ) { Text(if (mandando) "Mando…" else if (domanda) "Rispondi" else "Manda") }
                Text(
                    if (domanda) "Arriva subito alla chat ferma." else "Risponde lui, il supervisore, in qualche minuto.",
                    color = Banco.testoQuieto, fontSize = 11.sp, modifier = Modifier.weight(1f)
                )
            }
            val nota = notaDialogo
            if (nota != null) Text(nota, color = Banco.rosso, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
        }
        HorizontalDivider(color = Banco.incisione)

        // ─── le linguette: la meta' di sotto ───
        val nomi = listOf(
            "Obiettivo",
            "Criteri" + (det?.criteri?.takeIf { it.isNotEmpty() }?.let { " ${it.count { c -> c.soddisfatto }}/${it.size}" } ?: ""),
            "Compiti" + (det?.compitiDaFare?.takeIf { it.isNotEmpty() }?.let { " ${it.size}" } ?: ""),
            "Ha deciso",
            "Altro"
        )
        ScrollableTabRow(
            selectedTabIndex = linguetta,
            containerColor = Banco.fondo,
            contentColor = Banco.testo,
            edgePadding = 8.dp
        ) {
            nomi.forEachIndexed { i, nome ->
                Tab(
                    selected = linguetta == i,
                    onClick = { linguetta = i },
                    text = { Text(nome, fontSize = 12.sp, color = if (linguetta == i) Banco.testo else Banco.testoQuieto) }
                )
            }
        }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
            when (linguetta) {
                0 -> {
                    // Quello che hai scritto tu, e quello che lui ne ha fatto:
                    // senza le due righe una accanto all'altra non c'e' modo di
                    // accorgersi che sta andando a fare un'altra cosa.
                    Etichetta("GLI HAI CHIESTO")
                    val tue = det?.obiettivoTuo ?: det?.obiettivo ?: breve.nome
                    Text(tue, color = Banco.testo)
                    if (det != null && det.obiettivo.isNotBlank() && det.obiettivo != tue) {
                        Spacer(Modifier.height(10.dp))
                        Etichetta("HA CAPITO COSÌ")
                        Text(det.obiettivo, color = Banco.testoQuieto)
                    }
                    if (det != null) {
                        Spacer(Modifier.height(12.dp))
                        Etichetta("A CHE PUNTO È")
                        val nota = det.passaggi.firstOrNull { it.stato != "fatto" && it.stato != "davanti" }?.nota
                        if (nota != null) Text(nota, color = Banco.testoQuieto, fontSize = 13.sp)
                        Text(
                            interventiInParole(det.cicli) + " del supervisore" +
                                (det.strategia?.takeIf { it.isNotBlank() }?.let { " · sta provando un’altra strada: $it" } ?: ""),
                            color = Banco.testoQuieto, fontSize = 12.sp
                        )
                        Spacer(Modifier.height(12.dp))
                        Etichetta(if (det.chats.size > 1) "LE SUE CHAT" else "LA SUA CHAT")
                        if (det.chats.isEmpty()) {
                            Text(
                                if (det.stato == "intervista" || det.stato == "pronto") "Non è ancora partita: nasce quando dai il via."
                                else "Nessuna chat aperta adesso.",
                                color = Banco.testoQuieto, fontSize = 13.sp
                            )
                        } else det.chats.forEachIndexed { i, ch ->
                            val stato = when (ch.stato) { "lavoro" -> "al lavoro"; "bloccata" -> "ferma, aspetta una risposta"; else -> "finita" }
                            Text(
                                "chat ${i + 1} · $stato · ${ch.cicli} " + (if (ch.cicli == 1) "giro" else "giri") +
                                    (if (det.chats.size > 1) "\n${ch.compito}" else ""),
                                color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(vertical = 3.dp)
                            )
                        }
                    }
                }
                1 -> {
                    Etichetta("FINISCE QUANDO")
                    if (det == null || det.criteri.isEmpty()) {
                        Text("Ancora nessun criterio: li scrive lui alla fine della preparazione.", color = Banco.testoQuieto, fontSize = 13.sp)
                    } else {
                        for (c in det.criteri) Criterio(c)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Il comando sotto ogni criterio è quello che lo misura a ogni fermata. Per riscriverli usa il PC, o diglielo nella chat qui sopra.",
                            color = Banco.testoQuieto, fontSize = 12.sp
                        )
                    }
                }
                2 -> {
                    Etichetta("PRIMA FA")
                    val compiti = det?.compitiDaFare ?: emptyList()
                    if (compiti.isEmpty()) {
                        Text("Niente in coda: lavora sull’obiettivo. Per aggiungere un compito diglielo nella chat qui sopra.", color = Banco.testoQuieto, fontSize = 13.sp)
                    } else compiti.forEachIndexed { i, c ->
                        Text("${i + 1}. $c", color = Banco.testo, fontSize = 13.sp, modifier = Modifier.padding(vertical = 3.dp))
                    }
                }
                3 -> {
                    Etichetta("STA RAGIONANDO COSÌ")
                    val decisioni = det?.decisioni ?: emptyList()
                    if (decisioni.isEmpty()) {
                        Text(
                            if (det?.stato == "intervista") "Sta guardando il progetto per capire cosa serve."
                            else "Ancora niente: il primo intervento arriva quando la chat si ferma.",
                            color = Banco.testoQuieto, fontSize = 13.sp
                        )
                    }
                    // Con l'ora e senza la sigla «supervisore →»: quella e' come
                    // il servizio marca le sue decisioni, e letta da fuori sembra
                    // un errore. Resta cosa ha deciso, e quando.
                    for (dec in decisioni.takeLast(30).reversed()) {
                        val ora = dec.quando.drop(11).take(5)
                        Text(
                            (if (ora.isNotBlank()) "$ora  " else "• ") + senzaSigla(dec.cosa),
                            color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(vertical = 3.dp)
                        )
                    }
                }
                else -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Riparte al riavvio", color = Banco.testo, modifier = Modifier.weight(1f))
                        Switch(
                            checked = det?.riprendiAlRiavvio ?: true,
                            onCheckedChange = { v -> scope.launch { tenta("cambiare «riparte al riavvio»") { api.riavvioAutopilota(breve.id, v) } } }
                        )
                    }
                    Text("Se riprendere questo autopilota da solo dopo un riavvio del computer.", color = Banco.testoQuieto, fontSize = 12.sp)
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { quadernoAperto = true }) { Text("Quaderno") }
                        TextButton(onClick = { eliminando = true }) { Text("Elimina", color = Banco.rosso) }
                    }
                }
            }
        }
    }

    if (quadernoAperto) Quaderno(api, breve.cwd, onChiudi = { quadernoAperto = false })
    if (eliminando) {
        AlertDialog(
            onDismissRequest = { eliminando = false },
            title = { Text("Eliminare l’autopilota?") },
            text = { Text("Sparisce con il suo lavoro. Non si disfa.") },
            confirmButton = {
                TextButton(onClick = {
                    eliminando = false
                    // Indietro solo dopo il si' del computer: tornare prima
                    // spegneva questo scope con la risposta dentro, e un
                    // rifiuto restava muto.
                    scope.launch {
                        if (tenta("eliminare l'autopilota") { api.eliminaAutopilota(breve.id) } != null) onIndietro()
                    }
                }) { Text("Elimina", color = Banco.rosso) }
            },
            dismissButton = { TextButton(onClick = { eliminando = false }) { Text("Annulla") } }
        )
    }
}

@Composable
private fun AzioniAutopilota(api: Api, id: String, stato: String) {
    val scope = rememberCoroutineScope()
    var inCorso by remember(id, stato) { mutableStateOf(false) }
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
        "lavoro", "attesa" -> OutlinedButton(
            enabled = !inCorso,
            shape = MaterialTheme.shapes.small,
            onClick = { fai("fermarlo") { api.fermaAutopilota(id) } },
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (inCorso) "Fermo…" else "Ferma — riprende quando vuoi") }
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
        ) { Text(if (inCorso) "Fermo…" else "Si sta preparando (legge il progetto): ferma") }
        else -> Button(
            enabled = !inCorso,
            shape = MaterialTheme.shapes.small,
            onClick = { fai("riprenderlo") { api.riprendiAutopilota(id) } },
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (inCorso) "Riprendo…" else "Riprendi da dove si è fermato") }
    }
}

@Composable
private fun Passaggi(passi: List<Passo>) {
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
    if (nota != null) {
        Spacer(Modifier.height(6.dp))
        Text(nota, color = Banco.testoQuieto, fontSize = 13.sp)
    }
}

/** La barra della misura e, accanto al dettaglio, quante volte e' intervenuto (i cicli). */
@Composable
private fun Misura(m: MisuraPasso, cicli: Int) {
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
private fun interventiInParole(n: Int): String = if (n == 1) "1 intervento" else "$n interventi"

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
private fun senzaSigla(cosa: String): String {
    val freccia = cosa.indexOf('→')
    return if (freccia == -1 || freccia > 20) cosa else cosa.substring(freccia + 1).trim()
}

@Composable
private fun Criterio(c: Criterio) {
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
            Text(c.comando + esito, color = Banco.testoQuieto, fontSize = 12.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(start = 18.dp))
        }
        if (c.raggiuntoIl != null) {
            // Solo l'ora: la data intera in ISO non si legge, e «alle 14:32»
            // e' tutto quello che serve per sapere se e' successo adesso o stamattina.
            val ora = c.raggiuntoIl.drop(11).take(5)
            Text(
                if (ora.isNotBlank()) "raggiunto alle $ora" else "raggiunto ${c.raggiuntoIl}",
                color = Banco.verde, fontSize = 11.sp, modifier = Modifier.padding(start = 18.dp)
            )
        }
    }
}

@Composable
private fun Etichetta(testo: String) {
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
private fun RigaChat(b: Battuta, nomeSuo: String, onVai: () -> Unit) {
    val ora = b.quando.drop(11).take(5)
    if (b.da == "nota") {
        val filo = when (b.tono) {
            "decisione" -> Banco.accento
            "correzione" -> Banco.ambra
            "fine" -> Banco.verde
            "fermo" -> Banco.rosso
            else -> Banco.incisione
        }
        val forte = b.tono == "fine" || b.tono == "fermo"
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.width(2.dp).height(16.dp).background(filo))
            Spacer(Modifier.width(6.dp))
            Text(ora, color = Banco.testoQuieto, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
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

/** Affida un lavoro nuovo: obiettivo + una cartella conosciuta. */
@Composable
private fun Delega(api: Api, onChiudi: () -> Unit) {
    var obiettivo by remember { mutableStateOf("") }
    var cartelle by remember { mutableStateOf<List<String>?>(null) }
    var scelta by remember { mutableStateOf<String?>(null) }
    // Cosa e' andato storto l'ultima volta: un 403 «cartella non conosciuta» o
    // un computer che non risponde erano muti, e il modulo si chiudeva come se
    // l'autopilota fosse partito.
    var errore by remember { mutableStateOf<String?>(null) }
    var mandando by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { cartelle = try { api.cartelle().cartelle } catch (_: Exception) { emptyList() } }

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Affida un lavoro") },
        text = {
            Column(Modifier.fillMaxWidth().height(360.dp)) {
                OutlinedTextField(
                    value = obiettivo,
                    onValueChange = { obiettivo = it },
                    label = { Text("Cosa deve fare") },
                    modifier = Modifier.fillMaxWidth().height(220.dp)
                )
                Spacer(Modifier.height(10.dp))
                Text("In quale cartella:", color = Banco.testoQuieto, fontSize = 12.sp)
                val err = errore
                if (err != null) Text(err, color = Banco.rosso, fontSize = 12.sp)
                Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())) {
                    for (c in cartelle ?: emptyList()) {
                        val sel = c == scelta
                        Text(
                            c.substringAfterLast('\\').substringAfterLast('/'),
                            color = if (sel) Banco.accento else Banco.testo,
                            fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier.fillMaxWidth().clickable { scelta = c }.padding(vertical = 8.dp)
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = obiettivo.isNotBlank() && scelta != null && !mandando,
                onClick = {
                    val o = obiettivo; val c = scelta!!
                    mandando = true
                    scope.launch {
                        try {
                            api.creaAutopilota(o, c)
                            onChiudi()
                        } catch (e: Api.Errore) {
                            errore = when (e.codice) {
                                403 -> "Il computer non conosce questa cartella: apri prima una chat lì."
                                404 -> "Questa cartella non esiste più sul computer."
                                else -> "Non sono riuscito ad affidarlo (HTTP ${e.codice})."
                            }
                        } catch (e: Exception) {
                            errore = "Non sono riuscito ad affidarlo: ${e.message ?: "il computer non risponde"}"
                        }
                        mandando = false
                    }
                }
            ) { Text(if (mandando) "Affido…" else "Affida") }
        },
        dismissButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
}

/** Il quaderno di una cartella: le schede lasciate dall'autopilota. */
@Composable
private fun Quaderno(api: Api, cwd: String, onChiudi: () -> Unit) {
    var schede by remember { mutableStateOf<List<SchedaBreve>?>(null) }
    var aperta by remember { mutableStateOf<SchedaPiena?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(cwd) { schede = try { api.quaderno(cwd).schede } catch (_: Exception) { emptyList() } }

    AlertDialog(
        onDismissRequest = { if (aperta != null) aperta = null else onChiudi() },
        title = { Text(aperta?.titolo?.ifBlank { "Quaderno" } ?: "Quaderno") },
        text = {
            Column(Modifier.fillMaxWidth().height(380.dp).verticalScroll(rememberScrollState())) {
                val ap = aperta
                if (ap != null) {
                    Text(ap.corpo, color = Banco.testo, fontSize = 13.sp)
                } else when {
                    schede == null -> Text("Carico…", color = Banco.testoQuieto)
                    schede!!.isEmpty() -> Text("Nessuna scheda in questa cartella.", color = Banco.testoQuieto)
                    else -> for (s in schede!!) {
                        Text(
                            s.titolo.ifBlank { s.file },
                            color = Banco.testo,
                            modifier = Modifier.fillMaxWidth().clickable {
                                scope.launch { aperta = try { api.scheda(cwd, s.file) } catch (_: Exception) { null } }
                            }.padding(vertical = 10.dp)
                        )
                        HorizontalDivider(color = Banco.incisione)
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
 * Quanto conta adesso, dal più al meno.
 *
 * Non è un giudizio sull’autopilota: è l’ordine in cui vuoi vederli quando
 * prendi in mano il telefono. Prima chi si è fermato — perché senza di te non
 * riparte — poi chi aspetta una risposta, poi chi sta lavorando.
 */
fun urgenzaDi(stato: String): Int = when (stato) {
    "sospeso", "fallito" -> 0
    "attesa" -> 1
    "pronto" -> 2
    "lavoro" -> 3
    "finito" -> 5
    else -> 4
}

/** Lo stato in una parola, quella che diresti tu. */
fun statoInParole(stato: String): String = when (stato) {
    "lavoro" -> "al lavoro"
    "intervista" -> "si prepara"
    "attesa" -> "aspetta te"
    "pronto" -> "pronto a partire"
    "sospeso" -> "fermo"
    "fallito" -> "si è arreso"
    "finito" -> "finito"
    else -> stato
}

/** La fascia dell’elenco: quanti sono, e il gesto per aggiungerne uno. */
@Composable
private fun FasciaLavori(lista: List<AutopilotaBreve>, onDelega: () -> Unit) {
    val fermi = lista.count { it.stato == "sospeso" || it.stato == "fallito" }
    Column {
        Row(
            Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Serigrafia("Lavori")
                Spacer(Modifier.height(3.dp))
                Text(
                    if (fermi > 0) "$fermi in attesa di te" else "${lista.size} affidati",
                    color = if (fermi > 0) Banco.rosso else Banco.testoQuieto,
                    fontSize = 12.sp
                )
            }
            Surface(
                onClick = onDelega,
                color = Banco.fondo,
                contentColor = Banco.testo,
                shape = MaterialTheme.shapes.small,
                border = BorderStroke(1.dp, Banco.incisione)
            ) {
                Text(
                    "+ Affida",
                    color = Banco.accento,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                )
            }
        }
        HorizontalDivider(color = Banco.incisione)
    }
}

/**
 * Un autopilota nell’elenco.
 *
 * Prima era un nome, una riga di stato e «3/7» in fondo: tre informazioni
 * senza gerarchia, e quel rapporto non diceva niente a colpo d’occhio. Ora lo
 * stato è una parola tua («aspetta te», «si è arreso»), i criteri sono una
 * barra — che è come si legge un avanzamento — e il colore del filetto a
 * sinistra si riconosce prima di leggere.
 */
@Composable
private fun VoceAutopilota(ap: AutopilotaBreve, onApri: () -> Unit) {
    val colore = coloreLed(ap.led, ap.stato)
    Tessera(
        onClick = onApri,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp)
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(3.dp).fillMaxHeight().background(colore))
            Column(Modifier.weight(1f).padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        ap.nome,
                        color = Banco.testo,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        modifier = Modifier.weight(1f)
                    )
                    Text(statoInParole(ap.stato), color = colore, fontSize = 12.sp)
                }
                // «Bloccato, provo un'altra strada»: il PC e la pagina lo dicono,
                // l'app lo taceva.
                val sotto = if (ap.strategia.isNotBlank()) "bloccato, provo: ${ap.strategia}" else ap.motivo
                if (sotto.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(sotto, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 2)
                }
                if (ap.criteri > 0) {
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LinearProgressIndicator(
                            progress = { ap.fatti.toFloat() / ap.criteri.toFloat() },
                            color = colore,
                            trackColor = Banco.incisione,
                            modifier = Modifier.weight(1f).height(5.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        // Come sulla pagina: i criteri raggiunti e quante volte
                        // e' intervenuto, che dice quanto gli e' costato.
                        Text(
                            "${ap.fatti} criteri su ${ap.criteri} · ${interventiInParole(ap.cicli)}",
                            color = Banco.testoQuieto,
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }
    }
}