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
fun Lavori(apiAccoppiato: Api, statoAccoppiato: Stato?, apri: String? = null, onAperto: () -> Unit = {}) {
    // Gli autopiloti del PC che stai guardando (app 2.55.0): con «Chat di X
    // dal vivo» quelli di X, attraverso il ponte, con la fascia viola in cima.
    val su = SuPc.corrente
    val api = remember(su?.pcId, apiAccoppiato) { su?.let { apiAccoppiato.suPc(it.pcId) } ?: apiAccoppiato }
    var statoSu by remember(su?.pcId) { mutableStateOf<Stato?>(null) }
    LaunchedEffect(su?.pcId) {
        if (su == null) return@LaunchedEffect
        while (isActive) {
            statoSu = try { api.stato() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { statoSu }
            delay(3000)
        }
    }
    val stato = if (su != null) statoSu else statoAccoppiato
    var aperto by remember { mutableStateOf<String?>(null) }
    // Dalla scheda Domande: «apri la sua linguetta Domande» (0.38.0).
    LaunchedEffect(apri) { if (apri != null) { aperto = apri; onAperto() } }
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
            if (su != null) FasciaSuPc(su, null) { SuPc.corrente = null }
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
        if (delega) Delega(apiAccoppiato, statoAccoppiato, onChiudi = { delega = false })
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
    // «📎 Allega» (app 2.50.0): un file nella sua cartella, e il messaggio nel suo dialogo.
    var allegando by remember(breve.id) { mutableStateOf<List<android.net.Uri>?>(null) }
    val sceglieFile = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetMultipleContents()
    ) { uris -> if (uris.isNotEmpty()) allegando = uris }
    allegando?.let { uris ->
        SchermoMandaA(api, null, uris, fissa = DestinazioneFile("autopilota", breve.id, breve.nome)) { allegando = null }
    }
    var notaDialogo by remember(breve.id) { mutableStateOf<String?>(null) }
    var linguetta by remember(breve.id) { mutableStateOf(0) }
    // Le linguette nascono **chiuse**: Nicholas (22/09, con una foto) — «non
    // vedo cosa scrivo, non scorre la pagina e non vedo la chat». La meta' di
    // sotto si prendeva meta' schermo anche con la tastiera aperta, e la
    // casella finiva fuori. Aperta una linguetta, il suo contenuto ha un tetto
    // e la chat resta sopra; toccarla di nuovo la richiude.
    var linguettaAperta by remember(breve.id) { mutableStateOf(false) }
    /** Le domande gia' viste: una nuova apre la linguetta «Domande» (0.38.0). */
    var domandeViste by remember(breve.id) { mutableStateOf<List<String>?>(null) }
    // Se il dettaglio non arriva lo si dice: prima la schermata restava con
    // la sola testata e nessuna spiegazione.
    var guastoDettaglio by remember(breve.id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val lista = rememberLazyListState()

    LaunchedEffect(breve.id) {
        while (isActive) {
            try { d = api.autopilota(breve.id); guastoDettaglio = null } catch (e: Exception) {
                guastoDettaglio = if (e is Api.Errore && e.codice == 404) "Il computer non trova più questo autopilota: forse è stato eliminato."
                    else "Non riesco a leggere il dettaglio: ${e.message ?: "il computer non risponde"}. Riprovo da solo ogni due secondi."
            }
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

        // ─── la chat con lui: tutto lo spazio che resta ───
        //
        // Le fasi e la misura **scorrono con la chat**, come prime voci
        // dell'elenco: prima stavano fisse sopra e, con la tastiera aperta,
        // mangiavano tutto lo spazio della meta' di sopra — la chat spariva e la
        // casella finiva sotto le linguette, fuori dallo schermo.
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp)) {
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = lista) {
                if (det != null && det.passaggi.isNotEmpty()) item {
                    Spacer(Modifier.height(8.dp))
                    // Il motivo del fermo sta gia' nell'intestazione: qui la nota
                    // delle fasi si mostra solo quando dice altro.
                    Passaggi(det.passaggi, mostraNota = det.stato != "sospeso" && det.stato != "fallito")
                    Spacer(Modifier.height(6.dp))
                    Misura(det.misura, det.cicli)
                    Spacer(Modifier.height(6.dp))
                }
                guastoDettaglio?.let { g -> item { Text(g, color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(vertical = 6.dp)) } }
                item { Serigrafia("Chat con lui") }
                items(chat) { b ->
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
            }
            // Le sue domande non si rispondono da qui (0.38.0): stanno nella
            // linguetta «Domande» qui sotto, una per volta. La casella parla con lui.
            val domanda = false
            if (det != null && (det.domandeScheda.isNotEmpty() || det.domanda)) {
                Text(
                    // Un PC prima della 0.38.0 non ha la linguetta: si dice dove rispondere.
                    if (FunzioniPc.disponibile(FunzionePc.DOMANDE_AUTOPILOTA, PcCorrente.versione) == false)
                        "Ti ha fatto una domanda: rispondi dalla scheda «Domande» dell'app. " + FunzioniPc.testoMancante(FunzionePc.DOMANDE_AUTOPILOTA)
                    else "Ti ha fatto una domanda: è nella linguetta «Domande» qui sotto, con il numero di quelle aperte.",
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

        // ─── le linguette: la meta' di sotto ───
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
        // Una domanda nuova apre la linguetta «Domande»; finite, si chiude.
        val chiaviDomande = schede.map { it.chiave }
        LaunchedEffect(chiaviDomande.joinToString("|")) {
            if (domandaArrivata(domandeViste, schede)) { linguetta = 0; linguettaAperta = true }
            else if (schede.isEmpty() && domandeViste?.isNotEmpty() == true && linguetta == 0) linguettaAperta = false
            domandeViste = chiaviDomande
        }
        if (linguetta >= chiavi.size) linguetta = 0
        ScrollableTabRow(
            selectedTabIndex = linguetta,
            containerColor = Banco.fondo,
            contentColor = Banco.testo,
            edgePadding = 8.dp,
            // Nessun segno sotto la linguetta finche' e' chiusa: un segno su
            // «Obiettivo» con niente sotto sembrava una scheda vuota.
            indicator = { posizioni ->
                if (linguettaAperta && linguetta < posizioni.size) {
                    TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(posizioni[linguetta]), color = Banco.accento)
                }
            }
        ) {
            nomi.forEachIndexed { i, nome ->
                val aperta = linguettaAperta && linguetta == i
                Tab(
                    selected = aperta,
                    onClick = {
                        if (aperta) linguettaAperta = false
                        else { linguetta = i; linguettaAperta = true }
                    },
                    text = { Text(nome + if (aperta) " ▾" else "", fontSize = 12.sp, color = if (aperta) Banco.testo else Banco.testoQuieto) }
                )
            }
        }
        // Con un tetto: al massimo un terzo abbondante dello schermo, cosi' la
        // chat e la casella restano sopra anche con la tastiera aperta. Le
        // Domande hanno piu' posto (0.39.1): il testo e' sempre intero, e se e'
        // lungo scorre la linguetta, non si taglia.
        val tetto = altezzaLinguetta(chiavi.getOrNull(linguetta)).dp
        if (linguettaAperta) Column(Modifier.fillMaxWidth().heightIn(max = tetto).verticalScroll(rememberScrollState()).padding(16.dp)) {
            when (chiavi.getOrNull(linguetta)) {
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
                        Etichetta(if (det.chats.size > 1) "IL COORDINATORE E LE SUE CHAT" else "LA SUA CHAT")
                        val albero = det.albero
                        if (albero != null && albero.figli.isNotEmpty()) {
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
                            val stato = when (ch.stato) { "lavoro" -> "al lavoro"; "bloccata" -> "ferma, aspetta una risposta"; else -> "finita" }
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
                        for (c in det.criteri) Criterio(c)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Il comando sotto ogni criterio è quello che lo misura a ogni fermata. Per riscriverli usa il PC, o diglielo nella chat qui sopra.",
                            color = Banco.testoQuieto, fontSize = 12.sp
                        )
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
                TextButton(enabled = !inCorso, onClick = { fai("archiviarlo") { api.archiviaAutopilota(id, true) } }) {
                    Text("Archivia — esce dall’elenco dei lavori, non si cancella niente")
                }
            }
        }
    }
}

@Composable
private fun Passaggi(passi: List<Passo>, mostraNota: Boolean = true) {
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
            Text(c.comando + esito, color = Banco.testoQuieto, fontSize = 12.sp, fontFamily = FontTerminale, modifier = Modifier.padding(start = 18.dp))
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
private fun RigaAlbero(f: NodoAlbero) {
    val colore = when (f.stato) { "lavoro" -> Banco.verde; "bloccata" -> Banco.ambra; else -> Banco.testoQuieto }
    Row(Modifier.padding(start = 8.dp, top = 4.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.width(1.dp).height(34.dp).background(Banco.incisione))
        Spacer(Modifier.width(8.dp))
        Box(Modifier.padding(top = 5.dp).size(8.dp).clip(CircleShape).background(colore))
        Spacer(Modifier.width(8.dp))
        Column {
            Text(f.titolo, color = Banco.testo, fontSize = 13.sp)
            Text(
                f.parola + " · ${f.cicli} " + (if (f.cicli == 1) "giro" else "giri") + (f.ramo?.let { " · $it" } ?: ""),
                color = Banco.testoQuieto, fontSize = 11.sp
            )
        }
    }
}

/**
 * Affida un lavoro nuovo (app 2.55.0), alla pari con la finestra «Nuovo
 * autopilota» del PC: su quale PC, in quale cartella (le chat aperte, i
 * progetti recenti o sfogliando), in quale workspace, l'obiettivo, il nome,
 * i criteri, la regola di pubblicazione, il cloud e la partenza. La
 * validazione è quella del PC (`AzioniTelefono.controlla`).
 *
 * Prima si sceglieva solo fra le cartelle già viste da Claude Code sul PC
 * accoppiato: «quando voglio lanciare un autopilota non mi chiede dove
 * lanciarlo» (Nicholas, 09/10).
 */
@Composable
private fun Delega(api: Api, statoQui: Stato?, onChiudi: () -> Unit) {
    // Il PC: `null` = quello accoppiato; altrimenti uno degli altri, attraverso il ponte.
    var pcScelto by remember { mutableStateOf<PcPonte?>(SuPc.corrente) }
    var altriPc by remember { mutableStateOf<List<PcRemoto>>(emptyList()) }
    val apiDest = remember(pcScelto?.pcId, api) { pcScelto?.let { api.suPc(it.pcId) } ?: api }
    val nomeDest = pcScelto?.nome ?: PcCorrente.nome ?: "questo PC"
    var statoDest by remember(pcScelto?.pcId) { mutableStateOf(if (pcScelto == null) statoQui else null) }
    var cartelle by remember(pcScelto?.pcId) { mutableStateOf<List<String>?>(null) }
    var bozza by remember { mutableStateOf(BozzaAutopilota()) }
    var sfoglia by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var mandando by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        altriPc = try { api.pc().let { e -> e.pc.filter { it.pcId != e.io && it.vivo } } } catch (_: Exception) { emptyList() }
    }
    LaunchedEffect(pcScelto?.pcId) {
        errore = null
        bozza = bozza.copy(cwd = "", workspace = "")
        if (pcScelto != null) statoDest = try { apiDest.stato() } catch (e: Api.Errore) { errore = spiegaGestione(e, "leggere lo stato di $nomeDest", nomeDest); null } catch (_: Exception) { null }
        cartelle = try { apiDest.cartelle().cartelle } catch (e: Api.Errore) { if (errore == null) errore = spiegaGestione(e, "leggere le cartelle di $nomeDest", nomeDest); emptyList() } catch (_: Exception) { emptyList() }
        val ws = statoDest?.workspace
        if (ws != null && bozza.workspace.isBlank()) bozza = bozza.copy(workspace = ws.attivo)
        // Come il PC: la prima destinazione è la chat che si sta guardando.
        val prima = statoDest?.chat?.firstOrNull()?.cwd ?: cartelle?.firstOrNull()
        if (prima != null && bozza.cwd.isBlank()) bozza = bozza.copy(cwd = prima)
    }
    val versioneDest = if (pcScelto == null) PcCorrente.versione else altriPc.firstOrNull { it.pcId == pcScelto?.pcId }?.versione
    val vecchio = FunzioniPc.disponibile(FunzionePc.GESTIONE, versioneDest) == false
    val controllo = AzioniTelefono.controlla(bozza)

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Affida un lavoro") },
        text = {
            Column(Modifier.fillMaxWidth().height(560.dp).verticalScroll(rememberScrollState())) {
                // ─── su quale PC ───
                Text("Su quale computer lavora", color = Banco.testoQuieto, fontSize = 12.sp)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    androidx.compose.material3.FilterChip(selected = pcScelto == null, onClick = { pcScelto = null }, label = { Text(PcCorrente.nome ?: "questo PC", fontSize = 12.sp) })
                    for (p in altriPc) {
                        androidx.compose.material3.FilterChip(selected = pcScelto?.pcId == p.pcId, onClick = { pcScelto = PcPonte(p.pcId, p.mostra) }, label = { Text(p.mostra, fontSize = 12.sp, color = VIOLA_ALTRO_PC) })
                    }
                }
                Text(
                    "L’autopilota vive sul computer che scegli: lì legge i file, apre le sue chat e lascia il quaderno. Gli altri PC accesi della stessa cassaforte si raggiungono attraverso quello a cui il telefono è accoppiato.",
                    color = Banco.testoQuieto, fontSize = 11.sp
                )
                if (vecchio) Text("$nomeDest ha la ${versioneDest ?: "versione di prima"}: riceve solo obiettivo, cartella (fra quelle già viste da Claude Code), regola e cloud; nome, criteri, workspace e partenza arrivano aggiornandolo alla 0.55.0.", color = Banco.ambra, fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))

                // ─── l'obiettivo ───
                OutlinedTextField(
                    value = bozza.obiettivo,
                    onValueChange = { bozza = bozza.copy(obiettivo = it) },
                    label = { Text("Cosa vuoi ottenere") },
                    placeholder = { Text("L’obiettivo, i vincoli (cosa non toccare), come si capisce che ha finito, dove guardare.", fontSize = 12.sp) },
                    modifier = Modifier.fillMaxWidth().height(170.dp)
                )
                Text("Tutto quello che scrivi arriva a lui parola per parola, come mandato: non viene riassunto né tagliato.", color = Banco.testoQuieto, fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))

                // ─── la cartella ───
                Text("In quale cartella lavora", color = Banco.testoQuieto, fontSize = 12.sp)
                if (bozza.cwd.isNotBlank()) Text(bozza.cwd, color = Banco.accento, fontSize = 12.sp, maxLines = 2)
                val aperte = (statoDest?.chat ?: emptyList()).map { it.cwd }.filter { it.isNotBlank() }.distinct()
                val recenti = (cartelle ?: emptyList()).filter { it !in aperte }
                if (cartelle == null) Text("Carico le cartelle di $nomeDest…", color = Banco.testoQuieto, fontSize = 12.sp)
                if (aperte.isNotEmpty()) {
                    Text("Chat aperte adesso", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    for (c in aperte) RigaCartella(c, c == bozza.cwd) { bozza = bozza.copy(cwd = c) }
                }
                if (recenti.isNotEmpty()) {
                    Text("Progetti recenti", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    for (c in recenti.take(30)) RigaCartella(c, c == bozza.cwd) { bozza = bozza.copy(cwd = c) }
                }
                TextButton(onClick = { sfoglia = true }) { Text("Altra cartella: sfoglia $nomeDest…") }
                Text("La cartella del progetto: è lì che legge i file, lancia i comandi e lascia il quaderno. Non la radice di un disco né la cartella dell’utente.", color = Banco.testoQuieto, fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))

                // ─── il workspace ───
                val nomiWs = statoDest?.workspace?.nomi ?: emptyList()
                if (nomiWs.isNotEmpty()) {
                    SceltaWorkspaceRiga(nomiWs, bozza.workspace) { bozza = bozza.copy(workspace = it) }
                    Text("Le chat che apre nascono in questo workspace, anche se sul computer stai guardando altro.", color = Banco.testoQuieto, fontSize = 11.sp)
                    Spacer(Modifier.height(10.dp))
                }

                // ─── nome ───
                OutlinedTextField(
                    value = bozza.nome, onValueChange = { bozza = bozza.copy(nome = it.take(AzioniTelefono.NOME_AUTOPILOTA_MAX)) },
                    label = { Text("Nome (facoltativo)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Se vuoto: le prime parole dell’obiettivo", fontSize = 12.sp) }
                )
                Spacer(Modifier.height(10.dp))

                // ─── pubblicazione, cloud, partenza ───
                Text("Pubblicazione del progetto", color = Banco.testoQuieto, fontSize = 12.sp)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (r in AzioniTelefono.REGOLE) androidx.compose.material3.FilterChip(selected = bozza.pubblicazione == r.valore, onClick = { bozza = bozza.copy(pubblicazione = r.valore) }, label = { Text(r.etichetta, fontSize = 12.sp) })
                }
                Text(AzioniTelefono.REGOLE.firstOrNull { it.valore == bozza.pubblicazione }?.spiega ?: "", color = Banco.testoQuieto, fontSize = 11.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = bozza.cloud, onCheckedChange = { bozza = bozza.copy(cloud = it) })
                    Spacer(Modifier.width(8.dp))
                    Text("va sul cloud: le chat stanno sul Drive", color = Banco.testo, fontSize = 13.sp)
                }
                Text(
                    "Il «cloud» è il Drive di SierraDeck, dove si salvano le chat. Se le chat di questo progetto stanno sul Drive (questa spunta, oppure la sincronizzazione Drive del progetto già accesa) lavora in autonomia completa, senza farti domande: commit, unione dei suoi rami, push e pubblicazione secondo la regola qui sopra. Il remoto git e gli script di pubblicazione del progetto servono solo a sapere dove mandare su e con quale comando pubblicare. Senza Drive fa commit sui suoi rami e li unisce, e basta: niente push, niente pubblicazione.",
                    color = Banco.testoQuieto, fontSize = 11.sp
                )
                Spacer(Modifier.height(8.dp))
                Text("Partenza", color = Banco.testoQuieto, fontSize = 12.sp)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (p in AzioniTelefono.PARTENZE) androidx.compose.material3.FilterChip(selected = bozza.partenza == p.valore, onClick = { bozza = bozza.copy(partenza = p.valore) }, label = { Text(p.etichetta, fontSize = 12.sp) })
                }
                Text(AzioniTelefono.PARTENZE.firstOrNull { it.valore == bozza.partenza }?.spiega ?: "", color = Banco.testoQuieto, fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))

                // ─── criteri ───
                OutlinedTextField(
                    value = bozza.criteri, onValueChange = { bozza = bozza.copy(criteri = it) },
                    label = { Text("Come si capisce che ha finito (facoltativo, uno per riga)") },
                    modifier = Modifier.fillMaxWidth().height(110.dp)
                )
                Text("Sono i criteri di fine: li verifica lui, uno per uno, prima di dichiararsi finito. Se li lasci vuoti se li ricava da solo, guardando il progetto.", color = Banco.testoQuieto, fontSize = 11.sp)
                Spacer(Modifier.height(8.dp))
                Text("Quante chat apre lo decide lui, dentro il freno sui limiti del piano. Non tocca mai chat e autopiloti non suoi, «Porta qui», l’account, le preferenze né file fuori dalle sue cartelle.", color = Banco.testoQuieto, fontSize = 11.sp)
                (errore ?: (controllo as? EsitoBozza.No)?.takeIf { bozza.obiettivo.isNotBlank() }?.errore)?.let {
                    Spacer(Modifier.height(6.dp)); Text(it, color = Banco.rosso, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = controllo is EsitoBozza.Ok && !mandando,
                onClick = {
                    val r = (controllo as? EsitoBozza.Ok)?.richiesta ?: return@TextButton
                    mandando = true
                    scope.launch {
                        try {
                            apiDest.creaAutopilota(r)
                            Nota.mostra("Affidato a $nomeDest: legge il progetto e, se ha domande, arrivano nella scheda Domande." + if (r.partenza == "subito") " Appena è pronto comincia da solo." else " Poi aspetta il tuo «Vai».")
                            onChiudi()
                        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Api.Errore) {
                            errore = spiegaGestione(e, "affidarlo a $nomeDest", nomeDest)
                        } catch (e: Exception) {
                            errore = "Non sono riuscito ad affidarlo: ${e.message ?: "il computer non risponde"}"
                        }
                        mandando = false
                    }
                }
            ) { Text(if (mandando) "Affido…" else "Prepara") }
        },
        dismissButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
    if (sfoglia) SceltaCartella(
        apiDest,
        onApri = { percorso, _ -> bozza = bozza.copy(cwd = percorso) },
        onChiudi = { sfoglia = false },
        etichetta = "Scegli questa",
        titolo = "La cartella del lavoro su $nomeDest"
    )
}

