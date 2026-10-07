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
import androidx.compose.runtime.key
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
 * Le cinque destinazioni della fascia in basso.
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
    /** La chat da aprire nella scheda Chat (da «Apri la chat» in Domande). */
    var chatRichiesta by mutableStateOf<String?>(null)

    /** Porta alla scheda Chat, dentro quella chat. */
    fun apriChat(id: String) { chatRichiesta = id; schedaRichiesta = Scheda.CHAT }
    /** Dalla notifica dell'aggiornamento (0.43.0): versione e APK da installare. */
    var aggiornamento by mutableStateOf<Pair<String, String>?>(null)
    /** I file condivisi con SierraDeck da un'altra app (app 2.50.0): si apre «Manda a…». */
    var condivisi by mutableStateOf<List<android.net.Uri>?>(null)
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
    /**
     * La scelta del computer (2.52.2): `Selezione` dice se c'è da fare
     * qualcosa. Il tocco su quello già scelto non fa niente; un altro apre un
     * tentativo nuovo verso **quella** postazione soltanto.
     */
    var selezione by remember { mutableStateOf(Selezione.iniziale(deposito.indirizzo)) }
    fun vaiA(nuovo: String) {
        if (nuovo.isNotBlank()) {
            val (s, mossa) = Selezione.tocca(selezione, nuovo)
            if (mossa is MossaSelezione.Niente) return
            selezione = s
        }
        deposito.indirizzo = nuovo
        indirizzo = deposito.indirizzo
        chiave = deposito.chiave
        if (nuovo.isNotBlank() && indirizzo != selezione.scelto) selezione = selezione.copy(scelto = indirizzo)
    }
    /** «Torna al PC di prima» (2.52.3): una scelta come le altre, con `Selezione.tornaIndietro`. */
    fun tornaIndietro() {
        val (s, mossa) = Selezione.tornaIndietro(selezione)
        if (mossa !is MossaSelezione.Collegati) return
        selezione = s
        deposito.indirizzo = mossa.indirizzo
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
            // **Tutto daccapo per ogni computer** (2.52.2): con `key` lo stato
            // letto, i contatori dei giri e i collegamenti del computer di prima
            // se ne vanno al cambio. Prima restavano: nome in alto, «Mi collego
            // a …» e chat erano ancora quelli del computer già collegato.
            key(indirizzo) {
                Principale(
                    api = remember(indirizzo, chiave) { Api(indirizzo, chiave) },
                    deposito = deposito,
                    indirizzo = indirizzo,
                    gen = selezione.gen,
                    precedente = selezione.precedente,
                    onTornaIndietro = { tornaIndietro() },
                    onEsito = { g, ok -> selezione = Selezione.esito(selezione, g, indirizzo, ok) },
                    onVaiA = { vaiA(it) },
                    onScollega = { deposito.dimentica(); indirizzo = ""; chiave = "" }
                )
            }
        }
    }
}

/** Non piu' spesso di cosi', anche se l'app torna davanti dieci volte in un minuto. */
private const val CONTROLLO_APP_OGNI_MS = 10 * 60 * 1000L
/** L'ultimo controllo dell'app nuova, per tutta la vita del processo. */
private var ultimoControlloApp = 0L

/**
 * La plancia: la fascia in basso a cinque destinazioni, e sopra la schermata
 * scelta. Il polso del computer arriva da `/api/stato` ogni due secondi finché
 * questa schermata è viva; dopo due giri a vuoto si dichiara «scollegato» invece
 * di mostrare dati vecchi come se fossero freschi.
 */
