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
import androidx.compose.ui.draw.alpha
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
/** Per quanto la scelta appena mandata resta nascosta, se il computer la rimanda uguale. */
private const val SCELTA_RISPOSTA_MS = 8000L
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
    // Le chat di un altro PC, attraverso il ponte (PC 0.48.0): le stesse
    // schermate, con la fascia viola «SU <PC>» sempre in cima.
    val su = SuPc.corrente
    if (su != null) {
        ChatSuAltroPc(api, su, deposito)
        return
    }
    var aperta by remember { mutableStateOf<String?>(null) }
    val chat = stato?.chat ?: emptyList()
    // «Apri la chat» dalla scheda Domande: si entra direttamente in quella.
    LaunchedEffect(Apertura.chatRichiesta) {
        Apertura.chatRichiesta?.let { aperta = it; Apertura.chatRichiesta = null }
    }

    // Se la chat aperta sparisce (chiusa altrove), si torna all'elenco da soli.
    LaunchedEffect(chat, aperta) {
        if (aperta != null && chat.none { it.id == aperta }) aperta = null
    }

    val corrente = chat.firstOrNull { it.id == aperta }
    if (corrente != null) {
        BackHandler { aperta = null }
        DettaglioChat(api, corrente, deposito, onIndietro = { aperta = null }, workspace = stato?.workspace ?: Workspace(), nomePc = PcCorrente.nome)
    } else {
        ElencoChat(api, chat, stato?.workspace ?: Workspace(), onApri = { aperta = it.id }, nomePc = PcCorrente.nome)
    }
}

/**
 * Le chat di un altro PC dal vivo, chieste al PC accoppiato che fa da ponte.
 * Lo stato si rilegge ogni due secondi e mezzo; se quel PC non si raggiunge,
 * il perché arriva dal ponte per esteso (la strada, la chiave, «non so se è
 * acceso») e si dice sotto la fascia.
 */