@Composable
private fun RigaCartella(c: String, scelta: Boolean, onClick: () -> Unit) {
    // Il nome, e sotto il percorso: due progetti con lo stesso nome in dischi
    // diversi erano indistinguibili.
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 5.dp)) {
        Text(c.substringAfterLast('\\').substringAfterLast('/'), color = if (scelta) Banco.accento else Banco.testo, fontWeight = if (scelta) FontWeight.Bold else FontWeight.Normal, fontSize = 13.sp)
        Text(c, color = Banco.testoQuieto, fontSize = 10.sp, maxLines = 1)
    }
}

/** Il quaderno di una cartella: le schede lasciate dall'autopilota. */
@Composable
private fun Quaderno(api: Api, cwd: String, onChiudi: () -> Unit) {
    var schede by remember { mutableStateOf<List<SchedaBreve>?>(null) }
    var aperta by remember { mutableStateOf<SchedaPiena?>(null) }
    // «Nessuna scheda» e «non riesco a leggerle» sono due cose diverse: prima
    // un 403 (cartella non conosciuta) si leggeva come un quaderno vuoto.
    var guasto by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(cwd) {
        schede = try { api.quaderno(cwd).schede } catch (e: Exception) {
            guasto = if (e is Api.Errore) Nota.spiega(e, "leggere il quaderno") else "Non sono riuscito a leggere il quaderno: ${e.message ?: "il computer non risponde"}"
            emptyList()
        }
    }

    AlertDialog(
        onDismissRequest = { if (aperta != null) aperta = null else onChiudi() },
        title = { Text(aperta?.titolo?.ifBlank { "Quaderno" } ?: "Quaderno") },
        text = {
            Column(Modifier.fillMaxWidth().height(380.dp).verticalScroll(rememberScrollState())) {
                val ap = aperta
                if (ap != null) {
                    Text(ap.corpo, color = Banco.testo, fontSize = 13.sp)
                } else when {
                    guasto != null -> Text(guasto!!, color = Banco.ambra, fontSize = 13.sp)
                    schede == null -> Text("Carico…", color = Banco.testoQuieto)
                    schede!!.isEmpty() -> Text("Nessuna scheda in questa cartella: il quaderno (.sierradeck/quaderno) si riempie quando le chat annotano decisioni, vincoli ed errori risolti.", color = Banco.testoQuieto)
                    else -> for (s in schede!!) {
                        Text(
                            s.titolo.ifBlank { s.file },
                            color = Banco.testo,
                            modifier = Modifier.fillMaxWidth().clickable {
                                scope.launch { aperta = tenta("aprire la scheda del quaderno") { api.scheda(cwd, s.file) } }
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
    val chiedono = lista.any { it.stato in setOf("sospeso", "fallito", "pronto", "attesa") }
    Column {
        Row(
            Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Serigrafia("Lavori")
                Spacer(Modifier.height(3.dp))
                // Tutti gli stati, non solo i fermi: «1 in attesa di te» contava
                // i sospesi e taceva su chi aspettava il via o una risposta.
                Text(
                    riassuntoLavori(lista),
                    color = if (chiedono) Banco.ambra else Banco.testoQuieto,
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
/**
 * Tutti gli autopiloti in una riga: «1 fermo · 1 aspetta il via · 2 al
 * lavoro · 3 finiti». Prima i casi che aspettano te, e solo quelli che ci sono.
 * Pura: si prova senza Compose.
 */
fun riassuntoLavori(lista: List<AutopilotaBreve>): String {
    if (lista.isEmpty()) return "nessun lavoro affidato"
    fun conta(vararg stati: String) = lista.count { it.stato in stati }
    val pezzi = mutableListOf<String>()
    conta("sospeso", "fallito").takeIf { it > 0 }?.let { pezzi += if (it == 1) "1 fermo" else "$it fermi" }
    conta("attesa").takeIf { it > 0 }?.let { pezzi += if (it == 1) "1 aspetta una risposta" else "$it aspettano una risposta" }
    conta("pronto").takeIf { it > 0 }?.let { pezzi += if (it == 1) "1 aspetta il via" else "$it aspettano il via" }
    conta("intervista").takeIf { it > 0 }?.let { pezzi += "$it si prepara" + (if (it == 1) "" else "no") }
    conta("lavoro").takeIf { it > 0 }?.let { pezzi += "$it al lavoro" }
    conta("finito").takeIf { it > 0 }?.let { pezzi += if (it == 1) "1 finito" else "$it finiti" }
    return pezzi.joinToString(" · ")
}

/**
 * La linguetta «Domande» (0.38.0): una domanda per volta, con il testo intero,
 * le opzioni da toccare, la casella libera e «1 di N». Dopo la risposta,
 * domanda e risposta entrano nella chat qui sopra.
 */
@Composable
private fun LinguettaDomande(api: Api, autopilota: String, schede: List<DomandaScheda>, onRisposto: () -> Unit) {
    var indice by remember { mutableStateOf(0) }
    var testo by remember { mutableStateOf("") }
    var nota by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    if (schede.isEmpty()) {
        Text("Nessuna domanda aperta: quando te ne fa una, compare qui.", color = Banco.testoQuieto, fontSize = 13.sp)
        return
    }
    val i = indice.coerceIn(0, schede.size - 1)
    val d = schede[i]
    fun manda(r: String) {
        if (r.isBlank() || inCorso) return
        inCorso = true
        nota = null
        scope.launch {
            try { api.rispondiScheda(d, autopilota, r.trim()); testo = ""; indice = 0; onRisposto() }
            catch (e: Exception) { nota = "Non sono riuscito a rispondere: ${e.message ?: "il computer non risponde"}" }
            inCorso = false
        }
    }
    Text(etichettaOrigine(d) + if (schede.size > 1) " · ${i + 1} di ${schede.size}" else "", color = Banco.testoQuieto, fontSize = 12.sp)
    if (schede.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(enabled = i > 0, onClick = { indice = i - 1 }) { Text("‹ prima") }
        TextButton(enabled = i < schede.size - 1, onClick = { indice = i + 1 }) { Text("dopo ›") }
    }
    Spacer(Modifier.height(6.dp))
    Text(d.testo, color = Banco.testo, fontSize = 15.sp)
    if (d.opzioni.isNotEmpty()) {
        Spacer(Modifier.height(8.dp))
        for (o in d.opzioni) Button(enabled = !inCorso, onClick = { manda(o) }, modifier = Modifier.padding(vertical = 2.dp)) { Text(o) }
    }
    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        value = testo,
        onValueChange = { testo = it },
        label = { Text(if (d.tipo == "via") "Oppure scrivigli cosa cambiare" else "La tua risposta") },
        maxLines = 4,
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(Modifier.height(4.dp))
    Button(enabled = testo.isNotBlank() && !inCorso, onClick = { manda(testo) }) { Text(if (inCorso) "Mando…" else if (d.tipo == "via") "Manda" else "Rispondi") }
    nota?.let { Text(it, color = Banco.rosso, fontSize = 12.sp) }
    Text(
        if (d.tipo == "via") "«Vai» lo fa partire; se scrivi altro gli arriva come messaggio."
        else "La risposta arriva subito all’autopilota; nella chat qui sopra restano domanda e risposta. Poi la prossima, o la linguetta si chiude.",
        color = Banco.testoQuieto, fontSize = 11.sp
    )
}

/**
 * La linguetta «File» (0.38.0): i file cambiati, per chat, con lo stato, le
 * righe e se sono gia' in commit; toccando un file, il diff. Solo lettura.
 */
@Composable
private fun LinguettaFile(api: Api, autopilota: String) {
    var file by remember(autopilota) { mutableStateOf<FileAutopilota?>(null) }
    var guasto by remember(autopilota) { mutableStateOf<String?>(null) }
    var scelto by remember(autopilota) { mutableStateOf<Pair<String, String>?>(null) }
    var diff by remember(autopilota) { mutableStateOf<String?>(null) }
    // Un computer piu' vecchio della 0.38.0 non ha i file: si dice, senza chiedere.
    val spenta = FunzioniPc.disponibile(FunzionePc.FILE_AUTOPILOTA, PcCorrente.versione) == false
    LaunchedEffect(autopilota, spenta) {
        if (spenta) { guasto = FunzioniPc.testoMancante(FunzionePc.FILE_AUTOPILOTA); return@LaunchedEffect }
        while (isActive) {
            try { file = api.fileAutopilota(autopilota); guasto = null } catch (e: Exception) {
                guasto = FunzioniPc.spiega(e, FunzionePc.FILE_AUTOPILOTA)
            }
            delay(4000)
        }
    }
    LaunchedEffect(scelto) {
        val s = scelto ?: return@LaunchedEffect
        diff = null
        diff = try { api.diffAutopilota(autopilota, s.first, s.second).diff } catch (e: Exception) { "⚠ ${e.message ?: "diff non disponibile"}" }
    }
    Text(
        "I file che ha cambiato, per la cartella del progetto e per il worktree di ogni sua chat. Tocca un file per vedere le righe tolte e aggiunte. Qui si guarda soltanto.",
        color = Banco.testoQuieto, fontSize = 12.sp
    )
    guasto?.let { Text(it, color = Banco.ambra, fontSize = 12.sp) }
    val f = file
    if (f == null && guasto == null) Text("Leggo i file…", color = Banco.testoQuieto, fontSize = 13.sp)
    f?.gruppi?.forEach { g ->
        Spacer(Modifier.height(8.dp))
        Etichetta(g.nome.uppercase() + (g.ramo?.let { " · $it" } ?: ""))
        Text("Confronto ${g.base}", color = Banco.testoQuieto, fontSize = 11.sp)
        g.errore?.let { Text("⚠ $it", color = Banco.ambra, fontSize = 12.sp) }
        if (g.errore == null && g.file.isEmpty()) Text("Nessun file cambiato.", color = Banco.testoQuieto, fontSize = 12.sp)
        for (x in g.file) {
            Column(Modifier.fillMaxWidth().clickable { scelto = if (scelto == g.chiave to x.percorso) null else g.chiave to x.percorso }.padding(vertical = 4.dp)) {
                Text(x.percorso, color = Banco.testo, fontSize = 13.sp)
                Text(rigaFile(x), color = if (x.salvato) Banco.testoQuieto else Banco.ambra, fontSize = 11.sp)
            }
        }
    }
    val s = scelto
    if (s != null) {
        Spacer(Modifier.height(8.dp))
        Etichetta(s.second)
        val t = diff
        if (t == null) Text("Leggo il diff…", color = Banco.testoQuieto, fontSize = 12.sp)
        else for (r in righeDiff(t)) Text(
            r.testo,
            color = when (r.tipo) { "piu" -> Banco.verde; "meno" -> Banco.rosso; "testa", "blocco" -> Banco.testoQuieto; else -> Banco.testo },
            fontSize = 11.sp,
            fontFamily = FontTerminale
        )
    }
}
