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

/** Il dettaglio: il terminale a polling e il campo per scrivere. */
@Composable
internal fun DettaglioChat(api: Api, chat: Chat, deposito: Collegamento, onIndietro: () -> Unit, giu: Boolean = false, workspace: Workspace = Workspace(), nomePc: String? = null, versionePc: String? = PcCorrente.versione) {
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
                    Davanti.pausa(2000)
                    continue
                }
                if (api.ponte != null) {
                    // Attraverso il ponte non c'e' il ripiego sullo schermo: si dice il perche'.
                    guasto = if (e is Api.Errore) Nota.spiega(e, "leggere questa chat") else "Non riesco a leggere questa chat: ${e.message ?: "il PC non risponde"}"
                    Davanti.pausa(2000)
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
            Davanti.pausa(2000)
        }
    }

    Column(Modifier.fillMaxSize()) {
        // ─── testata ───
        // Il titolo su due piani: il nome della chat, e sotto la cartella in cui
        // lavora. Da lontano sapere *dove* sta lavorando conta quanto il nome.
        FasciaChat {
            IconButton(onClick = onIndietro) {
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
                        color = coloreTono(lettura.tono), fontSize = 12.sp, maxLines = 1
                    )
                }
            }
            // Le azioni del riquadro sul PC (0.55.0): il «⋯», uguale a quello di ogni riga dell'elenco (2.83.0).
            MenuChat(api, chat, workspace, nomePc, versionePc, onLasciata = onIndietro)
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
                color = Banco.testoQuieto, fontSize = 12.sp
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
        // ─── la domanda breve, in cima (PC 0.76.0) ───
        DomandaBreveInCima(api, chat)
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
                    color = Banco.testoQuieto, fontSize = 12.sp, letterSpacing = 1.sp
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
                            .tocco {
                                // «Type something.» (2.52.5): si scrive nel campo qui sotto.
                                if (o.libera) { notaScelta = SceltaVista.SCRIVI; return@tocco }
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
                Modifier.size(48.dp).clip(CircleShape).tocco { sceglieFile.launch("*/*") },
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
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(if (puoInviare) Banco.accento else Banco.incisione)
                    .tocco(enabled = puoInviare) {
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
}
