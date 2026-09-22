package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.QuestionAnswer
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.TextButton
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import androidx.compose.foundation.layout.Column
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Le tre destinazioni della fascia in basso.
 *
 * «Adesso» non c'è più, ed è stata una rimozione, non una perdita: nove volte
 * su dieci era vuota, e quando non lo era diceva cose che dovevi **andare a
 * cercare** proprio mentre erano urgenti. Ciò che conteneva — una domanda che
 * aspetta, un autopilota fermo — adesso compare come una banda in cima a
 * qualunque schermata tu stia guardando. Le urgenze si portano a chi guarda;
 * non si mettono in una stanza in fondo al corridoio.
 */
enum class Scheda { CHAT, DOMANDE, LAVORI, NEGOZIO, COMPUTER }

/**
 * Dove aprire l'app quando lo chiede qualcun altro: una notifica toccata.
 * `MainActivity` lo scrive, `App` lo legge una volta e lo azzera.
 */
object Apertura {
    var schedaRichiesta by mutableStateOf<Scheda?>(null)
}

/**
 * La radice dell'app: prima il muro dell'accoppiamento, poi il resto.
 *
 * Finché non c'è un indirizzo **e** una chiave, si vede solo l'ingresso: senza,
 * ogni altra schermata potrebbe solo mostrare un errore. Appena il pairing riesce
 * lo stato cambia e la stessa `App` ricompone sulla plancia vera.
 */
@Composable
fun App(deposito: Collegamento, scansionaQr: ((String) -> Unit, (String) -> Unit) -> Unit) {
    var indirizzo by remember { mutableStateOf(deposito.indirizzo) }
    var chiave by remember { mutableStateOf(deposito.chiave) }
    val collegato = indirizzo.isNotBlank() && chiave.isNotBlank()

    /**
     * Passa a un altro computer.
     *
     * Non e' un nuovo accoppiamento: la chiave di ogni computer e' sempre stata
     * salvata **per indirizzo**, quindi tornare a uno gia' visto e' istantaneo e
     * non chiede nessun codice. Un indirizzo mai visto ha chiave vuota, e allora
     * `collegato` diventa falso e si finisce sulla schermata del QR — che e'
     * esattamente quello che serve in quel caso, senza un ramo apposta.
     */
    fun vaiA(nuovo: String) {
        deposito.indirizzo = nuovo
        indirizzo = deposito.indirizzo
        chiave = deposito.chiave
    }

    Surface(color = Banco.fondo) {
        if (!collegato) {
            Ingresso(
                deposito = deposito,
                scansionaQr = scansionaQr,
                onCollegato = { ind, ch -> indirizzo = ind; chiave = ch }
            )
        } else {
            Principale(
                api = remember(indirizzo, chiave) { Api(indirizzo, chiave) },
                deposito = deposito,
                indirizzo = indirizzo,
                onVaiA = { vaiA(it) },
                onScollega = { deposito.dimentica(); indirizzo = ""; chiave = "" }
            )
        }
    }
}

/**
 * La plancia: la fascia in basso a quattro destinazioni, e sopra la schermata
 * scelta. Il polso del computer arriva da `/api/stato` ogni due secondi finché
 * questa schermata è viva; dopo due giri a vuoto si dichiara «scollegato» invece
 * di mostrare dati vecchi come se fossero freschi.
 */
/** Non piu' spesso di cosi', anche se l'app torna davanti dieci volte in un minuto. */
private const val CONTROLLO_APP_OGNI_MS = 10 * 60 * 1000L
/** L'ultimo controllo dell'app nuova, per tutta la vita del processo. */
private var ultimoControlloApp = 0L

