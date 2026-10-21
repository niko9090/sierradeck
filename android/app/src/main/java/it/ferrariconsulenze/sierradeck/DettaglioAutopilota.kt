package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.LocalTextStyle
import androidx.compose.foundation.layout.heightIn
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
internal fun DettaglioAutopilota(api: Api, breve: AutopilotaBreve, onIndietro: () -> Unit, chatDiSessione: (String) -> String? = { null }) {
    var d by remember(breve.id) { mutableStateOf<AutopilotaDettaglio?>(null) }
    var quadernoAperto by remember { mutableStateOf(false) }
    var eliminando by remember { mutableStateOf(false) }
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
    // Le parti del dettaglio (2.83.0): tutte in una pagina che scorre sotto la
    // chat, non più linguette chiuse — ogni parte a due tocchi da Adesso.
    // Nicholas (22/09): la chat e la casella devono restare in vista; la
    // pagina delle parti prende meno spazio della chat e si nasconde.
    var dettagliAperti by remember(breve.id) { mutableStateOf(true) }
    val listaDettagli = rememberLazyListState()
    /** Le domande gia' viste: una nuova apre la linguetta «Domande» (0.38.0). */
    var domandeViste by remember(breve.id) { mutableStateOf<List<String>?>(null) }
    // Se il dettaglio non arriva lo si dice: prima la schermata restava con
    // la sola testata e nessuna spiegazione.
    var guastoDettaglio by remember(breve.id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val lista = rememberLazyListState()

    var pan by remember(breve.id) { mutableStateOf<Panoramica?>(null) }
    LaunchedEffect(breve.id) {
        while (isActive) {
            try {
                d = api.autopilota(breve.id); guastoDettaglio = null
                // PC 0.77.0: la Panoramica del suo workspace. Un PC più vecchio non la ha: niente.
                pan = d?.workspace?.let { ws -> try { api.panoramica(ws) } catch (_: Exception) { null } }
            } catch (e: Exception) {
                guastoDettaglio = if (e is Api.Errore && e.codice == 404) "Il computer non trova più questo autopilota: forse è stato eliminato."
                    else "Non riesco a leggere il dettaglio: ${e.message ?: "il computer non risponde"}. Riprovo da solo ogni due secondi."
            }
            Davanti.pausa(2000)
        }
    }

    val det = d
    val scopeMessaggi = rememberCoroutineScope()
    val chat = det?.chat ?: emptyList()
    val pensa = det?.pensa == true
    val guarda = det != null && det.stato == "intervista" && !det.domanda
    val righe = chat.size + (if (pensa || guarda) 1 else 0)
    // In fondo, come ogni chat: si scorre quando cambia il numero delle righe,
    // non a ogni rilettura, cosi' chi sta rileggendo l'inizio non viene
    // riportato giu' ogni due secondi.
    LaunchedEffect(righe) {
        // L'ultima voce dell'elenco, qualunque cosa ci sia sopra (le fasi, il
        // titolo): contare le battute dava l'indice sbagliato.
        val totale = lista.layoutInfo.totalItemsCount
        if (righe > 0 && totale > 0) lista.animateScrollToItem(totale - 1)
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
                            // Due righe: il motivo intero sta gia' nella striscia in alto e
                            // nella linguetta «Obiettivo»; qui deve restare posto alla chat.
                            Text(perche, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 2)
                        }
                    }
                    // Si vede sempre chi lavora, e lo stato di ogni messaggio (PC 0.69.0).
                    // 0.82.0: lo stato è già nella riga sopra, qui solo ultima azione, da quanto e ⚠.
                    // (solo se la riga sopra dice la stessa parola: altrimenti l'etichetta del PC resta, Revisione 0.82.0)
                    (det?.dalVivo ?: breve.dalVivo)?.let { DalVivo(it, senzaStato = it.etichetta == statoInParole(s)) }
                    det?.adesso?.let { AdessoVista(it) }
                    MessaggiVersoLaChat(det?.messaggi ?: emptyList()) {
                        scopeMessaggi.launch {
                            try { api.mandaAdessoAutopilota(breve.id); d = api.autopilota(breve.id) } catch (_: Exception) { }
                        }
                    }
                }
                TextButton(onClick = { quadernoAperto = true }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Quaderno", fontSize = 13.sp) }
                Punto(coloreLed(breve.led, det?.stato ?: breve.stato))
            }
            HorizontalDivider(color = Banco.incisione)
        }

        // Il gesto principale sta **fuori** dallo scorrimento: il momento in
        // cui vuoi premere «Riprendi» e' proprio dopo aver letto perche' si e'
        // fermato.
        Column(Modifier.fillMaxWidth().background(Banco.fondo).padding(horizontal = 16.dp, vertical = 8.dp)) {
            AzioniAutopilota(api, breve.id, det?.stato ?: breve.stato, det?.workspace)
        }
        HorizontalDivider(color = Banco.incisione)

        // ─── la chat con lui: tutto lo spazio che resta ───
        //
        // Le fasi e la misura **scorrono con la chat**, come prime voci
        // dell'elenco: prima stavano fisse sopra e, con la tastiera aperta,
        // mangiavano tutto lo spazio della meta' di sopra — la chat spariva e la
        // casella finiva sotto le linguette, fuori dallo schermo.
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp)) {
            // PC 0.79.0: chi lavora adesso, sempre in vista sopra la conversazione.
            pan?.alLavoro?.let { r -> AlLavoro(r) { id -> Apertura.apriChat(id) } }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = lista) {
                if (det != null && det.passaggi.isNotEmpty()) item {
                    Spacer(Modifier.height(8.dp))
                    // Il motivo del fermo sta gia' nell'intestazione: qui la nota
                    // delle fasi si mostra solo quando dice altro.
                    Passaggi(det.passaggi, mostraNota = det.stato != "sospeso" && det.stato != "fallito")
                    Spacer(Modifier.height(6.dp))
                    Misura(det.misura, det.cicli)
                    det.tempi?.let { Text("Tempi: $it", color = Banco.testoQuieto, fontSize = 12.sp) }
                    Spacer(Modifier.height(6.dp))
                }
                guastoDettaglio?.let { g -> item { Text(g, color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(vertical = 6.dp)) } }
                // PC 0.77.0: la Panoramica in cima, una scheda per chat; il tocco apre la chat a tutto schermo.
                pan?.let { p -> item { PanoramicaVista(p) { id -> Apertura.apriChat(id) } } }
                item { Serigrafia("Chat con lui") }
                // PC 0.78.0: con la Panoramica 2 solo la conversazione; gli eventi tecnici in «Cosa è successo ▸».
                // PC 0.79.0: senza la Panoramica 2 il diario è intero, le righe corte dei traguardi sarebbero un doppione.
                val (messaggi, eventi) = if (pan?.situazione != null) RegolePanoramica.separaConversazione(chat) else chat.filter { it.tono != "traguardo" } to emptyList()
                if (eventi.isNotEmpty()) item { CosaESuccesso(eventi) }
                items(messaggi) { b ->
                    // Il testo della chat con lui si seleziona e si copia (tocco
                    // lungo): senza SelectionContainer un Text di Compose non e'
                    // selezionabile, e Nicholas non riusciva a copiarne niente.
                    // La casella sotto e' un campo di testo: l'incolla c'e' da se'.
                    androidx.compose.foundation.text.selection.SelectionContainer {
                        RigaChat(b, breve.nome) {
                            scope.launch { tenta("farlo partire") { api.vaiAutopilota(breve.id) } }
                        }
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
                // PC 0.75.4: ha promesso lavoro ed è fermo. Mai più una promessa muta.
                if (!pensa && det?.fermoConPromessa == true) item {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                        Text(
                            "● L'autopilota è fermo (${det.stato}).",
                            color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = { scope.launch { tenta("riprenderlo") { api.riprendiAutopilota(breve.id) } } }) { Text("Riprendi") }
                    }
                }
            }
            // Le sue domande non si rispondono da qui (0.38.0): stanno nella
            // linguetta «Domande» qui sotto, una per volta. La casella parla con lui.
            val domanda = false
            if (det != null && (det.domandeScheda.isNotEmpty() || det.domanda)) {
                Text(
                    // Un PC prima della 0.38.0 non ha la linguetta: si dice dove rispondere.
                    if (FunzioniPc.disponibile(FunzionePc.DOMANDE_AUTOPILOTA, PcCorrente.versione) == false)
                        "Ti ha fatto una domanda: rispondi dalla cima di Adesso. " + FunzioniPc.testoMancante(FunzionePc.DOMANDE_AUTOPILOTA)
                    else "Ti ha fatto una domanda: è qui sotto, in «Domande», con il numero di quelle aperte.",
                    color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp)
                )
            }
            OutlinedTextField(
                value = messaggio,
                onValueChange = { messaggio = it },
                label = { Text(if (domanda) "La tua risposta" else "Scrivigli qui: una domanda, un vincolo, «fermati», «riprendi»…") },
                textStyle = LocalTextStyle.current.copy(fontSize = 14.sp, color = Banco.testo),
                // Gli stessi colori della chat: il testo che scrivi si deve
                // leggere sul fondo scuro.
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Banco.accento,
                    unfocusedBorderColor = Banco.incisione,
                    focusedContainerColor = Banco.fondo,
                    unfocusedContainerColor = Banco.fondo,
                    focusedTextColor = Banco.testo,
                    unfocusedTextColor = Banco.testo,
                    cursorColor = Banco.accento
                ),
                maxLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
            // Il microfono (2.75.0): il testo dettato va nel campo, lo mandi tu.
            TastoMicrofono(messaggio) { messaggio = it }
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
                                notaDialogo = if (FunzioniPc.mancaSulPc(e)) FunzioniPc.testoMancante(FunzionePc.DIALOGO_AUTOPILOTA)
                                else "Non sono riuscito a mandarlo (HTTP ${e.codice})."
                            } catch (e: Exception) {
                                notaDialogo = "Non sono riuscito a mandarlo: ${e.message ?: "il computer non risponde"}"
                            }
                            mandando = false
                        }
                    }
                ) { Text(if (mandando) "Mando…" else if (domanda) "Rispondi" else "Manda") }
                OutlinedButton(enabled = !mandando, shape = MaterialTheme.shapes.small, onClick = { sceglieFile.launch("*/*") }) { Text("📎 Allega") }
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

        // ─── le sue parti: la meta' di sotto, in una pagina che scorre ───
        // Un PC vecchio (2.52.6): quello che non manda ancora, detto in una riga
        // per parte, invece di linguette vuote che sembrano un guasto.
        val avvisi = FunzioniPc.avvisiScheda(PcCorrente.versione, PcCorrente.nome)
        if (avvisi.isNotEmpty()) {
            Text(
                avvisi.joinToString("\n"),
                color = Banco.ambra, fontSize = 11.sp,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
            )
        }
        // Le linguette per chiave (0.38.0): «Domande» per prima solo se ce ne sono.
        val schede = det?.domandeScheda ?: emptyList()
        val chiavi = linguetteAutopilota(schede.size)
        val nomi = chiavi.map { k ->
            when (k) {
                "domande" -> "Domande ${schede.size}"
                "istruzioni" -> "Istruzioni"
                "file" -> "File"
                "obiettivo" -> "Obiettivo"
                "criteri" -> "Criteri" + (det?.criteri?.takeIf { it.isNotEmpty() }?.let { " ${it.count { c -> c.soddisfatto }}/${it.size}" } ?: "")
                "compiti" -> "Compiti" + (det?.compitiDaFare?.takeIf { it.isNotEmpty() }?.let { " ${it.size}" } ?: "")
                "deciso" -> "Ha deciso"
                else -> "Altro"
            }
        }
        // Una domanda nuova apre le parti e le porta in cima, dove c'è «Domande».
        val chiaviDomande = schede.map { it.chiave }
        LaunchedEffect(chiaviDomande.joinToString("|")) {
            if (domandaArrivata(domandeViste, schede)) { dettagliAperti = true; listaDettagli.scrollToItem(0) }
            domandeViste = chiaviDomande
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Serigrafia("Le sue parti", modifier = Modifier.padding(start = 8.dp).weight(1f))
            TextButton(onClick = { dettagliAperti = !dettagliAperti }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(if (dettagliAperti) "Nascondi ▾" else "Mostra ▴", fontSize = 13.sp)
            }
        }
        // Istruzioni e File in fondo: si leggono dal PC solo quando ci si arriva scorrendo.
        if (dettagliAperti) LazyColumn(Modifier.weight(0.8f).fillMaxWidth().padding(horizontal = 16.dp), state = listaDettagli) {
          for (k in sezioniAutopilota(schede.size)) item(key = k) {
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
            Text(nomi[chiavi.indexOf(k)], color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Spacer(Modifier.height(4.dp))
            when (k) {
                "domande" -> LinguettaDomande(api, breve.id, schede, onRisposto = { scope.launch { try { d = api.autopilota(breve.id) } catch (_: Exception) {} } })
                "istruzioni" -> LinguettaIstruzioni(api, breve.id)
                "file" -> LinguettaFile(api, breve.id)
                "obiettivo" -> {
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
                        val specialisti = det.specialisti
                        // PC 0.73.0: gli specialisti, con «Guarda» che apre la loro chat.
                        if (specialisti != null) SpecialistiVista(specialisti) { sessione ->
                            chatDiSessione(sessione)?.let { Apertura.apriChat(it) }
                        } else Etichetta(if (det.chats.size > 1) "IL COORDINATORE E LE SUE CHAT" else "LA SUA CHAT")
                        val albero = det.albero
                        if (specialisti != null) Unit
                        else if (albero != null && albero.figli.isNotEmpty()) {
                            // T7 (0.36.0): l'albero — sotto il coordinatore, ogni chat
                            // con il suo pezzo, lo stato, il ramo del worktree e i giri.
                            Text(
                                "coordinatore · ${albero.parola}" + (det.ramoBase?.let { " · ramo principale $it" } ?: ""),
                                color = Banco.testoQuieto, fontSize = 12.sp
                            )
                            for (f in albero.figli) RigaAlbero(f)
                        } else if (det.chats.isEmpty()) {
                            Text(
                                if (det.stato == "intervista" || det.stato == "pronto") "Non è ancora partita: nasce quando dai il via."
                                else "Nessuna chat aperta adesso.",
                                color = Banco.testoQuieto, fontSize = 13.sp
                            )
                        } else det.chats.forEachIndexed { i, ch ->
                            val stato = parolaChatGovernata(det.stato, ch.stato)
                            Text(
                                "chat ${i + 1} · $stato · ${ch.cicli} " + (if (ch.cicli == 1) "giro" else "giri") +
                                    (if (det.chats.size > 1) "\n${ch.compito}" else ""),
                                color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(vertical = 3.dp)
                            )
                        }
                    }
                }
                "criteri" -> {
                    Etichetta("FINISCE QUANDO")
                    if (det == null || det.criteri.isEmpty()) {
                        Text("Ancora nessun criterio: li scrive lui alla fine della preparazione.", color = Banco.testoQuieto, fontSize = 13.sp)
                    } else {
                        for (c in det.criteri) CriterioVista(c)
                        Spacer(Modifier.height(8.dp))
                        RigaConAiuto("Per riscriverli usa il PC, o diglielo nella chat.", "Il comando sotto ogni criterio è quello che lo misura a ogni fermata. Per riscriverli usa il PC, o diglielo nella chat qui sopra.")
                    }
                }
                "compiti" -> {
                    Etichetta("PRIMA FA")
                    val compiti = det?.compitiDaFare ?: emptyList()
                    if (compiti.isEmpty()) {
                        Text("Niente in coda: lavora sull’obiettivo. Per aggiungere un compito diglielo nella chat qui sopra.", color = Banco.testoQuieto, fontSize = 13.sp)
                    } else compiti.forEachIndexed { i, c ->
                        Text("${i + 1}. $c", color = Banco.testo, fontSize = 13.sp, modifier = Modifier.padding(vertical = 3.dp))
                    }
                }
                "deciso" -> {
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
                        val ora = oraLocale(dec.quando)
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
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Lavora in sottofondo", color = Banco.testo, modifier = Modifier.weight(1f))
                        Switch(
                            checked = det?.sottofondo == true,
                            onCheckedChange = { v -> scope.launch { tenta("cambiare «lavora in sottofondo»") { api.sottofondoAutopilota(breve.id, v) } } }
                        )
                    }
                    Text("Spento: la sua chat sta in un riquadro del suo workspace sul computer, che ci va quando l’autopilota le scrive (mai mentre scrivi lì). Acceso: lavora senza riquadro, e la vedi con «in sottofondo» e Guarda.", color = Banco.testoQuieto, fontSize = 12.sp)
                    Spacer(Modifier.height(12.dp))
                    TextButton(onClick = { eliminando = true }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Elimina", color = Banco.rosso) }
                }
            }
            }
          }
        }
    }

    if (quadernoAperto) Quaderno(api, breve.cwd, onChiudi = { quadernoAperto = false })
    if (eliminando) {
        // Cosa succede e cosa no, per esteso (app 2.55.0): prima «Sparisce con il suo lavoro».
        DialogoConferma(AzioniTelefono.confermaEliminaAutopilota(breve.nome.ifBlank { breve.id }), pericolo = true, onSi = {
            eliminando = false
            // Indietro solo dopo il si' del computer: tornare prima
            // spegneva questo scope con la risposta dentro, e un
            // rifiuto restava muto.
            scope.launch {
                if (tentaGestione("eliminare l'autopilota", SuPc.corrente?.nome) { api.eliminaAutopilota(breve.id) } != null) onIndietro()
            }
        }, onNo = { eliminando = false })
    }
}
