package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * L'autopilota del workspace (2.83.0; autopilota unico PC 0.86.x): una riga
 * riassuntiva in alto (domande, percentuale, richieste aperte, specialisti)
 * che si apre con un tocco; sotto la conversazione con lui, l'avanzamento in
 * breve in cima e le sue domande aperte in fondo; la casella sempre in basso.
 *
 * L'autopilota unico è sempre acceso: niente più obiettivo, criteri, compiti,
 * istruzioni, «Vai», «Ferma», «Riprendi», «Archivia», «Sposta», «Elimina»,
 * «Riparte al riavvio» e «Lavora in sottofondo». Gli si parla e basta: le
 * richieste entrano nella sua coda, e la percentuale dice quanto manca.
 */
@Composable
internal fun DettaglioAutopilota(api: Api, breve: AutopilotaBreve, onIndietro: () -> Unit, chatDiSessione: (String) -> String? = { null }) {
    var d by remember(breve.id) { mutableStateOf<AutopilotaDettaglio?>(null) }
    // La conversazione intera (PC 0.86.0): solo dopo «Mostra tutta la conversazione».
    var intera by remember(breve.id) { mutableStateOf(false) }
    var quadernoAperto by remember { mutableStateOf(false) }
    var storicoAperto by remember { mutableStateOf<String?>(null) }
    // La casella: cosa stai scrivendo, se lo stai mandando, e cosa e' andato
    // storto l'ultima volta (un 409 e' un computer da aggiornare).
    var messaggio by remember(breve.id) { mutableStateOf("") }
    var mandando by remember(breve.id) { mutableStateOf(false) }
    // «📎 Allega» (app 2.50.0): un file nella sua cartella, e il messaggio nel suo dialogo.
    var allegando by remember(breve.id) { mutableStateOf<List<android.net.Uri>?>(null) }
    val sceglieFile = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetMultipleContents()
    ) { uris -> if (uris.isNotEmpty()) allegando = uris }
    allegando?.let { uris ->
        SchermoMandaA(api, null, uris, fissa = DestinazioneFile("autopilota", breve.id, breve.nome)) { allegando = null }
    }
    var notaDialogo by remember(breve.id) { mutableStateOf<String?>(null) }
    // La riga riassuntiva (2.83.0, c-509): chiusa, sotto c'è solo la conversazione.
    var riassuntoAperto by remember(breve.id) { mutableStateOf(false) }
    // Se il dettaglio non arriva lo si dice: prima la schermata restava con
    // la sola testata e nessuna spiegazione.
    var guastoDettaglio by remember(breve.id) { mutableStateOf<String?>(null) }
    // L'avanzamento (PC 0.86.x): percentuale, coda delle richieste, specialisti.
    var av by remember(breve.id) { mutableStateOf<AvanzamentoAutopilota?>(null) }
    var notaAvanzamento by remember(breve.id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val lista = rememberLazyListState()

    var pan by remember(breve.id) { mutableStateOf<Panoramica?>(null) }
    LaunchedEffect(breve.id) {
        var panIl = 0L
        var avIl = 0L
        // Un PC che non conosce l'avanzamento (più vecchio della 0.86.x) lo dice una volta sola.
        var avAssente = false
        while (isActive) {
            try {
                // Leggera (PC 0.86.0), con l'ETag: uguale a prima non viaggia niente.
                d = api.autopilota(breve.id, intera); guastoDettaglio = null
                val ora = System.currentTimeMillis()
                // PC 0.77.0: la Panoramica del suo workspace. Un PC più vecchio non la ha: niente.
                // Ogni dieci secondi (app 2.86.0), non a ogni giro: chi lavora non cambia ogni due.
                if (pan == null || ora - panIl >= PANORAMICA_OGNI_MS) {
                    panIl = ora
                    pan = d?.workspace?.let { ws -> try { api.panoramica(ws) } catch (_: Exception) { null } }
                }
                if (!avAssente && (av == null || ora - avIl >= AVANZAMENTO_OGNI_MS)) {
                    avIl = ora
                    try {
                        av = api.avanzamentoAutopilota(d?.workspace, breve.id); notaAvanzamento = null
                    } catch (e: Api.Errore) {
                        if (FunzioniPc.mancaSulPc(e)) {
                            avAssente = true
                            notaAvanzamento = "Questo computer non manda ancora l’avanzamento: aggiornalo alla 0.86."
                        } else notaAvanzamento = "Non riesco a leggere l’avanzamento (HTTP ${e.codice}): riprovo da solo."
                    } catch (e: Exception) {
                        notaAvanzamento = "Non riesco a leggere l’avanzamento: ${e.message ?: "il computer non risponde"}. Riprovo da solo."
                    }
                }
            } catch (e: Exception) {
                guastoDettaglio = if (e is Api.Errore && e.codice == 404) "Il computer non trova più questo autopilota."
                    else "Non riesco a leggere il dettaglio: ${e.message ?: "il computer non risponde"}. Riprovo da solo ogni due secondi."
            }
            Davanti.pausa(2000)
        }
    }

    val det = d
    val chat = det?.chat ?: emptyList()
    val pensa = det?.pensa == true || av?.orchestratore?.pensa == true
    // Le battute di tutta la conversazione, anche se ne arrivano solo le ultime (PC 0.86.0).
    val righe = (det?.chatIntera ?: chat.size) + (if (pensa) 1 else 0)
    // In fondo, come ogni chat: si scorre quando cambia il numero delle righe,
    // non a ogni rilettura, cosi' chi sta rileggendo l'inizio non viene
    // riportato giu' ogni due secondi.
    LaunchedEffect(righe) {
        // L'ultima voce dell'elenco, qualunque cosa ci sia sopra: contare le
        // battute dava l'indice sbagliato.
        val totale = lista.layoutInfo.totalItemsCount
        if (righe > 0 && totale > 0) lista.animateScrollToItem(totale - 1)
    }

    // Nicholas (21/10): «non si vede nulla, troppe info che occupano tutto lo
    // schermo». In alto una riga sola che si apre con un tocco; sotto la
    // conversazione; la casella sempre in basso, sopra la tastiera.
    val schede = det?.domandeScheda ?: emptyList()
    val richieste = av?.coda?.richieste ?: emptyList()
    val aperte = richieste.count { it.stato != "fatta" }
    val specialistiOrch = av?.orchestratore?.specialisti ?: emptyList()
    val ricaricaDettaglio: () -> Unit = { scope.launch { try { d = api.autopilota(breve.id, intera) } catch (_: Exception) {} } }
    BackHandler(enabled = riassuntoAperto) { riassuntoAperto = false }
    Column(Modifier.fillMaxSize().imePadding()) {
        Row(
            Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 4.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onIndietro, modifier = Modifier.size(48.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro", tint = Banco.testo)
            }
            Text(breve.nome, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1, fontSize = 16.sp, modifier = Modifier.weight(1f))
            Punto(coloreLed(breve.led, det?.stato ?: breve.stato))
            Spacer(Modifier.width(12.dp))
        }
        val riga = RiassuntoAutopilota.di(av?.percento, aperte, specialistiOrch.size, schede.size, pensa)
        Column(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).background(Banco.chassis)
                .tocco { riassuntoAperto = !riassuntoAperto }.padding(horizontal = 16.dp, vertical = 6.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    riga, color = if (schede.isNotEmpty()) Banco.ambra else Banco.testo,
                    fontSize = 14.sp, maxLines = 2, modifier = Modifier.weight(1f)
                )
                Text(if (riassuntoAperto) "Chiudi ▴" else "Dettagli ▾", color = Banco.accento, fontSize = 14.sp)
            }
            av?.percento?.let { p -> BarraPercento(p) }
        }
        HorizontalDivider(color = Banco.incisione)

        if (riassuntoAperto) LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp)) {
            item(key = "stato") {
                Column(Modifier.padding(vertical = 8.dp)) {
                    // Si vede sempre chi lavora (PC 0.69.0).
                    val s = breve.stato
                    (det?.dalVivo ?: breve.dalVivo)?.let { DalVivo(it, senzaStato = it.etichetta == statoInParole(s)) }
                    Row {
                        TextButton(onClick = { quadernoAperto = true }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Quaderno del progetto") }
                        // PC 0.84.0: chat aperte, consegne, unioni, chiusure, release e decisioni di Nicholas.
                        det?.storico?.let { TextButton(onClick = { storicoAperto = it }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Storico") } }
                    }
                }
            }
            // PC 0.77.0/0.79.0: la Panoramica del suo workspace e chi lavora adesso.
            pan?.let { p ->
                item(key = "panoramica") {
                    Column {
                        p.alLavoro?.let { r -> AlLavoro(r) { id -> Apertura.apriChat(id) } }
                        PanoramicaVista(p) { id -> Apertura.apriChat(id) }
                    }
                }
            }
            // Un PC vecchio (2.52.6): quello che non manda ancora, una riga per parte.
            val avvisi = FunzioniPc.avvisiScheda(PcCorrente.versione, PcCorrente.nome)
            if (avvisi.isNotEmpty()) item(key = "avvisi") { Text(avvisi.joinToString("\n"), color = Banco.ambra, fontSize = 12.sp) }
            for (k in sezioniAutopilota(schede.size)) item(key = k) {
                Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Text(
                        when (k) {
                            "domande" -> "Domande ${schede.size}"
                            "avanzamento" -> "Avanzamento" + (av?.percento?.let { " " + RegoleAvanzamento.percento(it) } ?: "")
                            else -> "File"
                        },
                        color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp
                    )
                    Spacer(Modifier.height(4.dp))
                    when (k) {
                        "domande" -> LinguettaDomande(api, breve.id, schede, onRisposto = ricaricaDettaglio)
                        "avanzamento" -> {
                            AvanzamentoVista(av, notaAvanzamento)
                            // Un servizio senza specialisti dell'orchestratore: quelli della scheda, con «Guarda».
                            val specialisti = det?.specialisti
                            if (specialistiOrch.isEmpty() && specialisti != null && specialisti.elenco.isNotEmpty()) {
                                Spacer(Modifier.height(8.dp))
                                SpecialistiVista(specialisti) { sessione -> chatDiSessione(sessione)?.let { Apertura.apriChat(it) } }
                            }
                        }
                        else -> LinguettaFile(api, breve.id)
                    }
                }
            }
        } else LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp), state = lista) {
            guastoDettaglio?.let { g -> item(key = "guasto") { Text(g, color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(vertical = 6.dp)) } }
            // L'avanzamento in breve, in cima: le richieste che stanno andando avanti.
            item(key = "avanzamento-breve") { AvanzamentoBreve(av) { riassuntoAperto = true } }
            // PC 0.78.0: con la Panoramica 2 solo la conversazione; gli eventi tecnici in «Cosa è successo ▸».
            val (messaggi, eventi) = if (pan?.situazione != null) RegolePanoramica.separaConversazione(chat) else chat.filter { it.tono != "traguardo" } to emptyList()
            if (eventi.isNotEmpty()) item(key = "eventi") { CosaESuccesso(eventi) }
            // Leggera (PC 0.86.0): le ultime battute; le altre con un tocco.
            val primaDi = RegoleSchedaLeggera.righePrima(det)
            if (primaDi > 0 && !intera) item(key = "intera") {
                TextButton(onClick = {
                    intera = true
                    scope.launch { try { d = api.autopilota(breve.id, true) } catch (_: Exception) { } }
                }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Mostra tutta la conversazione ($primaDi righe prima)") }
            }
            val chiavi = ChiaviElenco.di(messaggi, ChiaviElenco::battuta)
            itemsIndexed(messaggi, key = { i, _ -> chiavi[i] }) { _, b ->
                // Il testo della chat con lui si seleziona e si copia (tocco
                // lungo): senza SelectionContainer un Text di Compose non e'
                // selezionabile, e Nicholas non riusciva a copiarne niente.
                // La casella sotto e' un campo di testo: l'incolla c'e' da se'.
                androidx.compose.foundation.text.selection.SelectionContainer {
                    RigaChat(b, breve.nome)
                }
            }
            if (pensa) item(key = "pensa") {
                Text(
                    "● sta pensando… di solito entro qualche minuto. Puoi scrivergli altro: le richieste entrano nella sua coda.",
                    color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp)
                )
            }
            // Le sue domande aperte, in fondo, dove arriva il pollice: si rispondono da qui.
            if (schede.isNotEmpty()) item(key = "domande-aperte") {
                Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Etichetta(if (schede.size == 1) "TI CHIEDE" else "TI CHIEDE · ${schede.size} DOMANDE")
                    LinguettaDomande(api, breve.id, schede, onRisposto = ricaricaDettaglio)
                }
            }
        }

        // ─── la casella: sempre in basso, sopra la tastiera ───
        HorizontalDivider(color = Banco.incisione)
        Column(Modifier.fillMaxWidth().background(Banco.fondo).padding(horizontal = 12.dp, vertical = 6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = messaggio,
                    onValueChange = { messaggio = it },
                    placeholder = { Text("Scrivigli: una richiesta, una domanda, un vincolo…", fontSize = 14.sp) },
                    textStyle = LocalTextStyle.current.copy(fontSize = 15.sp, color = Banco.testo),
                    // Gli stessi colori della chat: il testo si deve leggere sul fondo scuro.
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Banco.accento,
                        unfocusedBorderColor = Banco.incisione,
                        focusedContainerColor = Banco.fondo,
                        unfocusedContainerColor = Banco.fondo,
                        focusedTextColor = Banco.testo,
                        unfocusedTextColor = Banco.testo,
                        cursorColor = Banco.accento
                    ),
                    maxLines = 4,
                    modifier = Modifier.weight(1f)
                )
                Button(
                    enabled = messaggio.isNotBlank() && !mandando,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.heightIn(min = 48.dp),
                    onClick = {
                        val testo = messaggio.trim()
                        mandando = true
                        scope.launch {
                            try {
                                api.dialogaAutopilota(breve.id, testo)
                                messaggio = ""
                                notaDialogo = null
                                try { d = api.autopilota(breve.id, intera) } catch (_: Exception) {}
                            } catch (e: Api.Errore) {
                                notaDialogo = if (FunzioniPc.mancaSulPc(e)) FunzioniPc.testoMancante(FunzionePc.DIALOGO_AUTOPILOTA)
                                else "Non sono riuscito a mandarlo (HTTP ${e.codice})."
                            } catch (e: Exception) {
                                notaDialogo = "Non sono riuscito a mandarlo: ${e.message ?: "il computer non risponde"}"
                            }
                            mandando = false
                        }
                    }
                ) { Text(if (mandando) "Mando…" else "Manda") }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Il microfono (2.75.0): il testo dettato va nel campo, lo mandi tu.
                Box(Modifier.weight(1f)) { TastoMicrofono(messaggio) { messaggio = it } }
                TextButton(enabled = !mandando, onClick = { sceglieFile.launch("*/*") }, modifier = Modifier.heightIn(min = 48.dp)) { Text("📎 Allega") }
            }
            notaDialogo?.let { Text(it, color = Banco.rosso, fontSize = 13.sp) }
        }
    }

    if (quadernoAperto) Quaderno(api, breve.cwd, onChiudi = { quadernoAperto = false })
    storicoAperto?.let { f -> Quaderno(api, breve.cwd, onChiudi = { storicoAperto = null }, apriFile = f) }
}