@Composable
fun Principale(
    api: Api,
    deposito: Collegamento,
    /** L'indirizzo di adesso: serve al selettore per sapere quale e' in uso. */
    indirizzo: String,
    /** Passa a un altro computer, o all'ingresso se gli si da' una stringa vuota. */
    onVaiA: (String) -> Unit,
    onScollega: () -> Unit
) {
    val contesto = LocalContext.current
    // Si apre sulle chat: e' quello per cui si prende in mano il telefono.
    var scheda by remember { mutableStateOf(Scheda.CHAT) }
    // Una notifica toccata porta dove serve, una volta.
    LaunchedEffect(Apertura.schedaRichiesta) {
        Apertura.schedaRichiesta?.let { scheda = it; Apertura.schedaRichiesta = null }
    }
    var stato by remember { mutableStateOf<Stato?>(null) }
    var connesso by remember { mutableStateOf(true) }
    var giriFalliti by remember { mutableIntStateOf(0) }
    /**
     * Quanti «non ti riconosco» di fila sono arrivati dal computer.
     *
     * Prima ne bastava **uno** per dimenticare indirizzo e chiave e tornare al
     * codice QR. Sembrava logico — la chiave non vale più, tanto vale
     * ricominciare — ed era il modo più veloce di perdere l'accoppiamento per
     * un errore che sarebbe passato da solo: al computer bastava un istante
     * sfortunato mentre riscriveva l'elenco dei dispositivi per rispondere 401
     * a un telefono perfettamente autorizzato. Ora ne servono parecchi di fila,
     * e comunque non si butta via niente da soli: lo si dice, e lo decide chi
     * ha il telefono in mano.
     */
    var rifiuti by remember { mutableIntStateOf(0) }
    /**
     * Da quando il computer si sta installando, o `null`.
     *
     * Si accende in due modi: premendo «Installa» da qui, e vedendo passare la
     * fase «installo» nello stato — perche' l'aggiornamento puo' partire anche
     * dallo schermo del computer, e da fuori quei trenta secondi di silenzio
     * sono identici a un guasto.
     */
    // Niente `remember`: quello leggeva una volta sola, e premere «Installa»
    // nella scheda Computer scriveva su disco senza che qui se ne accorgesse
    // nessuno. Adesso `Installazione` e' stato di Compose e questa schermata si
    // ridisegna nell'istante del tocco.
    LaunchedEffect(Unit) { Installazione.riprendi(contesto) }
    /** Il selettore dei computer e' aperto. */
    var scegliComputer by remember { mutableStateOf(false) }

    // L'app nuova, se c'e': una striscia in alto che si chiude, non una
    // finestra in faccia. Si cerca all'apertura e poi ogni sei ore, prima
    // chiedendo al computer (che lo sa gia'), poi a GitHub. Chiusa, non torna
    // finche' non esce una versione ancora piu' nuova.
    var appNuova by remember { mutableStateOf<Pair<String, String>?>(null) }
    var dialogoApp by remember { mutableStateOf(false) }
    // Ogni volta che l'app torna davanti si ricontrolla (al massimo ogni
    // dieci minuti): prima si guardava all'apertura e poi ogni sei ore, e
    // un'app rimasta aperta in sottofondo non vedeva la versione nuova.
    var giroApp by remember { mutableIntStateOf(0) }
    val cicloVita = LocalLifecycleOwner.current
    DisposableEffect(cicloVita) {
        val osservatore = LifecycleEventObserver { _, evento -> if (evento == Lifecycle.Event.ON_RESUME) giroApp += 1 }
        cicloVita.lifecycle.addObserver(osservatore)
        onDispose { cicloVita.lifecycle.removeObserver(osservatore) }
    }
    LaunchedEffect(api, giroApp) {
        while (isActive) {
            val adesso = System.currentTimeMillis()
            if (adesso - ultimoControlloApp >= CONTROLLO_APP_OGNI_MS) {
                ultimoControlloApp = adesso
                val esito = try { Aggiornamenti.cerca(BuildConfig.VERSION_NAME, api) } catch (_: Exception) { null }
                if (esito is Aggiornamenti.Esito.Trovata && deposito.aggiornamentoIgnorato != esito.nome) {
                    appNuova = esito.nome to esito.apk
                }
            }
            delay(6 * 60 * 60 * 1000L)
        }
    }

    // La guardia in background: è ciò per cui l'app esiste invece della sola
    // pagina — avvisa anche quando l'app è chiusa.
    LaunchedEffect(Unit) {
        try {
            // La sveglia, non il servizio: guardare come va il computer non
            // richiede di restare vivi, e quindi non richiede la riga fissa
            // che Android pretende in cambio. Il servizio continuo lo accende
            // chi lo vuole, dalla scheda Computer.
            Sentinella.programma(contesto)
            if (Collegamento(contesto).controlloContinuo) GuardiaService.avvia(contesto)
        } catch (_: Exception) {
        }
    }

    // Si veste con i colori scelti sul computer: stesso accento, stesso chiarore,
    // stesso stile (Banco/Foglio). Da qui in poi tutta l'app cambia con lui.
    LaunchedEffect(api) {
        try {
            Banco.applica(api.stile())
        } catch (_: Exception) {
        }
    }

    LaunchedEffect(api) {
        while (isActive) {
            try {
                val (letto, grezzo) = api.statoConTesto()
                // Lo stesso polso passa dalla guardia: una chat che finisce
                // mentre guardi un'altra scheda si annuncia adesso, non alla
                // prossima sveglia.
                try { Ronda.consuma(contesto, org.json.JSONObject(grezzo)) } catch (e: Exception) { /* un avviso in meno, non una schermata in meno */ }
                // L'ultima parola prima del silenzio. Va colta **mentre** il
                // computer la dice: fra un istante non risponde piu'.
                // L'aggiornamento puo' partire anche dallo schermo del
                // computer: questa e' l'unica strada per accorgersene da qui.
                if (letto.aggiornamento?.fase == "installo" && Installazione.da == null) {
                    val prima = try { api.ciao().versione } catch (e: Exception) { "" }
                    Installazione.iniziata(contesto, prima)
                }
                // **L'installazione puo' non essere cominciata.** Da quando il
                // computer aspetta che le chat finiscano quello che hanno in
                // mano, fra il tocco e la chiusura c'e' un'attesa che puo'
                // durare minuti - e puo' finire con un rifiuto, se la quiete
                // non arriva. Premendo «Installa» qui si segna subito, per non
                // giocarsi la schermata a testa o croce contro un computer che
                // sta chiudendo: se poi si scopre che non sta installando
                // affatto, va disdetto. Altrimenti resta uno schermo che dice
                // «sto installando» davanti a un computer che non lo sta
                // facendo, per dieci minuti.
                // «attendo» NON e' un rifiuto: e' il computer che aspetta che le
                // chat finiscano il turno, cioe' l'inizio della procedura. Uscire
                // qui faceva sparire la schermata subito dopo «Installa», e il
                // resto (chiusura, installer, ritorno) non lo vedeva nessuno.
                // Se e' finita per davvero lo decide la schermata stessa,
                // quando risponde la versione nuova.
                val ferma = letto.aggiornamento?.fase == "pronto" && letto.aggiornamento?.errore != null
                if (ferma && Installazione.da != null) Installazione.finita(contesto)
                stato = letto; connesso = true; giriFalliti = 0; rifiuti = 0
                // Ogni giro riuscito aggiorna la postazione: quando si e' usata
                // l'ultima volta, e come si chiama davvero — il nome della
                // macchina lo sa solo lei, e un elenco di indirizzi IP non si
                // legge.
                Postazioni.usata(contesto, indirizzo, letto.computer?.nome)
            } catch (e: Api.Errore) {
                if (e.daRiaccoppiare) rifiuti += 1
                giriFalliti += 1; if (giriFalliti >= 2) connesso = false
            } catch (e: Exception) {
                giriFalliti += 1; if (giriFalliti >= 2) connesso = false
            }
            delay(2000)
        }
    }

    // Sopra tutto il resto: mentre il computer si sostituisce non c'e' niente
    // altro da guardare, e le altre schermate direbbero solo «non risponde».
    val quando = Installazione.da
    if (quando != null) {
        SchermoInstallazione(
            api = api,
            versionePrima = Installazione.versionePrima,
            da = quando,
            onEsci = { Installazione.finita(contesto) }
        )
        return
    }

    if (rifiuti >= RIFIUTI_PER_ARRENDERSI) {
        NonRiconosciuto(
            onRiprova = { rifiuti = 0 },
            onRiaccoppia = onScollega
        )
        return
    }

    if (dialogoApp) appNuova?.let { (nome, apk) ->
        DialogoAggiornamentoApp(
            nome = nome,
            apk = apk,
            avviaScarico = { indirizzoApk, onProgresso, onGuasto ->
                Scaricamento.apk(contesto, indirizzoApk, onProgresso, onGuasto)
            },
            onChiudi = { dialogoApp = false }
        )
    }

    if (scegliComputer) {
        SelettoreComputer(
            correnteIndirizzo = indirizzo,
            onScegli = { scegliComputer = false; onVaiA(it) },
            onAggiungi = { scegliComputer = false; onVaiA("") },
            onChiudi = { scegliComputer = false }
        )
    }

    Scaffold(
        containerColor = Banco.fondo,
        bottomBar = { Fascia(scheda, stato) { scheda = it } }
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            // Con quale computer stai parlando. Sopra ogni schermata e non
            // dentro «Computer», perche' cambiare macchina e' un gesto che si fa
            // **mentre** si sta facendo altro: guardi una chat, ti accorgi che e'
            // dell'altro banco, cambi e continui.
            PillolaComputer(
                nome = stato?.computer?.nome?.takeIf { it.isNotBlank() }
                    ?: Postazioni.corrente(contesto)?.nome
                    ?: Postazioni.hostDi(indirizzo),
                connesso = connesso,
                onApri = { scegliComputer = true }
            )
            // Un tasto che non ce l'ha fatta lo dice qui, in cima, qualunque
            // schermata tu stia guardando: prima falliva in silenzio.
            NotaGlobale()
            // Quello che non può aspettare, sopra tutto il resto: non è un
            // avviso qualunque, è la ragione per cui questo telefono esiste.
            BandaUrgenze(api, stato, connesso, onApriDomande = { scheda = Scheda.DOMANDE })
            appNuova?.let { (nome, _) ->
                BandaAggiornamentoApp(
                    nome = nome,
                    onAggiorna = { dialogoApp = true },
                    onChiudi = { deposito.aggiornamentoIgnorato = nome; appNuova = null }
                )
            }
            Box(Modifier.weight(1f).fillMaxSize()) {
                when (scheda) {
                    Scheda.CHAT -> Chat(api, stato, deposito)
                    Scheda.DOMANDE -> Domande(api, stato)
                    Scheda.LAVORI -> Lavori(api, stato)
                    Scheda.NEGOZIO -> Negozio(api)
                    Scheda.COMPUTER -> Computer(api, stato)
                }
            }
        }
    }
}