@Composable
fun Principale(
    api: Api,
    deposito: Collegamento,
    /** L'indirizzo di adesso: serve al selettore per sapere quale e' in uso. */
    indirizzo: String,
    /** Il numero del tentativo di selezione in corso (`Selezione`). */
    gen: Int = 0,
    /** Com'è andato il collegamento a questo computer. */
    onEsito: (Int, Boolean) -> Unit = { _, _ -> },
    /** La postazione scelta prima, per «Torna al PC di prima». */
    precedente: String? = null,
    onTornaIndietro: () -> Unit = {},
    /** Passa a un altro computer, o all'ingresso se gli si da' una stringa vuota. */
    onVaiA: (String) -> Unit,
    onScollega: () -> Unit
) {
    val contesto = LocalContext.current
    // Si apre sulle chat: e' quello per cui si prende in mano il telefono.
    var scheda by remember { mutableStateOf(Scheda.CHAT) }
    /** Dalla scheda Domande alla linguetta «Domande» di un autopilota (0.38.0). */
    var apriAutopilota by remember { mutableStateOf<String?>(null) }
    // Una notifica toccata porta dove serve, una volta.
    LaunchedEffect(Apertura.schedaRichiesta) {
        Apertura.schedaRichiesta?.let { scheda = it; Apertura.schedaRichiesta = null }
    }
    var stato by remember { mutableStateOf<Stato?>(null) }
    var connesso by remember { mutableStateOf(true) }
    /** Il collegamento con questo computer, per l'indicatore in alto (0.52.0): la stessa macchina dei PC. */
    var lineaPc by remember(indirizzo) { mutableStateOf(Linea.NUOVA) }
    /**
     * «Mi collego a NOME-PC…» (0.52.1): al cambio di computer (e all'apertura)
     * si provano le strade e si vedono, con `Tentativi.passi`. Dalla 2.52.2
     * **solo l'indirizzo della postazione scelta** (`Selezione.indirizziDi`):
     * niente più ripiego su altre postazioni con lo stesso nome.
     */
    var eventiTent by remember(indirizzo) { mutableStateOf<List<EventoTentativo>>(emptyList()) }
    var giroTent by remember(indirizzo) { mutableIntStateOf(0) }
    var schedaTent by remember(indirizzo) { mutableStateOf(true) }
    /**
     * La schermata intera del cambio di computer (2.52.3): si apre quando lo
     * scegli dal selettore (gen > 0) o premi «Riprova»; i passi li ricava
     * `Viaggi.passi` da questi fatti (indirizzo, orari, motivi).
     */
    val nomeScelto = Postazioni.elenca(contesto).firstOrNull { it.indirizzo == indirizzo }?.nome ?: Postazioni.hostDi(indirizzo)
    val nomePrima = precedente?.let { p -> Postazioni.elenca(contesto).firstOrNull { it.indirizzo == p }?.nome ?: Postazioni.hostDi(p) }
    var viaggio by remember(indirizzo) { mutableStateOf(Viaggio(nomeScelto, nomePrima, System.currentTimeMillis(), Selezione.indirizziDi(indirizzo), emptyList())) }
    var schermataViaggio by remember(indirizzo) { mutableStateOf(gen > 0) }
    var versioneScelto by remember(indirizzo) { mutableStateOf<String?>(null) }
    LaunchedEffect(indirizzo, giroTent, gen) {
        schedaTent = true
        val ev = mutableListOf<EventoTentativo>()
        val dettagli = mutableMapOf<String, DettaglioStrada>()
        viaggio = Viaggio(nomeScelto, nomePrima, System.currentTimeMillis(), Selezione.indirizziDi(indirizzo), emptyList())
        fun e(x: EventoTentativo) { ev += x; eventiTent = ev.toList(); viaggio = viaggio.copy(eventi = ev.toList(), dettagli = dettagli.toMap()) }
        eventiTent = emptyList()
        val perStrada = Selezione.indirizziDi(indirizzo).groupBy { Linea.stradaDiIndirizzo(it) ?: "lan" }
        var ultimo = "nessuna strada ha risposto"
        for (s in listOf("lan", "tailscale")) {
            val indirizzi = perStrada[s]
            if (indirizzi == null) {
                e(EventoTentativo.Salta(s, if (s == "lan") "nessun indirizzo della rete di casa salvato per questo computer" else "nessun indirizzo Tailscale salvato per questo computer"))
                continue
            }
            for (a in indirizzi) {
                val t0 = System.currentTimeMillis()
                dettagli[s] = DettaglioStrada(a, t0)
                e(EventoTentativo.Provo(s, t0))
                val riuscito = try {
                    val c = kotlinx.coroutines.withTimeout(5000) { Api(a, deposito.chiaveDi(a)).ciao() }
                    versioneScelto = c.versione.takeIf { it.isNotBlank() }
                    true
                } catch (x: kotlinx.coroutines.TimeoutCancellationException) {
                    ultimo = "non ha risposto in 5 secondi"; false
                } catch (x: kotlinx.coroutines.CancellationException) {
                    throw x
                } catch (x: Exception) {
                    ultimo = x.message?.take(120) ?: "non risponde"; false
                }
                if (riuscito) {
                    dettagli[s] = DettaglioStrada(a, t0, System.currentTimeMillis())
                    e(EventoTentativo.Riuscita(s, System.currentTimeMillis(), System.currentTimeMillis() - t0))
                    // La verifica della chiave: /api/ciao risponde a chiunque, /api/stato solo a chi ha la chiave.
                    val k0 = System.currentTimeMillis()
                    viaggio = viaggio.copy(chiave = DettaglioStrada(a, k0))
                    val chiaveOk = try {
                        kotlinx.coroutines.withTimeout(8000) { Api(a, deposito.chiaveDi(a)).stato() }
                        viaggio = viaggio.copy(chiave = DettaglioStrada(a, k0, System.currentTimeMillis()), chiaveOk = true)
                        true
                    } catch (x: kotlinx.coroutines.TimeoutCancellationException) {
                        viaggio = viaggio.copy(chiave = DettaglioStrada(a, k0, System.currentTimeMillis(), "il computer non ha confermato la chiave in 8 secondi (non ha risposto)"), chiaveOk = false); false
                    } catch (x: kotlinx.coroutines.CancellationException) {
                        throw x
                    } catch (x: Api.Errore) {
                        viaggio = viaggio.copy(chiave = DettaglioStrada(a, k0, System.currentTimeMillis(), if (x.codice == 401) "il computer ha risposto 401: questa chiave non la riconosce" else "il computer ha risposto ${x.codice}"), chiaveOk = false); false
                    } catch (x: Exception) {
                        viaggio = viaggio.copy(chiave = DettaglioStrada(a, k0, System.currentTimeMillis(), x.message?.take(160) ?: "non risponde"), chiaveOk = false); false
                    }
                    onEsito(gen, chiaveOk)
                    if (chiaveOk) {
                        delay(1200)
                        schermataViaggio = false
                        delay(1300)
                        schedaTent = false
                    }
                    return@LaunchedEffect
                }
                dettagli[s] = DettaglioStrada(a, t0, System.currentTimeMillis(), ultimo)
                e(EventoTentativo.Fallita(s, System.currentTimeMillis(), ultimo))
            }
        }
        e(EventoTentativo.Salta("webrtc", "dal telefono il ponte verso gli altri PC si apre dalla scheda Computer, «Altri computer»"))
        e(EventoTentativo.Salta("drive", "il telefono non legge il Drive"))
        e(EventoTentativo.Fallito(System.currentTimeMillis(), "nessuna strada ha risposto (ultimo motivo: $ultimo)"))
        // Resta su questo computer, con «Riprova»: mai un ritorno da solo su quello di prima.
        onEsito(gen, false)
    }
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
    // Toccata la notifica dell'aggiornamento: il dialogo di sempre, subito.
    LaunchedEffect(Apertura.aggiornamento) {
        Apertura.aggiornamento?.let { appNuova = it; dialogoApp = true; Apertura.aggiornamento = null }
    }
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
    // La versione del computer (0.43.0): le funzioni che non ha ancora si
    // mostrano spente, con «arriva aggiornando il PC alla X». /api/ciao la
    // dice da sempre; dalla 0.43.0 la porta anche /api/stato.
    LaunchedEffect(api) {
        PcCorrente.versione = null
        try { PcCorrente.versione = api.ciao().versione.takeIf { it.isNotBlank() } } catch (_: Exception) { }
    }

    LaunchedEffect(api) {
        val strada = Linea.stradaDiIndirizzo(indirizzo)
        var ultimaIl = 0L
        while (isActive) {
            // Con la linea su si legge ogni due secondi; caduta, si riprova con
            // le attese crescenti di `Linea` (0.52.1): è quello che conta il
            // conto alla rovescia accanto all'indicatore.
            if (!Linea.eOra(lineaPc, ultimaIl, System.currentTimeMillis())) { delay(250); continue }
            ultimaIl = System.currentTimeMillis()
            val t0 = System.currentTimeMillis()
            try {
                val (letto, grezzo) = api.statoConTesto()
                lineaPc = Linea.passo(lineaPc, EventoLinea.Ok(System.currentTimeMillis(), System.currentTimeMillis() - t0, strada))
                letto.computer?.versione?.takeIf { it.isNotBlank() }?.let { if (PcCorrente.versione != it) PcCorrente.versione = it }
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
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Api.Errore) {
                if (e.daRiaccoppiare) rifiuti += 1
                giriFalliti += 1; if (giriFalliti >= 2) connesso = false
                // Una risposta del computer, anche un rifiuto, vuol dire che la linea c'è.
                lineaPc = if (e.codice > 0) Linea.passo(lineaPc, EventoLinea.Ok(System.currentTimeMillis(), System.currentTimeMillis() - t0, strada))
                else Linea.passo(lineaPc, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", e.message ?: "il computer non risponde"))
            } catch (e: Exception) {
                giriFalliti += 1; if (giriFalliti >= 2) connesso = false
                lineaPc = Linea.passo(lineaPc, EventoLinea.Errore(System.currentTimeMillis(), "irraggiungibile", e.message ?: "il computer non risponde"))
            }
            delay(250)
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

    // Condividi → SierraDeck (app 2.50.0): «Manda a…» con le chat di tutti i PC e gli autopiloti.
    Apertura.condivisi?.let { uris ->
        SchermoMandaA(api, stato, uris, fissa = null, onChiudi = { Apertura.condivisi = null })
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
                linea = lineaPc,
                onApri = { scegliComputer = true }
            )
            // Il cambio di computer a tutto schermo (2.52.3).
            if (schermataViaggio) {
                val ultimoUsoV = Postazioni.elenca(contesto).firstOrNull { it.indirizzo == indirizzo }?.ultimoUso?.takeIf { it > 0 }
                SchermataViaggio(
                    v = viaggio,
                    versionePc = versioneScelto,
                    ultimoSegno = ultimoUsoV?.let { java.text.SimpleDateFormat("d MMM 'alle' HH:mm", java.util.Locale.ITALIAN).format(java.util.Date(it)) },
                    adesso = adessoVivo(true),
                    puoiTornare = nomePrima,
                    onRiprova = { giroTent += 1; lineaPc = Linea.passo(lineaPc, EventoLinea.RiprovaAdesso(System.currentTimeMillis())) },
                    onTornaIndietro = onTornaIndietro,
                    onAnnulla = { schermataViaggio = false }
                )
            }
            // I tentativi del collegamento, sotto il computer scelto (0.52.1).
            if (!schermataViaggio && schedaTent && eventiTent.isNotEmpty()) {
                // Il nome del computer **scelto**: la sua postazione, poi quello che dice lui.
                val nomeTent = Postazioni.elenca(contesto).firstOrNull { it.indirizzo == indirizzo }?.nome ?: stato?.computer?.nome?.takeIf { it.isNotBlank() } ?: Postazioni.hostDi(indirizzo)
                val ultimoUso = Postazioni.elenca(contesto).firstOrNull { it.indirizzo == indirizzo }?.ultimoUso?.takeIf { it > 0 }
                SchedaCollegamento(
                    Tentativi.passi(nomeTent, eventiTent),
                    ultimoUso?.let { java.text.SimpleDateFormat("d MMM 'alle' HH:mm", java.util.Locale.ITALIAN).format(java.util.Date(it)) },
                    onRiprova = { giroTent += 1; schermataViaggio = true; lineaPc = Linea.passo(lineaPc, EventoLinea.RiprovaAdesso(System.currentTimeMillis())) }
                )
            }
            // Un tasto che non ce l'ha fatta lo dice qui, in cima, qualunque
            // schermata tu stia guardando: prima falliva in silenzio.
            NotaGlobale()
            // Il Drive del computer scollegato (0.39.3): non si chiude.
            BandaDriveScollegato(stato?.driveScollegato)
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
                    Scheda.DOMANDE -> Domande(api, stato, onApriAutopilota = { id -> apriAutopilota = id; scheda = Scheda.LAVORI })
                    Scheda.LAVORI -> Lavori(api, stato, apri = apriAutopilota, onAperto = { apriAutopilota = null })
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
    val chiedono = stato?.let { domandeInAttesa(it) } ?: 0
    val allarmeDomande: Color? = if (chiedono > 0) Banco.ambra else null
    // Le chat che hanno finito il turno e aspettano la tua prossima
    // istruzione: non sono domande, ma da lontano sono la notizia «tocca a
    // te». Prima la voce Chat non aveva mai un pallino.
    val aspettano = stato?.chat?.count { leggiChat(it).tono == TonoChat.ASPETTA } ?: 0
    val allarmeChat: Color? = if (aspettano > 0) Banco.ambra else null

    NavigationBar(containerColor = Banco.chassis) {
        voce(attuale, Scheda.CHAT, if (aspettano > 0) "Chat · $aspettano" else "Chat", Icons.Filled.Forum, allarme = allarmeChat, onScegli)
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
