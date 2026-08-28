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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import androidx.compose.foundation.layout.Column

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
enum class Scheda { CHAT, LAVORI, NEGOZIO, COMPUTER }

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
                val letto = api.stato()
                // L'ultima parola prima del silenzio. Va colta **mentre** il
                // computer la dice: fra un istante non risponde piu'.
                // L'aggiornamento puo' partire anche dallo schermo del
                // computer: questa e' l'unica strada per accorgersene da qui.
                if (letto.aggiornamento?.fase == "installo" && Installazione.da == null) {
                    val prima = try { api.ciao().versione } catch (e: Exception) { "" }
                    Installazione.iniziata(contesto, prima)
                }
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
            // Quello che non può aspettare, sopra tutto il resto: non è un
            // avviso qualunque, è la ragione per cui questo telefono esiste.
            BandaUrgenze(api, stato, connesso)
            Box(Modifier.weight(1f).fillMaxSize()) {
                when (scheda) {
                    Scheda.CHAT -> Chat(api, stato, deposito)
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

    NavigationBar(containerColor = Banco.chassis) {
        voce(attuale, Scheda.CHAT, "Chat", Icons.Filled.Forum, allarme = false, onScegli)
        voce(attuale, Scheda.LAVORI, "Lavori", Icons.Filled.SmartToy, allarme = fermi, onScegli)
        voce(attuale, Scheda.NEGOZIO, "Negozio", Icons.Filled.Extension, allarme = false, onScegli)
        voce(attuale, Scheda.COMPUTER, "Computer", Icons.Filled.Computer, allarme = false, onScegli)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.voce(
    attuale: Scheda,
    quale: Scheda,
    testo: String,
    icona: ImageVector,
    allarme: Boolean,
    onScegli: (Scheda) -> Unit
) {
    NavigationBarItem(
        selected = attuale == quale,
        onClick = { onScegli(quale) },
        icon = {
            if (allarme) {
                BadgedBox(badge = { Badge(containerColor = Banco.rosso) }) {
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
