package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.ui.draw.clip

/**
 * Quante righe si chiedono entrando, e quante se ne aggiungono risalendo.
 *
 * Centocinquanta sono più di uno schermo e meno di un peso: viaggiano ogni due
 * secondi sulla rete di casa, e sono la conversazione che si ricorda a mente.
 * Il tetto esiste perché sopra un certo punto non stai più leggendo una chat,
 * stai scaricando un registro — e per quello c’è il computer.
 */
private const val RIGHE_ALL_APERTURA = 150
private const val PASSO_RISALITA = 150
private const val RIGHE_MASSIME = 600

/**
 * «Chat»: l'elenco delle conversazioni aperte, e dentro ciascuna il terminale.
 *
 * Un solo livello di profondità: dall'elenco si entra in una chat, e da lì il
 * tasto indietro riporta all'elenco (non fuori dall'app — uscire per sbaglio da
 * dove si sta scrivendo è il modo più veloce per perdere quello che si scrive).
 */
@Composable
fun Chat(api: Api, stato: Stato?, deposito: Collegamento) {
    var aperta by remember { mutableStateOf<String?>(null) }
    val chat = stato?.chat ?: emptyList()

    // Se la chat aperta sparisce (chiusa altrove), si torna all'elenco da soli.
    LaunchedEffect(chat, aperta) {
        if (aperta != null && chat.none { it.id == aperta }) aperta = null
    }

    val corrente = chat.firstOrNull { it.id == aperta }
    if (corrente != null) {
        BackHandler { aperta = null }
        DettaglioChat(api, corrente, deposito, onIndietro = { aperta = null })
    } else {
        ElencoChat(api, chat, stato?.workspace ?: Workspace(), onApri = { aperta = it.id })
    }
}