@Composable
private fun ChatSuAltroPc(api: Api, su: PcPonte, deposito: Collegamento) {
    val apiPc = remember(su.pcId, api) { api.suPc(su.pcId) }
    var stato by remember(su.pcId) { mutableStateOf<Stato?>(null) }
    var guasto by remember(su.pcId) { mutableStateOf<String?>(null) }
    var aperta by remember(su.pcId) { mutableStateOf<String?>(null) }
    /**
     * Il collegamento (0.51.0): la macchina di `Linea`. Ogni due secondi si
     * chiede lo stato di quel PC anche solo per sapere che c'è (keepalive,
     * sei secondi al massimo); se cade, si riprova con attese crescenti e la
     * fascia lo dice, con «Riprova adesso». Lo schermo resta, attenuato.
     */
    var linea by remember(su.pcId) { mutableStateOf(Linea.NUOVA) }
    var ultima by remember(su.pcId) { mutableStateOf(0L) }
    LaunchedEffect(su.pcId) {
        while (isActive) {
            val ora = System.currentTimeMillis()
            if (Linea.eOra(linea, ultima, ora)) {
                ultima = ora
                try {
                    val s = kotlinx.coroutines.withTimeout(Linea.KEEPALIVE_SCADE_MS) { apiPc.stato() }
                    stato = s; guasto = null
                    linea = Linea.passo(linea, EventoLinea.Ok(System.currentTimeMillis(), System.currentTimeMillis() - ora, s.ponte?.strada))
                } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                    linea = Linea.passo(linea, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", "${su.nome} non ha risposto in ${Linea.KEEPALIVE_SCADE_MS / 1000} secondi"))
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (e: Api.Errore) {
                    if (e.codice == 404 || e.codice == 409) guasto = "Il PC accoppiato non fa ancora da ponte: aggiornalo alla 0.48.0 o più nuova, e da qui vedrai le chat di ${su.nome}."
                    else linea = Linea.passo(linea, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", Nota.spiega(e, "leggere le chat di ${su.nome}").removePrefix("Non sono riuscito a leggere le chat di ${su.nome}: ")))
                } catch (e: Exception) {
                    linea = Linea.passo(linea, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", e.message ?: "il PC accoppiato non risponde"))
                }
            }
            delay(250)
        }
    }
    BackHandler { if (aperta != null) aperta = null else SuPc.corrente = null }
    Column(Modifier.fillMaxSize()) {
        FasciaSuPc(su, null, linea) { SuPc.corrente = null }
        // «Mi collego a NOME-PC…» (0.52.1): i tentativi finché il primo collegamento non riesce.
        val inizioPonte = remember(su.pcId) { System.currentTimeMillis() }
        var schedaPonte by remember(su.pcId) { mutableStateOf(true) }
        val vistaPonte = Tentativi.passi(su.nome, Tentativi.daLinea(linea, inizioPonte))
        LaunchedEffect(su.pcId, vistaPonte.fase) { if (vistaPonte.fase == "collegato") { delay(2500); schedaPonte = false } }
        if (schedaPonte) SchedaCollegamento(vistaPonte, null, onRiprova = { linea = Linea.passo(linea, EventoLinea.RiprovaAdesso(System.currentTimeMillis())) })
        FasciaLinea(linea, su.nome, onRiprova = { linea = Linea.passo(linea, EventoLinea.RiprovaAdesso(System.currentTimeMillis())) })
        guasto?.let { Text(it, color = Banco.rosso, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) }
        val chat = stato?.chat ?: emptyList()
        val corrente = chat.firstOrNull { it.id == aperta }
        when {
            corrente != null -> DettaglioChat(apiPc, corrente, deposito, onIndietro = { aperta = null }, giu = linea.fase == "ricollego", workspace = stato?.workspace ?: Workspace(), nomePc = su.nome)
            stato == null && guasto == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Busso a ${su.nome} attraverso il PC accoppiato…", color = Banco.testoQuieto)
            }
            else -> ElencoChat(apiPc, chat, stato?.workspace ?: Workspace(), onApri = { aperta = it.id }, nomePc = su.nome)
        }
    }
}

@Composable
private fun ElencoChat(api: Api, chat: List<Chat>, workspace: Workspace, onApri: (Chat) -> Unit, nomePc: String? = null) {
    var mostraNuova by remember { mutableStateOf(false) }
    var mostraWorkspace by remember { mutableStateOf(false) }
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
            Column(Modifier.weight(1f)) {
                Serigrafia("Chat")
                // Da lontano: quante lavorano e quante aspettano te, senza
                // scorrere l'elenco.
                Text(
                    riassuntoChat(chat),
                    color = if (chatCheTiAspettano(chat) > 0) Banco.ambra else Banco.testoQuieto,
                    fontSize = 11.sp, maxLines = 2
                )
            }
            // Anche su un altro PC, attraverso il ponte (0.55.0): prima qui
            // non c'era niente, e creare una chat là era impossibile.
            Spacer(Modifier.width(6.dp))
            TastoContorno("+ Nuova") { mostraNuova = true }
            Spacer(Modifier.width(6.dp))
            TastoContorno("Riprendi") { mostraRiprendi = true }
            Spacer(Modifier.width(6.dp))
            TastoContorno("Workspace") { mostraWorkspace = true }
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
                                    // Il LED e la parola dello stato, accanto al nome:
                                    // e' quello che si guarda da lontano. Prima ogni
                                    // chat era uguale alle altre, e per sapere chi
                                    // aspettava bisognava indovinare dall'ultima riga.
                                    val lettura = leggiChat(viva)
                                    // Sullo schermo stretto la parola breve (0.43.0): il
                                    // nome della chat non deve sparire dietro lo stato.
                                    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth()) {
                                        val parola = parolaPerRiga(lettura, maxWidth.value.toInt())
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            LedChat(lettura.tono)
                                            Spacer(Modifier.width(8.dp))
                                            if (viva.pin == "chiusa") Text("🔒 ", fontSize = 12.sp)
                                            Text(viva.titolo.ifBlank { viva.cwd }, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                            Spacer(Modifier.width(8.dp))
                                            Text(parola, color = coloreTono(lettura.tono), fontSize = 11.sp, maxLines = 1, softWrap = false)
                                        }
                                    }
                                    // Il progetto e' in mano a un altro PC: una parola quieta, non un avviso.
                                    if (!viva.altrove.isNullOrBlank()) {
                                        Text("il progetto è in mano a ${viva.altrove}", color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
                                    }
                                    if (!viva.ultimaRiga.isNullOrBlank()) {
                                        Spacer(Modifier.height(4.dp))
                                        Text(
                                            viva.ultimaRiga!!,
                                            color = Banco.testoQuieto,
                                            fontSize = 12.sp,
                                            fontFamily = FontTerminale,
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
                                        tenta("riaprire la chat") { api.riprendiSessione(salvata.cwd, salvata.sessione) }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Column(Modifier.padding(14.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        LedChat(null)
                                        Spacer(Modifier.width(8.dp))
                                        Text(salvata.titolo.ifBlank { salvata.cwd }, color = Banco.testoQuieto, fontWeight = FontWeight.Bold, maxLines = 1)
                                    }
                                    if (!salvata.altrove.isNullOrBlank()) {
                                        Text("il progetto è in mano a ${salvata.altrove}: riaprila da là, o scrivile da Computer → Altri computer", color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 2)
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        if (salvata.ibernata) "ibernata · tocca per risvegliarla sul computer"
                                        else "chiusa · tocca per riaprirla sul computer, con la sua storia",
                                        color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Le chiamate partono da **questo** scope, non da quello della finestra:
    // la finestra si chiude nello stesso tocco, e con lei il suo scope — la
    // richiesta arrivava, ma la risposta (e un eventuale «no») si perdeva.
    if (mostraNuova) SceltaCartella(
        api,
        workspace = workspace,
        onApri = { percorso, ws ->
            scope.launch {
                if (tentaGestione("aprire una chat in quella cartella", nomePc) { api.apri(percorso, workspace = ws) } != null)
                    Nota.mostra("Chat aperta in «${percorso.substringAfterLast(Char(92)).substringAfterLast('/')}»" + (if (ws.isNullOrBlank()) "" else ", nel workspace «$ws»") + ": compare qui fra un paio di secondi.")
            }
        },
        onChiudi = { mostraNuova = false }
    )
    if (mostraWorkspace) GestioneWorkspace(api, workspace, nomePc, onChiudi = { mostraWorkspace = false })
    if (mostraRiprendi) SceltaSessione(
        api,
        onScegli = { s -> scope.launch { tenta("riprendere la conversazione") { api.riprendiSessione(s.cwd, s.id) } } },
        onChiudi = { mostraRiprendi = false }
    )
}

/** Il dettaglio: il terminale a polling e il campo per scrivere. */
@Composable
private fun DettaglioChat(api: Api, chat: Chat, deposito: Collegamento, onIndietro: () -> Unit, giu: Boolean = false, workspace: Workspace = Workspace(), nomePc: String? = null) {
    /**
     * Quello che scrivi (0.51.0): va in coda con un id e parte subito; se la
     * rete cade resta «in attesa di invio» e riparte da solo, con attese
     * crescenti, finché arriva. Il PC riconosce l'id e non lo scrive due volte.
     */
    var coda by remember(chat.id) { mutableStateOf<List<VoceCodaLinea>>(emptyList()) }
    var tentativiCoda by remember(chat.id) { mutableStateOf(0) }
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
    // L'invio della coda (0.51.0): uno alla volta, con le attese crescenti di `Linea` dopo una caduta.
    LaunchedEffect(chat.id) {
        while (isActive) {
            val v = Linea.prossimoDaMandare(coda)
            if (v == null) { delay(200); continue }
            if (tentativiCoda > 0) delay(Linea.attesaPrima(tentativiCoda))
            coda = Linea.inInvio(coda, v.id)
            try {
                api.scrivi(chat.id, v.testo, v.id)
                coda = Linea.consegnato(coda, v.id)
                tentativiCoda = 0
            } catch (e: kotlinx.coroutines.CancellationException) {
                coda = Linea.nonPartito(coda, v.id)
                throw e
            } catch (e: Api.Errore) {
                if (e.codice in 400..499) {
                    // Un rifiuto vero (il PIN, la chat chiusa): non si riprova; il testo torna nella casella.
                    coda = Linea.consegnato(coda, v.id)
                    if (testo.isBlank()) testo = v.testo
                    notaScelta = Nota.spiega(e, "mandarlo")
                } else { tentativiCoda += 1; coda = Linea.nonPartito(coda, v.id) }
            } catch (e: Exception) {
                tentativiCoda += 1
                coda = Linea.nonPartito(coda, v.id)
            }
        }
    }
    var menuAperto by remember { mutableStateOf(false) }
    var rinominando by remember { mutableStateOf(false) }
    var chiudendo by remember { mutableStateOf(false) }
    // ⏸ e ⇄ del riquadro sul PC (0.55.0).
    var addormentando by remember { mutableStateOf(false) }
    var spostando by remember { mutableStateOf(false) }
    var spostaIn by remember { mutableStateOf<String?>(null) }
    // «📎 Allega» (app 2.50.0): un file del telefono nel progetto di questa chat.
    var allegando by remember(chat.id) { mutableStateOf<List<android.net.Uri>?>(null) }
    val sceglieFile = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetMultipleContents()
    ) { uris -> if (uris.isNotEmpty()) allegando = uris }
    val scope = rememberCoroutineScope()
    // Come si legge lo schermo: adattato alla larghezza, o la griglia esatta.
    // Sta qui e non dentro la vista perche' il tasto che lo cambia e' in testata.
    var modo by remember { mutableStateOf(ModoTerminale.ADATTA) }
    // La misura del carattere: si ricorda sul telefono, non sul computer — e'
    // una cosa dello schermo che hai in mano.
    var dimensione by remember { mutableStateOf(deposito.dimensioneTerminale) }

    // Il tasto «più sopra» si spegne quando le righe nuove sono arrivate.
    LaunchedEffect(storia?.da, storia?.totale) { caricando = false }

    // La scelta appena mandata (le sue opzioni) e quando. Fra il tocco e il
    // ridisegno del terminale la stessa domanda tornava dalla lettura dopo,
    // come se il tocco non fosse arrivato: un secondo tocco finiva nella
    // domanda successiva. Un computer aggiornato la nasconde da se'; questo
    // vale con quelli vecchi, e nel giro fra una lettura e l'altra.
    var sceltaRisposta by remember { mutableStateOf<Pair<String, Long>?>(null) }
    // Il PIN delle chat (PC 0.49.0): chiusa per questo telefono = lucchetto, niente schermo né casella.
    var chiusaPin by remember(chat.id) { mutableStateOf(chat.pin == "chiusa") }

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
                chiusaPin = false
                val firma = SceltaVista.firma(letta.scelte)
                val risposta = sceltaRisposta
                storia = if (firma != null && risposta != null && risposta.first == firma &&
                    System.currentTimeMillis() - risposta.second < SCELTA_RISPOSTA_MS
                ) letta.copy(scelte = null) else letta
                vuoti = if (letta.grezze.isEmpty() && letta.righe.isEmpty()) vuoti + 1 else 0
                // Tre giri sono sei secondi: il tempo che un terminale ci mette
                // a disegnarsi dopo essere stato aperto, e non uno di piu'.
                guasto = if (vuoti >= 3)
                    "Il computer risponde, ma per questa chat non manda niente. Succede se il riquadro non è a schermo sul computer: portalo in primo piano nel suo workspace."
                else null
            } catch (e: Exception) {
                if (PinChat.chiusa(e)) {
                    chiusaPin = true; storia = null; guasto = null
                    delay(2000)
                    continue
                }
                if (api.ponte != null) {
                    // Attraverso il ponte non c'e' il ripiego sullo schermo: si dice il perche'.
                    guasto = if (e is Api.Errore) Nota.spiega(e, "leggere questa chat") else "Non riesco a leggere questa chat: ${e.message ?: "il PC non risponde"}"
                    delay(2000)
                    continue
                }
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
                        grezze = d.grezze,
                        continua = d.continua,
                        colonne = d.colonne
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
                // Lo stato e la cartella in una riga: come nell'elenco, cosi'
                // entrando non si perde l'informazione che ti ha fatto entrare.
                val lettura = leggiChat(chat)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LedChat(lettura.tono)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        lettura.parola + (if (chat.cwd.isNotBlank()) " · " + chat.cwd.substringAfterLast(Char(92)).substringAfterLast('/') else ""),
                        color = coloreTono(lettura.tono), fontSize = 11.sp, maxLines = 1
                    )
                }
            }
            // Le azioni del riquadro sul PC (0.55.0), anche su un altro PC attraverso il ponte.
            Box {
                IconButton(onClick = { menuAperto = true }, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Filled.MoreVert, "Altro", tint = Banco.testo)
                }
                DropdownMenu(expanded = menuAperto, onDismissRequest = { menuAperto = false }) {
                    DropdownMenuItem(text = { Text("Rinomina") }, onClick = { menuAperto = false; rinominando = true })
                    if (chat.viva) DropdownMenuItem(text = { Text("Metti a dormire") }, onClick = { menuAperto = false; addormentando = true })
                    else DropdownMenuItem(text = { Text("Svegliala") }, onClick = {
                        menuAperto = false
                        scope.launch { if (tentaGestione("svegliare la chat", nomePc) { api.svegliaChat(chat.id) } != null) Nota.mostra("La chat si sveglia sul computer: riparte da dove era.") }
                    })
                    DropdownMenuItem(text = { Text("Sposta in un altro workspace…") }, onClick = { menuAperto = false; spostando = true })
                    DropdownMenuItem(text = { Text("Chiudi la chat…") }, onClick = { menuAperto = false; chiudendo = true })
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

        if (chiusaPin) {
            CoperturaPinApp(api, chat.id, chat.titolo, onAperta = { chiusaPin = false }, modifier = Modifier.weight(1f).fillMaxWidth())
        } else {
        // ─── terminale ───
        VistaTerminale(
            grezze = storia?.grezze ?: emptyList(),
            // Per ricomporre il testo sulla larghezza del telefono (PC 0.52.6).
            continua = storia?.continua ?: emptyList(),
            colonne = storia?.colonne ?: 0,
            modo = modo,
            dimensione = dimensione,
            piuSopra = (storia?.da ?: 0) > 0,
            caricando = caricando,
            guasto = guasto,
            onPiuSopra = {
                caricando = true
                quante = (quante + PASSO_RISALITA).coerceAtMost(RIGHE_MASSIME)
            },
            modifier = Modifier.weight(1f).fillMaxWidth().alpha(if (giu) 0.45f else 1f)
        )
        HorizontalDivider(color = Banco.incisione)
        CodaLinea(coda) { id -> coda = Linea.consegnato(coda, id) }

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
                                // «Type something.» (2.52.5): si scrive nel campo qui sotto.
                                if (o.libera) { notaScelta = SceltaVista.SCRIVI; return@clickable }
                                val quale = o.testo
                                // Sparisce subito: un pulsante che resta invita a
                                // premerlo due volte, e il secondo tocco finirebbe
                                // nella domanda dopo. E resta sparita finche' lo
                                // schermo non cambia davvero.
                                sceltaRisposta = (SceltaVista.firma(scelte) ?: "") to System.currentTimeMillis()
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
                                        notaScelta = SceltaVista.rifiuto(e, "mandarla")
                                        // Rifiutata: la domanda torna, si può ritoccare.
                                        sceltaRisposta = null
                                    }
                                }
                            }
                            .padding(horizontal = 12.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TestoOpzione(o)
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
            Box(
                Modifier.size(40.dp).clip(CircleShape).clickable { sceglieFile.launch("*/*") },
                contentAlignment = Alignment.Center
            ) { Text("📎", fontSize = 20.sp) }
            Spacer(Modifier.width(6.dp))
            OutlinedTextField(
                value = testo,
                onValueChange = { testo = it.take(50_000) },
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
                        // In coda con il suo id (0.51.0): parte subito, o al ritorno della linea.
                        coda = Linea.accoda(coda, Linea.nuovoId(), testo, System.currentTimeMillis())
                        testo = ""
                        notaScelta = null
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
    }

    allegando?.let { uris ->
        // `api` è già quella giusta: del PC accoppiato, o del ponte verso l'altro PC.
        SchermoMandaA(api, null, uris, fissa = DestinazioneFile("chat", chat.id, chat.titolo.ifBlank { chat.cwd }, sessione = chat.sessione)) { allegando = null }
    }
    if (rinominando) {
        RinominaChat(
            titolo = chat.titolo,
            onSalva = { nome -> scope.launch { tenta("rinominare la chat") { api.rinominaChat(chat.id, nome) } } },
            onChiudi = { rinominando = false }
        )
    }
    val titoloChat = chat.titolo.ifBlank { chat.cwd }
    if (chiudendo) {
        DialogoConferma(AzioniTelefono.confermaChiudi(titoloChat), pericolo = true, onSi = {
            chiudendo = false
            // Si torna all'elenco **dopo** che il computer ha detto si':
            // tornare prima cancellava questo scope con la risposta
            // dentro, e un rifiuto restava muto. Se non va, si resta
            // qui e la nota in cima dice perche'.
            scope.launch {
                if (tentaGestione("chiudere la chat", nomePc) { api.chiudiChat(chat.id) } != null) onIndietro()
            }
        }, onNo = { chiudendo = false })
    }
    if (addormentando) {
        DialogoConferma(AzioniTelefono.confermaDormi(titoloChat), onSi = {
            addormentando = false
            scope.launch { if (tentaGestione("mettere a dormire la chat", nomePc) { api.dormiChat(chat.id) } != null) Nota.mostra("«$titoloChat» dorme: il suo claude.exe è chiuso, la conversazione è al suo posto. «Svegliala» dal menu la riaccende.") }
        }, onNo = { addormentando = false })
    }
    if (spostando) {
        SceltaWorkspace("Sposta «$titoloChat» in…", workspace.nomi, tranne = workspace.chat.firstOrNull { it.sessione == chat.sessione }?.workspace ?: workspace.attivo,
            onScegli = { spostando = false; spostaIn = it }, onChiudi = { spostando = false })
    }
    spostaIn?.let { verso ->
        DialogoConferma(AzioniTelefono.confermaSposta(titoloChat, verso), onSi = {
            spostaIn = null
            scope.launch { if (tentaGestione("spostare la chat", nomePc) { api.spostaChat(chat.id, verso) } != null) { Nota.mostra("«$titoloChat» è in «$verso»: riparte quando sul computer si passa a quel workspace."); onIndietro() } }
        }, onNo = { spostaIn = null })
    }
}

/** Chiede il nome nuovo e lo consegna a chi l'ha aperta: la chiamata la fa lei, che resta viva. */
@Composable
private fun RinominaChat(titolo: String, onSalva: (String) -> Unit, onChiudi: () -> Unit) {
    var nome by remember { mutableStateOf(titolo) }
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
                onSalva(nome.trim())
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
internal fun SceltaCartella(api: Api, workspace: Workspace = Workspace(), onApri: (String, String?) -> Unit, onChiudi: () -> Unit, etichetta: String = "Apri qui", titolo: String = "Apri una chat in…") {
    var giro by remember { mutableStateOf<Sfoglia?>(null) }
    // Dove nasce la chat (0.55.0): il predefinito è il workspace davanti sul computer.
    var ws by remember { mutableStateOf(workspace.attivo) }
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
                guasto = if (e is Api.Errore) spiegaGestione(e, "sfogliare le cartelle", null) else "Questo computer non sa ancora sfogliare le cartelle da qui: aggiornalo."
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
                Text(titolo)
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
            Column(Modifier.fillMaxWidth().height(380.dp)) {
                SceltaWorkspaceRiga(workspace.nomi, ws) { ws = it }
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
                                onApri(g.percorso, ws.ifBlank { null })
                            }
                        ) { Text(if (g.progetto) "$etichetta (progetto)" else etichetta) }
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

/**
 * Riprende una conversazione salvata.
 *
 * Le chat la cui cartella sta su un altro PC ci sono lo stesso, con «su
 * <nome>» accanto: toccandole il computer rifiuta (409) e spiega perche' —
 * la spiegazione arriva nella nota in cima, tramite `tenta` di chi ha aperto
 * questa finestra.
 */
@Composable
private fun SceltaSessione(api: Api, onScegli: (SessioneRipresa) -> Unit, onChiudi: () -> Unit) {
    var sessioni by remember { mutableStateOf<List<SessioneRipresa>?>(null) }
    // Un guasto non e' «niente da riprendere»: prima le due cose si
    // confondevano, e un computer che non rispondeva sembrava senza storia.
    var guasto by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        sessioni = try { api.sessioni().sessioni } catch (e: Exception) {
            guasto = "Non riesco a leggere le conversazioni dal computer: ${e.message ?: "non risponde"}. Chiudi e riprova fra poco."
            emptyList()
        }
    }

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Riprendi una conversazione") },
        text = {
            Column(Modifier.fillMaxWidth().height(320.dp).verticalScroll(rememberScrollState())) {
                Text(
                    "Le conversazioni di Claude Code su questo computer, dalla più recente. Toccandone una si riapre sul computer con tutta la sua storia, nel workspace dove era salvata. Quelle «su un altro PC» hanno la cartella là: da qui non si riaprono (partirebbero in una cartella vuota) — scrivile da Computer → Altri computer.",
                    color = Banco.testoQuieto, fontSize = 11.sp
                )
                Spacer(Modifier.height(6.dp))
                when {
                    guasto != null -> Text(guasto!!, color = Banco.ambra, fontSize = 13.sp)
                    sessioni == null -> Text("Carico…", color = Banco.testoQuieto)
                    sessioni!!.isEmpty() -> Text("Niente da riprendere: Claude Code non ha ancora conversazioni su questo computer.", color = Banco.testoQuieto)
                    else -> for (s in sessioni!!) {
                        Column(
                            Modifier.fillMaxWidth().padding(vertical = 8.dp).clickableCartella {
                                onChiudi()
                                onScegli(s)
                            }
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(s.titolo.ifBlank { s.cwd }, color = Banco.testo, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                                // La cartella e' su un altro PC: una parola quieta, come nell'elenco.
                                if (!s.altrove.isNullOrBlank()) {
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        "· " + etichettaAltrove(s.altrove, s.altroveAcceso),
                                        color = if (s.altroveAcceso == true) Banco.verde else Banco.testoQuieto,
                                        fontSize = 11.sp, maxLines = 1
                                    )
                                }
                            }
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

/** Il colore di ogni stato: ambra per ciò che aspetta te, verde per chi lavora, accento per chi è guidato. */
fun coloreTono(t: TonoChat?): androidx.compose.ui.graphics.Color = when (t) {
    TonoChat.SCEGLIE, TonoChat.ASPETTA -> Banco.ambra
    TonoChat.LAVORA -> Banco.verde
    TonoChat.GUIDATA -> Banco.accento
    TonoChat.SPENTA, null -> Banco.testoQuieto
}

/** Il LED di una chat: pieno se ha un terminale acceso, solo contorno se è spenta o chiusa (`null`). */
@Composable
fun LedChat(tono: TonoChat?) {
    val c = coloreTono(tono)
    Box(
        Modifier
            .size(10.dp)
            .clip(CircleShape)
            .then(if (tono == null || tono == TonoChat.SPENTA) Modifier.border(1.dp, c, CircleShape) else Modifier.background(c))
    )
}