/** La fascia in basso. Ogni voce porta il suo pallino di urgenza, così si vede
 *  da dove ti chiamano anche senza aprire la scheda. */
@Composable
private fun Fascia(
    attuale: Scheda,
    stato: Stato?,
    onScegli: (Scheda) -> Unit
) {
    val fermi = stato?.autopiloti?.any { it.stato == "sospeso" || it.stato == "fallito" } == true
    // Uno che si e' preparato e aspetta il via e' fermo quanto uno sospeso:
    // senza di te non parte. Ambra, non rosso: non e' andato storto niente.
    val pronti = stato?.autopiloti?.any { it.stato == "pronto" } == true
    val allarmeLavori: Color? = if (fermi) Banco.rosso else if (pronti) Banco.ambra else null
    // Domande degli autopiloti e chat che aspettano una scelta: e' quello che
    // chiede davvero qualcosa a te. Le chat ferme non contano, o il pallino
    // sarebbe acceso sempre.
    val chiedono = (stato?.domande?.size ?: 0) + (stato?.chat?.count { it.chiede } ?: 0)
    val allarmeDomande: Color? = if (chiedono > 0) Banco.ambra else null

    NavigationBar(containerColor = Banco.chassis) {
        voce(attuale, Scheda.CHAT, "Chat", Icons.Filled.Forum, allarme = null, onScegli)
        voce(attuale, Scheda.DOMANDE, if (chiedono > 0) "Domande · $chiedono" else "Domande", Icons.Filled.QuestionAnswer, allarme = allarmeDomande, onScegli)
        voce(attuale, Scheda.LAVORI, "Lavori", Icons.Filled.SmartToy, allarme = allarmeLavori, onScegli)
        voce(attuale, Scheda.NEGOZIO, "Negozio", Icons.Filled.Extension, allarme = null, onScegli)
        voce(attuale, Scheda.COMPUTER, "Computer", Icons.Filled.Computer, allarme = null, onScegli)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.voce(
    attuale: Scheda,
    quale: Scheda,
    testo: String,
    icona: ImageVector,
    /** Il colore del pallino, o `null` se non c'e' niente da segnalare. */
    allarme: Color?,
    onScegli: (Scheda) -> Unit
) {
    NavigationBarItem(
        selected = attuale == quale,
        onClick = { onScegli(quale) },
        icon = {
            if (allarme != null) {
                BadgedBox(badge = { Badge(containerColor = allarme) }) {
                    Icon(icona, contentDescription = testo)
                }
            } else {
                Icon(icona, contentDescription = testo)
            }
        },
        label = { Text(testo) },
        colors = NavigationBarItemDefaults.colors(
            selectedIconColor = Banco.accento,
            selectedTextColor = Banco.testo,
            indicatorColor = Banco.incisione,
            unselectedIconColor = Banco.testoQuieto,
            unselectedTextColor = Banco.testoQuieto
        )
    )
}

/** Segnaposto per le schede non ancora native (Chat, Lavori, Computer). */
@Composable
private fun Prossimamente(nome: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            "«$nome» in arrivo — sto portando questa schermata in nativo.",
            color = Banco.testoQuieto,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(32.dp)
        )
    }
}