/** La barra della percentuale del workspace. */
@Composable
private fun BarraPercento(p: Double) {
    val f = (p / 100.0).coerceIn(0.0, 1.0).toFloat()
    LinearProgressIndicator(
        progress = { f },
        color = Banco.verde,
        trackColor = Banco.incisione,
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp).height(6.dp)
    )
}

/**
 * L'avanzamento in breve, sopra la conversazione: le richieste che stanno
 * andando avanti (al più tre) con stato e percentuale. Un tocco apre i dettagli.
 */
@Composable
private fun AvanzamentoBreve(av: AvanzamentoAutopilota?, onApri: () -> Unit) {
    val richieste = av?.coda?.richieste?.filter { it.stato != "fatta" } ?: emptyList()
    if (av == null || (richieste.isEmpty() && av.percento == null)) return
    Column(Modifier.fillMaxWidth().tocco(onClick = onApri).padding(vertical = 6.dp)) {
        for (r in richieste.take(3)) {
            Text(
                "${r.titolo.ifBlank { r.testo }.take(80)} · ${RegoleAvanzamento.parolaStato(r.stato)} · ${RegoleAvanzamento.percento(r.percento)}",
                color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1
            )
        }
        if (richieste.size > 3) Text("e altre ${richieste.size - 3} richieste ▸", color = Banco.accento, fontSize = 12.sp)
    }
}

