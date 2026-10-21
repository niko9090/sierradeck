package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
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
internal const val RIGHE_ALL_APERTURA = 150
/** Per quanto la scelta appena mandata resta nascosta, se il computer la rimanda uguale. */
internal const val SCELTA_RISPOSTA_MS = 8000L
internal const val PASSO_RISALITA = 150
internal const val RIGHE_MASSIME = 600

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

    // Se la chat aperta sparisce (chiusa altrove), si torna all'elenco da soli;
    // chiusa da te sul computer (PC 0.60.9): lo si dice, con l'ora.
    var ultimaVista by remember { mutableStateOf<Chat?>(null) }
    var avvisoChiusa by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(chat, aperta) {
        val v = chat.firstOrNull { it.id == aperta }
        if (v != null) ultimaVista = v
        if (aperta != null && v == null) {
            ChiuseDaTe.chiusaDi(ultimaVista, chat, stato?.chiuse ?: emptyList())?.let { avvisoChiusa = ChiuseDaTe.avviso(ultimaVista?.titolo ?: "", it) }
            aperta = null
        }
    }

    val corrente = chat.firstOrNull { it.id == aperta }
    if (corrente != null) {
        BackHandler { aperta = null }
        DettaglioChat(api, corrente, deposito, onIndietro = { aperta = null }, workspace = stato?.workspace ?: Workspace(), nomePc = PcCorrente.nome)
    } else {
        Column(Modifier.fillMaxSize()) {
            AvvisoChiusa(avvisoChiusa) { avvisoChiusa = null }
            ElencoChat(api, chat, stato?.workspace ?: Workspace(), onApri = { avvisoChiusa = null; aperta = it.id }, nomePc = PcCorrente.nome)
        }
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
    // Lo stato del collegamento con quel PC è uno solo (app 2.56.0): lo fanno
    // avanzare questo controllo **e** ogni altra risposta (la storia della chat
    // aperta, lo scrivere), che passano dall'`Api`. Un controllo lento non dice
    // più «giù» mentre lo schermo arriva.
    val linea = Collegamenti.di(su.pcId)
    var ultima by remember(su.pcId) { mutableStateOf(0L) }
    LaunchedEffect(su.pcId) {
        while (isActive) {
            val ora = System.currentTimeMillis()
            if (Linea.eOra(Collegamenti.di(su.pcId), ultima, ora)) {
                ultima = ora
                try {
                    val s = kotlinx.coroutines.withTimeout(Linea.KEEPALIVE_SCADE_MS) { apiPc.stato() }
                    stato = s; guasto = null
                } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                    Collegamenti.passo(su.pcId, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", "${su.nome} non ha risposto in ${Linea.KEEPALIVE_SCADE_MS / 1000} secondi"))
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (e: Api.Errore) {
                    if (e.codice == 404 || e.codice == 409) guasto = "Il PC accoppiato non fa ancora da ponte: aggiornalo alla 0.48.0 o più nuova, e da qui vedrai le chat di ${su.nome}."
                } catch (e: Exception) {
                    // Le cadute della rete le conta già l'`Api`.
                    if (e !is java.io.IOException) Collegamenti.passo(su.pcId, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", e.message ?: "il computer non risponde"))
                }
            }
            Davanti.pausa(250)
        }
    }
    BackHandler { if (aperta != null) aperta = null else SuPc.corrente = null }
    Column(Modifier.fillMaxSize()) {
        FasciaSuPc(su, null, linea) { SuPc.corrente = null }
        // Quel PC è indietro (app 2.56.2): lo si dice, con «Installa là».
        BandaPcIndietro(api, su.pcId, su.nome, stato?.computer?.versione)
        // «Mi collego a NOME-PC…» (0.52.1): i tentativi finché il primo collegamento non riesce.
        val inizioPonte = remember(su.pcId) { System.currentTimeMillis() }
        var schedaPonte by remember(su.pcId) { mutableStateOf(true) }
        val vistaPonte = Tentativi.passi(su.nome, Tentativi.daLinea(linea, inizioPonte))
        LaunchedEffect(su.pcId, vistaPonte.fase) { if (vistaPonte.fase == "collegato") { delay(2500); schedaPonte = false } }
        if (schedaPonte) SchedaCollegamento(vistaPonte, null, onRiprova = { Collegamenti.passo(su.pcId, EventoLinea.RiprovaAdesso(System.currentTimeMillis())) })
        FasciaLinea(linea, su.nome, onRiprova = { Collegamenti.passo(su.pcId, EventoLinea.RiprovaAdesso(System.currentTimeMillis())) })
        guasto?.let { Text(it, color = Banco.rosso, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) }
        val chat = stato?.chat ?: emptyList()
        // Chiusa da te su quel PC (0.60.9): si torna all'elenco e lo si dice.
        var ultimaVista by remember(su.pcId) { mutableStateOf<Chat?>(null) }
        var avvisoChiusa by remember(su.pcId) { mutableStateOf<String?>(null) }
        LaunchedEffect(chat, aperta) {
            val v = chat.firstOrNull { it.id == aperta }
            if (v != null) ultimaVista = v
            if (aperta != null && v == null && stato != null) {
                ChiuseDaTe.chiusaDi(ultimaVista, chat, stato?.chiuse ?: emptyList())?.let { avvisoChiusa = ChiuseDaTe.avviso(ultimaVista?.titolo ?: "", it); aperta = null }
            }
        }
        AvvisoChiusa(avvisoChiusa) { avvisoChiusa = null }
        val corrente = chat.firstOrNull { it.id == aperta }
        when {
            corrente != null -> DettaglioChat(apiPc, corrente, deposito, onIndietro = { aperta = null }, giu = linea.fase == "ricollego", workspace = stato?.workspace ?: Workspace(), nomePc = su.nome, versionePc = stato?.computer?.versione)
            stato == null && guasto == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Busso a ${su.nome} attraverso il PC accoppiato…", color = Banco.testoQuieto)
            }
            else -> ElencoChat(apiPc, chat, stato?.workspace ?: Workspace(), onApri = { aperta = it.id }, nomePc = su.nome, versionePc = stato?.computer?.versione)
        }
    }
}

/** La riga «l'hai chiusa sul computer» sopra l'elenco (PC 0.60.9); un tocco la toglie. */
@Composable
private fun AvvisoChiusa(testo: String?, onVia: () -> Unit) {
    if (testo == null) return
    Text(
        testo,
        color = Banco.testoQuieto,
        fontSize = 13.sp,
        modifier = Modifier.fillMaxWidth().tocco { onVia() }.padding(horizontal = 12.dp, vertical = 8.dp)
    )
}

@Composable
private fun ElencoChat(api: Api, chat: List<Chat>, workspace: Workspace, onApri: (Chat) -> Unit, nomePc: String? = null, versionePc: String? = PcCorrente.versione) {
    var mostraNuova by remember { mutableStateOf(false) }
    var mostraWorkspace by remember { mutableStateOf(false) }
    var mostraRiprendi by remember { mutableStateOf(false) }
    /** Una conversazione che vive su un altro PC, a cui scrivere in sottofondo (PC 0.58.4). */
    var sottofondoPer by remember { mutableStateOf<SessioneRipresa?>(null) }
    // «Spazio delle chat» (PC 0.79.0): si apre da «Riprendi una conversazione».
    var mostraSpazio by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    // Tutte le chat del computer, raggruppate per workspace: prima quello
    // davanti, poi gli altri. Dentro ogni gruppo prima le vive, poi quelle
    // salvate che nessuna finestra mostra — si riaprono con un tocco.
    val gruppi = raggruppaChat(chat, workspace)

    Column(Modifier.fillMaxSize()) {
        // La fascia dell'elenco: l'etichetta a stencil dice dove sei, i due
        // gesti stanno a destra dentro un contorno — prima erano due scritte
        // sospese in mezzo al nulla, e non sembravano nemmeno premibili.
        FasciaChat {
            Column(Modifier.weight(1f)) {
                Serigrafia("Chat")
                // Da lontano: chi aspetta una tua scelta, chi lavora e chi è
                // ferma, senza scorrere l'elenco (0.80.0: «ferma» come sul PC).
                Text(
                    riassuntoChat(chat),
                    color = if (chatCheTiAspettano(chat) > 0) Banco.ambra else Banco.testoQuieto,
                    fontSize = 12.sp, maxLines = 2
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
                                Text("davanti", color = Banco.testoQuieto, fontSize = 12.sp)
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
                                            Text(nomeChat(viva), color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                            Spacer(Modifier.width(8.dp))
                                            Text(parola, color = coloreTono(lettura.tono), fontSize = 12.sp, maxLines = 1, softWrap = false)
                                            // Il «⋯» della chat anche qui (2.83.0): Rinomina, Sposta, Chiudi… a due tocchi.
                                            MenuChat(api, viva, workspace, nomePc, versionePc, onLasciata = {})
                                        }
                                    }
                                    // Il progetto e' in mano a un altro PC: una parola quieta, non un avviso.
                                    if (!viva.altrove.isNullOrBlank()) {
                                        Text("il progetto è in mano a ${viva.altrove}", color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
                                    }
                                    // Al lavoro in sottofondo (PC 0.69.0): si vede sempre; toccandola la guardi dal vivo,
                                    // e sul PC non cambia niente.
                                    viva.sottofondo?.let { sf ->
                                        Text("in sottofondo sul PC${if (sf.nome.isNotBlank()) " · ${sf.nome}" else ""} · tocca per guardarla", color = Banco.ambra, fontSize = 12.sp, maxLines = 1)
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
                                        Text("il progetto è in mano a ${salvata.altrove}: riaprila da là, o scrivile da Computer → Altri computer", color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 2)
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
                if (tentaGestione("aprire una chat in quella cartella", nomePc) { api.apriNuova(percorso, ws, NuovaChat.nome, NuovaChat.modello) } != null)
                    if (FunzioniPc.disponibile(FunzionePc.PARITA, versionePc) == false)
                        Nota.mostra("Chat aperta. ${nomePc ?: "Quel PC"} ha la $versionePc: la mette nel workspace davanti e con il nome della cartella; nome, workspace e modello scelti qui arrivano aggiornandolo con «Installa là».")
                    else Nota.mostra("Chat aperta in «${percorso.substringAfterLast(Char(92)).substringAfterLast('/')}»" + (if (ws.isNullOrBlank()) "" else ", nel workspace «$ws»") + ": compare qui fra un paio di secondi.")
            }
        },
        onChiudi = { mostraNuova = false }
    )
    if (mostraWorkspace) GestioneWorkspace(api, workspace, nomePc, onChiudi = { mostraWorkspace = false }, versionePc = versionePc)
    if (mostraRiprendi) SceltaSessione(
        api,
        nomePc = nomePc,
        conGestione = FunzioniPc.disponibile(FunzionePc.GESTIONE_CHAT, versionePc) != false,
        onSpazio = { mostraRiprendi = false; mostraSpazio = true },
        onScegli = { s ->
            // Vive su un altro PC (PC 0.58.4): le si scrive da qui, e là parte in sottofondo.
            if (!s.altrove.isNullOrBlank() && !s.altrovePc.isNullOrBlank()) sottofondoPer = s
            else scope.launch { tenta("riprendere la conversazione") { api.riprendiSessione(s.cwd, s.id) } }
        },
        onChiudi = { mostraRiprendi = false }
    )
    sottofondoPer?.let { s -> DialogoSottofondo(api, s, onChiudi = { sottofondoPer = null }) }
    if (mostraSpazio) SpazioDelleChat(api, nomePc, onChiudi = { mostraSpazio = false })
}

/**
 * La fascia in cima a una schermata.
 *
 * Fondo chassis e un solco sotto: e' la stessa modanatura della console sul
 * computer, ed e' cio' che tiene insieme i comandi invece di lasciarli
 * galleggiare sul fondo.
 */
@Composable
internal fun FasciaChat(contenuto: @Composable RowScope.() -> Unit) {
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
internal fun TastoContorno(testo: String, onClick: () -> Unit) {
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
internal fun TastoMisura(
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
    TonoChat.SCEGLIE -> ColoreStato.ambra
    TonoChat.LAVORA -> ColoreStato.verde
    TonoChat.GUIDATA -> Banco.accento
    TonoChat.FERMA, TonoChat.SPENTA, null -> ColoreStato.quieto
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