/**
 * La nota d'errore di tutta l'app: una sola, in cima, qualunque schermata.
 *
 * Decine di tasti facevano `catch (_: Exception) {}`: un «Chiudi la chat» che
 * non arrivava, un «Vai» rifiutato, un workspace non cambiato — e a schermo
 * niente, come se fosse andata. La pagina servita dal computer lo dice in
 * cima («Non sono riuscito: …»); qui lo stesso. È un oggetto e non uno stato
 * passato di mano in mano perché chi fallisce sta in fondo a una tessera in
 * fondo a una scheda, e la nota deve comparire dove si sta guardando.
 *
 * Si chiude col tasto, o da sola dopo qualche secondo: è una notizia, non un
 * muro. `giro` cresce a ogni nota, così un secondo errore uguale al primo fa
 * ripartire il tempo invece di sparire a metà lettura.
 */
object Nota {
    var testo by mutableStateOf<String?>(null)
        private set
    var giro by mutableIntStateOf(0)
        private set

    fun mostra(t: String) { testo = t; giro += 1 }
    fun chiudi() { testo = null }

    /**
     * Cosa dire di una risposta del computer che non e' andata.
     *
     * Il computer spiega i suoi rifiuti in JSON, campo `errore` («cartella
     * non conosciuta», «questa chat lavora su …»): e' quella la frase utile.
     * Se il corpo non e' JSON si mostra com'e'; se e' vuoto, almeno il codice.
     */
    fun spiega(e: Api.Errore, cosa: String): String {
        if (e.daRiaccoppiare) return "Non sono riuscito a $cosa: il computer non riconosce più questo telefono."
        val dalJson = try {
            Api.json.parseToJsonElement(e.corpo).jsonObject["errore"]?.jsonPrimitive?.contentOrNull
        } catch (_: Exception) { null }
        val motivo = dalJson?.takeIf { it.isNotBlank() }
            ?: e.corpo.trim().takeIf { it.isNotBlank() }?.take(300)
            ?: "il computer ha risposto ${e.codice}"
        return "Non sono riuscito a $cosa: $motivo"
    }
}