@Composable
private fun ElencoChat(api: Api, chat: List<Chat>, workspace: Workspace, onApri: (Chat) -> Unit) {
    var mostraNuova by remember { mutableStateOf(false) }
    var mostraRiprendi by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    // Tutte le chat del computer, raggruppate per workspace: prima quello
    // davanti, poi gli altri. Dentro ogni gruppo prima le vive, poi quelle
    // salvate che nessuna finestra mostra — si riaprono con un tocco.
    val gruppi = raggruppaChat(chat, workspace)

    Column(Modifier.fillMaxSize()) {
        // La fascia dell'elenco: l'etichetta a stencil dice dove sei, i due
        // gesti stanno a destra dentro un contorno — prima erano due scritte
        // sospese in mezzo al nulla, e non sembravano nemmeno premibili.
        Fascia {
            Serigrafia("Chat")
            Spacer(Modifier.weight(1f))
            TastoContorno("+ Nuova") { mostraNuova = true }
            Spacer(Modifier.width(8.dp))
            TastoContorno("Riprendi") { mostraRiprendi = true }
        }
        if (gruppi.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Nessuna chat sul computer.", color = Banco.testoQuieto)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                gruppi.forEach { g ->
                    item(key = "ws:" + g.workspace) {
                        Row(
                            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Serigrafia(g.workspace, colore = if (g.attivo) Banco.accento else Banco.testoQuieto)
                            if (g.attivo) {
                                Spacer(Modifier.width(8.dp))
                                Text("davanti", color = Banco.testoQuieto, fontSize = 11.sp)
                            }
                            Spacer(Modifier.weight(1f))
                            Text("${g.voci.size}", color = Banco.testoQuieto, fontSize = 12.sp)
                        }
                    }
                    if (g.voci.isEmpty()) {
                        item(key = "vuoto:" + g.workspace) {
                            Text(
                                "nessuna chat",
                                color = Banco.testoQuieto, fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 24.dp, vertical = 4.dp)
                            )
                        }
                    }
                    items(g.voci, key = { it.chiave }) { v ->
                        val viva = v.viva
                        if (viva != null) {
                            Tessera(
                                onClick = { onApri(viva) },
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Column(Modifier.padding(14.dp)) {
                                    Text(viva.titolo.ifBlank { viva.cwd }, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1)
                                    if (!viva.ultimaRiga.isNullOrBlank()) {
                                        Spacer(Modifier.height(4.dp))
                                        Text(
                                            viva.ultimaRiga!!,
                                            color = Banco.testoQuieto,
                                            fontSize = 12.sp,
                                            fontFamily = FontFamily.Monospace,
                                            maxLines = 1
                                        )
                                    }
                                }
                            }
                        } else {
                            val salvata = v.salvata ?: return@items
                            // Una chat salvata: nessun terminale acceso, si riapre
                            // con un tocco (con la sua storia, `--resume`).
                            Tessera(
                                onClick = {
                                    scope.launch {
                                        try { api.riprendiSessione(salvata.cwd, salvata.sessione) } catch (_: Exception) {}
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Column(Modifier.padding(14.dp)) {
                                    Text(salvata.titolo.ifBlank { salvata.cwd }, color = Banco.testoQuieto, fontWeight = FontWeight.Bold, maxLines = 1)
                                    Spacer(Modifier.height(4.dp))
                                    Text("da riprendere · tocca per riaprirla", color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (mostraNuova) SceltaCartella(api, onChiudi = { mostraNuova = false })
    if (mostraRiprendi) SceltaSessione(api, onChiudi = { mostraRiprendi = false })
}

/** Il dettaglio: il terminale a polling e il campo per scrivere. */
@Composable
private fun DettaglioChat(api: Api, chat: Chat, deposito: Collegamento, onIndietro: () -> Unit) {
    // La finestra sulla conversazione: sempre attaccata al fondo, e alta
    // quanto le si chiede. Prima si vedevano ventiquattro righe — lo schermo
    // di adesso — e di tutto quello che c'era prima, niente.
    var storia by remember(chat.id) { mutableStateOf<Storia?>(null) }
    var quante by remember(chat.id) { mutableStateOf(RIGHE_ALL_APERTURA) }
    var caricando by remember(chat.id) { mutableStateOf(false) }
    // Cosa è andato storto, detto a schermo invece che taciuto: un’attesa
    // che non finisce non si distingue da un guasto, e chi guarda non ha
    // modo di sapere quale delle due sta vedendo.
    var guasto by remember(chat.id) { mutableStateOf<String?>(null) }
    var testo by remember(chat.id) { mutableStateOf("") }
    // Quando una scelta non c'e' piu' nel momento del tocco: una riga, e sparisce
    // al giro dopo. Senza, il tocco andrebbe a vuoto in silenzio.
    var notaScelta by remember(chat.id) { mutableStateOf<String?>(null) }
    var menuAperto by remember { mutableStateOf(false) }
    var rinominando by remember { mutableStateOf(false) }
    var chiudendo by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    // Come si legge lo schermo: adattato alla larghezza, o la griglia esatta.
    // Sta qui e non dentro la vista perche' il tasto che lo cambia e' in testata.
    var modo by remember { mutableStateOf(ModoTerminale.ADATTA) }
    // La misura del carattere: si ricorda sul telefono, non sul computer — e'
    // una cosa dello schermo che hai in mano.
    var dimensione by remember { mutableStateOf(deposito.dimensioneTerminale) }

    // Il tasto «più sopra» si spegne quando le righe nuove sono arrivate.
    LaunchedEffect(storia?.da, storia?.totale) { caricando = false }

    LaunchedEffect(chat.id, quante) {
        // Quante risposte **riuscite ma vuote** di fila.
        //
        // Una risposta vuota non solleva, quindi non finiva in nessun `catch` e
        // l'app restava su «Sto leggendo il terminale…» all'infinito — che è
        // una bugia, perché non stava leggendo niente: aveva letto, e non c'era
        // niente. Vuoto e in attesa sono due stati diversi e vanno detti in due
        // modi diversi.
        var vuoti = 0
        while (isActive) {
            try {
                // `-1` vuol dire «le ultime `quante`»: la finestra resta
                // attaccata al fondo mentre la chat scrive, e cresce verso
                // l'alto solo quando sei tu a chiederlo.
                val letta = api.storia(chat.id, -1, quante)
                storia = letta
                vuoti = if (letta.grezze.isEmpty() && letta.righe.isEmpty()) vuoti + 1 else 0
                // Tre giri sono sei secondi: il tempo che un terminale ci mette
                // a disegnarsi dopo essere stato aperto, e non uno di piu'.
                guasto = if (vuoti >= 3)
                    "Il computer risponde, ma per questa chat non manda niente. Succede se il riquadro non è a schermo sul computer: portalo in primo piano nel suo workspace."
                else null
            } catch (e: Exception) {
                // Un computer più vecchio non conosce la cronologia: si
                // ripiega sullo schermo di adesso, che ha sempre saputo dare.
                // Senza questo l’app restava per sempre su «sto leggendo»,
                // che è il modo peggiore di dire «non ci parliamo».
                try {
                    val d = api.dentro(chat.id)
                    storia = Storia(
                        chat = chat.id,
                        totale = d.grezze.size,
                        da = 0,
                        righe = d.righe,
                        grezze = d.grezze
                    )
                    guasto = "Questo computer non sa ancora dare la conversazione intera: aggiornalo e potrai risalirla."
                } catch (e2: Exception) {
                    guasto = "Non riesco a leggere questa chat: ${e2.message ?: "il computer non risponde"}"
                }
            }
            delay(2000)
        }
    }

    Column(Modifier.fillMaxSize()) {
        // ─── testata ───
        // Il titolo su due piani: il nome della chat, e sotto la cartella in cui
        // lavora. Da lontano sapere *dove* sta lavorando conta quanto il nome.
        Fascia {
            IconButton(onClick = onIndietro, modifier = Modifier.size(36.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro", tint = Banco.testo)
            }
            Spacer(Modifier.width(4.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    chat.titolo.ifBlank { chat.cwd },
                    color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1, fontSize = 15.sp
                )
                if (chat.cwd.isNotBlank()) {
                    Text(
                        chat.cwd.substringAfterLast(Char(92)).substringAfterLast('/'),
                        color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1
                    )
                }
            }
            Box {
                IconButton(onClick = { menuAperto = true }, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Filled.MoreVert, "Altro", tint = Banco.testo)
                }
                DropdownMenu(expanded = menuAperto, onDismissRequest = { menuAperto = false }) {
                    DropdownMenuItem(text = { Text("Rinomina") }, onClick = { menuAperto = false; rinominando = true })
                    DropdownMenuItem(text = { Text("Chiudi la chat") }, onClick = { menuAperto = false; chiudendo = true })
                }
            }
        }

        // ─── barra degli strumenti ───
        // Come si legge e quanto grande. Sta sotto la testata e non dentro:
        // in testata c'erano gia' quattro cose, e la quinta le avrebbe schiacciate.
        Row(
            Modifier.fillMaxWidth().background(Banco.fondo).padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Il tasto dice **dove vai**, non dove sei: e' l'unico modo perche'
            // si capisca senza doverlo provare.
            TastoContorno(if (modo == ModoTerminale.ADATTA) "Griglia" else "Adatta") {
                modo = if (modo == ModoTerminale.ADATTA) ModoTerminale.GRIGLIA else ModoTerminale.ADATTA
            }
            Spacer(Modifier.width(8.dp))
            Text(
                if (modo == ModoTerminale.ADATTA) "testo a capo" else "schermo esatto",
                color = Banco.testoQuieto, fontSize = 11.sp
            )
            Spacer(Modifier.weight(1f))
            TastoMisura("A", 13.sp, dimensione > Collegamento.DIMENSIONE_MIN) {
                dimensione -= 1; deposito.dimensioneTerminale = dimensione
            }
            Text(
                "$dimensione",
                color = Banco.testoQuieto,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 8.dp)
            )
            TastoMisura("A", 18.sp, dimensione < Collegamento.DIMENSIONE_MAX) {
                dimensione += 1; deposito.dimensioneTerminale = dimensione
            }
        }
        HorizontalDivider(color = Banco.incisione)

        // ─── terminale ───
        VistaTerminale(
            grezze = storia?.grezze ?: emptyList(),
            modo = modo,
            dimensione = dimensione,
            piuSopra = (storia?.da ?: 0) > 0,
            caricando = caricando,
            guasto = guasto,
            onPiuSopra = {
                caricando = true
                quante = (quante + PASSO_RISALITA).coerceAtMost(RIGHE_MASSIME)
            },
            modifier = Modifier.weight(1f).fillMaxWidth()
        )
        HorizontalDivider(color = Banco.incisione)

        // ─── le scelte del terminale ───
        // Quando Claude Code disegna un elenco non aspetta parole: aspetta una
        // freccia e un invio, e su un telefono quei tasti non esistono. Si
        // leggeva la domanda, si sapeva la risposta, e la chat restava ferma
        // fino al ritorno al computer. Stanno **sopra** il campo di testo:
        // quando c'e' una scelta aperta, e' quella la risposta.
        val scelte = storia?.scelte
        if (scelte != null && scelte.opzioni.isNotEmpty()) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Banco.chassis)
                    .padding(horizontal = 10.dp, vertical = 8.dp)
            ) {
                Text(
                    "STA ASPETTANDO CHE TU SCELGA",
                    color = Banco.testoQuieto, fontSize = 10.sp, letterSpacing = 1.sp
                )
                Spacer(Modifier.height(6.dp))
                for (o in scelte.opzioni) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Banco.fondo)
                            .border(
                                width = if (o.scelta) 2.dp else 1.dp,
                                color = if (o.scelta) Banco.ambra else Banco.incisione,
                                shape = RoundedCornerShape(8.dp)
                            )
                            .clickable {
                                val quale = o.testo
                                // Sparisce subito: un pulsante che resta invita a
                                // premerlo due volte, e il secondo tocco finirebbe
                                // nella domanda dopo.
                                storia = storia?.copy(scelte = null)
                                notaScelta = null
                                scope.launch {
                                    try {
                                        api.scegli(chat.id, quale)
                                    } catch (e: Exception) {
                                        // Il computer distingue i due casi: 409
                                        // vuol dire «la scelta e' cambiata»,
                                        // tutto il resto vuol dire che non ha
                                        // risposto. Dirlo sempre nel primo modo
                                        // mandava a guardare lo schermo quando
                                        // il problema era la rete.
                                        notaScelta = if (e is Api.Errore && e.codice == 409)
                                            "La scelta è cambiata mentre toccavi: guarda di nuovo."
                                        else
                                            "Non sono riuscito a mandarla: ${e.message ?: "il computer non risponde"}"
                                    }
                                }
                            }
                            .padding(horizontal = 12.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "${o.numero}",
                            color = Banco.testoQuieto,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.padding(end = 10.dp)
                        )
                        Text(o.testo, color = Banco.testo, fontSize = 14.sp)
                    }
                }
            }
            HorizontalDivider(color = Banco.incisione)
        }
        val nota = notaScelta
        if (nota != null) {
            Text(
                nota,
                color = Banco.ambra, fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 10.dp, vertical = 6.dp)
            )
        }

        // ─── campo di scrittura ───
        // Campo e invio dentro la stessa fascia, allineati in mezzo: prima erano
        // un riquadro alto e un'icona che gli galleggiava di fianco.
        Row(
            Modifier.fillMaxWidth().background(Banco.chassis).padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = testo,
                onValueChange = { testo = it.take(2000) },
                placeholder = { Text("Scrivi alla chat…", color = Banco.testoQuieto, fontSize = 14.sp) },
                textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                maxLines = 5,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Banco.accento,
                    unfocusedBorderColor = Banco.incisione,
                    focusedContainerColor = Banco.fondo,
                    unfocusedContainerColor = Banco.fondo
                ),
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(10.dp))
            // Il pulsante e' un disco pieno quando c'e' qualcosa da mandare e si
            // spegne quando non c'e': lo stato si legge senza provarlo.
            val puoInviare = testo.isNotBlank()
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(if (puoInviare) Banco.accento else Banco.incisione)
                    .clickable(enabled = puoInviare) {
                        val da = testo
                        testo = ""
                        notaScelta = null
                        scope.launch {
                            // **Se non parte, torna nel campo.** Il testo si
                            // svuotava prima di mandare e l'errore veniva
                            // ingoiato: il messaggio spariva sotto gli occhi
                            // senza essere arrivato da nessuna parte, e non
                            // c'era modo di riaverlo se non riscrivendolo.
                            try {
                                api.scrivi(chat.id, da)
                            } catch (e: Exception) {
                                if (testo.isBlank()) testo = da
                                notaScelta = "Non sono riuscito a mandarlo: ${e.message ?: "il computer non risponde"}"
                            }
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    "Invia",
                    tint = if (puoInviare) Banco.fondo else Banco.testoQuieto,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }

    if (rinominando) {
        RinominaChat(api, chat, onChiudi = { rinominando = false })
    }
    if (chiudendo) {
        AlertDialog(
            onDismissRequest = { chiudendo = false },
            title = { Text("Chiudere la chat?") },
            text = { Text("La conversazione resta salvata, ma il suo terminale si spegne.") },
            confirmButton = {
                TextButton(onClick = {
                    chiudendo = false
                    scope.launch { try { api.chiudiChat(chat.id) } catch (_: Exception) {} }
                    onIndietro()
                }) { Text("Chiudi", color = Banco.rosso) }
            },
            dismissButton = { TextButton(onClick = { chiudendo = false }) { Text("Annulla") } }
        )
    }
}

@Composable
private fun RinominaChat(api: Api, chat: Chat, onChiudi: () -> Unit) {
    var nome by remember { mutableStateOf(chat.titolo) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Rinomina la chat") },
        text = {
            OutlinedTextField(
                value = nome,
                onValueChange = { nome = it.take(80) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(onClick = {
                onChiudi()
                scope.launch { try { api.rinominaChat(chat.id, nome.trim()) } catch (_: Exception) {} }
            }) { Text("Salva") }
        },
        dismissButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
}

/**
 * Dove aprire una chat nuova: fra quelle note, **o sfogliando il disco**.
 *
 * Prima c'era solo l'elenco delle cartelle già conosciute, e un progetto nuovo
 * — o uno vecchio mai aperto dal telefono — non c'era modo di sceglierlo. La
 * risposta non poteva essere un campo di testo: nessuno digita
 * `E:\Users\nikof\Documents\Qualcosa` su una tastiera del telefono. Quindi si
 * sfoglia, partendo dai posti che contano — i dischi, la tua cartella, i
 * progetti già noti — invece che dalla radice.
 */
@Composable
private fun SceltaCartella(api: Api, onChiudi: () -> Unit) {
    var giro by remember { mutableStateOf<Sfoglia?>(null) }
    var caricando by remember { mutableStateOf(true) }
    var guasto by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun vaiA(dove: String) {
        caricando = true
        scope.launch {
            try {
                giro = api.sfoglia(dove)
                guasto = null
            } catch (e: Exception) {
                guasto = "Questo computer non sa ancora sfogliare le cartelle da qui: aggiornalo."
            }
            caricando = false
        }
    }

    LaunchedEffect(Unit) { vaiA("") }

    val g = giro
    AlertDialog(
        onDismissRequest = onChiudi,
        title = {
            Column {
                Text("Apri una chat in…")
                if (g != null && !g.radici) {
                    Text(
                        g.percorso,
                        color = Banco.testoQuieto,
                        fontSize = 11.sp,
                        maxLines = 2
                    )
                }
            }
        },
        text = {
            Column(Modifier.fillMaxWidth().height(340.dp)) {
                // «Su» e «apri qui» stanno **fuori** dall'elenco che scorre: sono
                // i due gesti che servono sempre, e cercarli in fondo a
                // duecento cartelle vorrebbe dire non averli.
                if (g != null && !g.radici) {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        if (g.su != null) {
                            TextButton(onClick = { vaiA(g.su) }) { Text("↑  Su") }
                        }
                        Spacer(Modifier.weight(1f))
                        Button(
                            shape = MaterialTheme.shapes.small,
                            onClick = {
                                onChiudi()
                                scope.launch { try { api.apri(g.percorso) } catch (_: Exception) {} }
                            }
                        ) { Text(if (g.progetto) "Apri qui (progetto)" else "Apri qui") }
                    }
                    HorizontalDivider(color = Banco.incisione)
                }
                Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())) {
                    when {
                        guasto != null -> Text(guasto!!, color = Banco.ambra, fontSize = 13.sp)
                        caricando && g == null -> Text("Carico…", color = Banco.testoQuieto)
                        g == null || g.voci.isEmpty() ->
                            Text(
                                if (g?.radici == true) "Nessun punto di partenza."
                                else "Qui dentro non ci sono altre cartelle. Usa «Apri qui».",
                                color = Banco.testoQuieto,
                                fontSize = 13.sp
                            )
                        else -> for (v in g.voci) {
                            Column(
                                Modifier.fillMaxWidth().padding(vertical = 8.dp).clickableCartella {
                                    vaiA(v.percorso)
                                }
                            ) {
                                Text(v.nome, color = Banco.testo, maxLines = 1)
                                if (g.radici) {
                                    Text(v.percorso, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                                }
                            }
                            HorizontalDivider(color = Banco.incisione)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onChiudi) { Text("Chiudi") } }
    )
}

/** Riprende una conversazione salvata. */
@Composable
private fun SceltaSessione(api: Api, onChiudi: () -> Unit) {
    var sessioni by remember { mutableStateOf<List<SessioneRipresa>?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { sessioni = try { api.sessioni().sessioni } catch (_: Exception) { emptyList() } }

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Riprendi una conversazione") },
        text = {
            Column(Modifier.fillMaxWidth().height(320.dp).verticalScroll(rememberScrollState())) {
                when {
                    sessioni == null -> Text("Carico…", color = Banco.testoQuieto)
                    sessioni!!.isEmpty() -> Text("Niente da riprendere.", color = Banco.testoQuieto)
                    else -> for (s in sessioni!!) {
                        Column(
                            Modifier.fillMaxWidth().padding(vertical = 8.dp).clickableCartella {
                                onChiudi()
                                scope.launch { try { api.riprendiSessione(s.cwd, s.id) } catch (_: Exception) {} }
                            }
                        ) {
                            Text(s.titolo.ifBlank { s.cwd }, color = Banco.testo, maxLines = 1)
                            if (s.cwd.isNotBlank()) Text(s.cwd, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                        }
                        HorizontalDivider(color = Banco.incisione)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onChiudi) { Text("Chiudi") } }
    )
}

/** Un click semplice su una riga di elenco. */
private fun Modifier.clickableCartella(onClick: () -> Unit): Modifier =
    this.clickable(onClick = onClick)

/**
 * La fascia in cima a una schermata.
 *
 * Fondo chassis e un solco sotto: e' la stessa modanatura della console sul
 * computer, ed e' cio' che tiene insieme i comandi invece di lasciarli
 * galleggiare sul fondo.
 */
@Composable
private fun Fascia(contenuto: @Composable RowScope.() -> Unit) {
    Column {
        Row(
            Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = contenuto
        )
        HorizontalDivider(color = Banco.incisione)
    }
}

/** Un tasto con il contorno inciso: si vede che e' un tasto anche da fermo. */
@Composable
private fun TastoContorno(testo: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        color = Banco.fondo,
        contentColor = Banco.testo,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, Banco.incisione)
    ) {
        Text(
            testo,
            color = Banco.testo,
            fontSize = 13.sp,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
        )
    }
}

/**
 * Il tasto che cambia la misura del carattere.
 *
 * Una «A» piccola e una grande, invece di «meno» e «piu'»: si capisce cosa fa
 * senza leggere niente, ed e' la convenzione che tutti hanno gia' visto.
 */
@Composable
private fun TastoMisura(
    lettera: String,
    misura: androidx.compose.ui.unit.TextUnit,
    attivo: Boolean,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        enabled = attivo,
        color = Banco.chassis,
        contentColor = if (attivo) Banco.testo else Banco.testoQuieto,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, Banco.incisione)
    ) {
        Box(Modifier.size(34.dp), contentAlignment = Alignment.Center) {
            Text(
                lettera,
                fontSize = misura,
                fontWeight = FontWeight.Bold,
                color = if (attivo) Banco.testo else Banco.incisione
            )
        }
    }
}