/**
 * L'avanzamento intero (PC 0.86.x): la percentuale del workspace (e perché è
 * scesa, se è scesa), il piano, le richieste in coda con stato e percentuale,
 * gli specialisti al lavoro.
 */
@Composable
private fun AvanzamentoVista(av: AvanzamentoAutopilota?, nota: String?) {
    nota?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    if (av == null) {
        if (nota == null) Text("Leggo l’avanzamento…", color = Banco.testoQuieto, fontSize = 13.sp)
        return
    }
    val o = av.orchestratore
    val p = av.percento
    if (p == null) {
        Text("Ancora nessuna percentuale: arriva quando ha un piano.", color = Banco.testoQuieto, fontSize = 13.sp)
    } else {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { BarraPercento(p) }
            Spacer(Modifier.width(10.dp))
            Text(RegoleAvanzamento.percento(p), color = Banco.verde, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
    val sotto = listOfNotNull(
        o?.piano?.takeIf { it.totale > 0 }?.let { "${it.uniti} di ${it.totale} compiti uniti" },
        if (o?.pensa == true) "sta pensando" else null
    )
    if (sotto.isNotEmpty()) Text(sotto.joinToString(" · "), color = Banco.testoQuieto, fontSize = 12.sp)
    av.calo?.let { c ->
        Text("scesa da ${RegoleAvanzamento.percento(c.da)} a ${RegoleAvanzamento.percento(c.a)}: ${c.perche}", color = Banco.ambra, fontSize = 12.sp)
    }
    Spacer(Modifier.height(10.dp))
    val richieste = RegoleAvanzamento.ordinate(av.coda?.richieste ?: emptyList())
    Etichetta("RICHIESTE · ${richieste.size}")
    if (richieste.isEmpty()) {
        Text("Nessuna richiesta in coda: scrivigli cosa vuoi nella casella qui sotto.", color = Banco.testoQuieto, fontSize = 13.sp)
    } else {
        for (r in richieste) {
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Text(r.titolo.ifBlank { r.testo }, color = if (r.stato == "fatta") Banco.testoQuieto else Banco.testo, fontSize = 13.sp)
                Text(RegoleAvanzamento.rigaRichiesta(r), color = Banco.testoQuieto, fontSize = 12.sp)
            }
        }
    }
    Spacer(Modifier.height(10.dp))
    val specialisti = o?.specialisti ?: emptyList()
    Etichetta("SPECIALISTI · ${specialisti.size}")
    if (specialisti.isEmpty()) {
        Text("Nessuno specialista al lavoro adesso.", color = Banco.testoQuieto, fontSize = 13.sp)
    } else {
        for (s in specialisti) {
            Text(RegoleAvanzamento.rigaSpecialista(s), color = Banco.testo, fontSize = 13.sp, modifier = Modifier.padding(vertical = 3.dp))
        }
    }
}

/** Ogni quanto si rilegge la Panoramica dalla scheda di un autopilota (app 2.86.0). */
internal const val PANORAMICA_OGNI_MS = 10_000L

/** Ogni quanto si rilegge l'avanzamento dell'autopilota unico (PC 0.86.x). */
internal const val AVANZAMENTO_OGNI_MS = 5_000L

/** La scheda leggera (PC 0.86.0), lato app. */
internal object RegoleSchedaLeggera {
    /** Quante battute della conversazione non sono arrivate (0 = c'è tutta). */
    fun righePrima(d: AutopilotaDettaglio?): Int = d?.chatIntera?.let { (it - d.chat.size).coerceAtLeast(0) } ?: 0
}