/** Dopo quanto la nota se ne va da sola. Abbastanza per leggerla due volte. */
private const val NOTA_DURA_MS = 8_000L

/**
 * Prova a fare una cosa; se non va, lo dice nella [Nota] e torna `null`.
 *
 * `cosa` e' la descrizione all'infinito di quello che si stava facendo
 * («cambiare workspace», «chiudere la chat»): finisce nella frase «Non sono
 * riuscito a …». L'annullamento della coroutine non e' un errore da mostrare
 * e passa oltre com'e'.
 */
suspend fun <T> tenta(cosa: String, azione: suspend () -> T): T? =
    try {
        azione()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Api.Errore) {
        Nota.mostra(Nota.spiega(e, cosa)); null
    } catch (e: Exception) {
        Nota.mostra("Non sono riuscito a $cosa: ${e.message ?: "il computer non risponde"}"); null
    }

/** La nota in cima: rossa, con «Ok» per chiuderla; sparisce da sola. */
@Composable
fun NotaGlobale() {
    val testo = Nota.testo
    LaunchedEffect(testo, Nota.giro) {
        if (testo != null) { delay(NOTA_DURA_MS); Nota.chiudi() }
    }
    AnimatedVisibility(
        visible = testo != null,
        enter = expandVertically(),
        exit = shrinkVertically()
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(Banco.rosso.copy(alpha = 0.14f))
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.width(3.dp).height(38.dp).background(Banco.rosso)) {}
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Non è andata", color = Banco.rosso, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text(testo ?: "", color = Banco.testo, fontSize = 12.sp, maxLines = 4)
            }
            Spacer(Modifier.width(10.dp))
            TextButton(onClick = { Nota.chiudi() }) { Text("Ok") }
        }
    }
}

/**
 * Quanti rifiuti di fila prima di dire che c'è un problema.
 *
 * Il giro è di due secondi: cinque sono dieci secondi di «non ti riconosco»
 * ininterrotti, che nessun inciampo momentaneo del computer produce. Una revoca
 * vera, invece, dura per sempre e li raggiunge in dieci secondi.
 */
private const val RIFIUTI_PER_ARRENDERSI = 5

/**
 * «Il computer non ti riconosce più.»
 *
 * Al posto di quello che c'era prima, cioè niente: l'app cancellava chiave e
 * indirizzo e si ritrovava alla schermata del codice QR, senza dire perché.
 * Chi guardava vedeva un'app che si era dimenticata di tutto da sola.
 *
 * Qui si dice cosa è successo e si lasciano due strade, senza prenderne
 * nessuna al posto di chi legge: riprovare — perché il computer potrebbe essere
 * appena tornato — o rifare l'accoppiamento, che è l'unica cosa che serve se il
 * telefono è stato tolto davvero dall'elenco.
 */
@Composable
private fun NonRiconosciuto(onRiprova: () -> Unit, onRiaccoppia: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "Il computer non ti riconosce",
                color = Banco.testo,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Da qualche secondo risponde che questo telefono non è fra i suoi. " +
                    "Può essere passeggero: riprova. Se è stato tolto dall'elenco dei " +
                    "dispositivi, serve rifare l'accoppiamento con il codice QR.",
                color = Banco.testoQuieto,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = onRiprova) { Text("Riprova") }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onRiaccoppia) { Text("Rifai l'accoppiamento") }
        }
    }
}
