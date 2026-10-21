package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.border
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions

@Composable
internal fun AggiornamentoPc(api: Api, a: Aggiornamento?, versionePc: String?) {
    val scope = rememberCoroutineScope()
    val contesto = LocalContext.current
    var cercando by remember { mutableStateOf(false) }
    var nota by remember { mutableStateOf<String?>(null) }
    /**
     * L'ora dell'ultima ricerca chiesta da qui.
     *
     * Se il computer è già all'ultima versione, premere «Cerca» non cambia
     * niente sullo schermo: la ricerca dura meno del giro di due secondi con
     * cui il telefono rilegge lo stato, e chi ha premuto vede esattamente lo
     * stesso riquadro di prima. Sembra un tasto rotto, ed era invece un tasto
     * che aveva già finito. Una riga con l'ora è la prova che è successo.
     */
    var cercatoAlle by remember { mutableStateOf<String?>(null) }
    // Com'e' andato l'ultimo «Installa»: prima, se la richiesta falliva, lo
    // schermo «sto installando» compariva e spariva senza una parola.
    var esitoInstalla by remember { mutableStateOf<String?>(null) }
    // La finestra delle note (0.39.0): «Installa» la apre, e solo il suo
    // «Installa e riavvia» chiede davvero l'installazione al computer.
    var finestraNote by remember { mutableStateOf(false) }
    var noteLette by remember { mutableStateOf<NoteAggiornamento?>(null) }

    val descrizione = when (a?.fase) {
        "cerco" -> "Sto guardando se c’è qualcosa di nuovo…"
        "disponibile" -> "C'è la ${a.versione ?: "versione nuova"}, da scaricare." + (a.errore?.let { "\n$it" } ?: "")
        "scarico" -> "Sto scaricando la ${a.versione ?: ""}."
        // Con il motivo del computer, se l'ultima installazione non e' partita:
        // il PC lo manda da sempre in questo campo, e qui nessuno lo leggeva.
        "pronto" -> "La ${a.versione ?: ""} è già scaricata e aspetta solo di essere installata." + (a.errore?.let { "\n$it" } ?: "")
        "attendo" -> when {
            a.attesaChat != null && a.attesa == null -> a.attesaChat.replaceFirstChar { it.uppercase() } + "."
            a.attesa != null -> "Aspetto che finisca ${a.attesa}, poi installo."
            (a.chatOccupate ?: 0) == 1 -> "Aspetto che una chat finisca quello che ha in mano, poi installo."
            else -> "Aspetto che ${a.chatOccupate ?: 0} chat finiscano quello che hanno in mano, poi installo."
        }
        "installo" -> "Sto installando: il computer si chiude e riparte da solo."
        "aggiornato" -> "È all’ultima versione."
        "errore" -> "Non ci sono riuscito: ${a.errore ?: "errore sconosciuto"}"
        else -> nota ?: "Controlla da sé ogni dieci minuti. Puoi anche chiederglielo adesso."
    }
    val colore = when (a?.fase) {
        "disponibile", "pronto" -> Banco.accento
        "scarico", "cerco", "installo", "attendo" -> Banco.ambra
        "errore" -> Banco.rosso
        "aggiornato" -> Banco.verde
        else -> Banco.testoQuieto
    }

    fun cerca() {
        cercando = true; nota = "Sto cercando…"; cercatoAlle = null
        scope.launch {
            nota = try {
                api.cercaAggiornamentoPc()
                cercatoAlle = oraDiAdesso()
                null
            } catch (e: Exception) {
                "Questo computer non sa ancora cercare a comando: aggiornalo dal suo schermo."
            }
            // Un attimo di «Cerco…» anche quando la risposta è immediata: sotto
            // il mezzo secondo il tasto cambia e torna prima che l'occhio se ne
            // accorga, e il gesto sembra non essere arrivato.
            delay(900)
            cercando = false
        }
    }

    RiquadroAggiornamento(
        titolo = "SierraDeck sul computer",
        versione = if (versionePc == null) "il programma sul PC" else "adesso ha la $versionePc",
        stato = descrizione,
        colore = colore,
        percento = if (a?.fase == "scarico") (a.percento ?: 0) else null,
        poscritto = esitoInstalla ?: cercatoAlle?.let { "Ho cercato alle $it." }
    ) {
        when (a?.fase) {
            "disponibile" -> Button(
                shape = MaterialTheme.shapes.small,
                onClick = { scope.launch { tenta("far scaricare l'aggiornamento al computer") { api.scaricaAggiornamento() } } }
            ) { Text("Scarica") }
            "scarico" -> Text("${a.percento ?: 0}%", color = Banco.ambra, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            "cerco" -> Text("cerco…", color = Banco.ambra, fontSize = 13.sp)
            // Nessun tasto: premere di nuovo non anticipa niente, e un tasto
            // che non fa niente e' peggio di nessun tasto.
            "attendo" -> Text("aspetto…", color = Banco.ambra, fontSize = 13.sp)
            "pronto" -> Button(
                shape = MaterialTheme.shapes.small,
                onClick = {
                    // Prima le note, poi la conferma: lo stesso «Installa» del PC.
                    finestraNote = true
                    noteLette = null
                    scope.launch {
                        noteLette = try {
                            // Un tentativo andato male si dice anche qui, prima di riprovare (0.39.2).
                            conTentativoFallito(api.noteAggiornamento(), a.tentativoFallito)
                        } catch (e: Api.Errore) {
                            noteMancanti(if (e.codice == 409 || e.codice == 404) "il computer ha una versione che non le sa ancora dare" else "HTTP ${e.codice}")
                        } catch (e: Exception) {
                            noteMancanti(e.message)
                        }
                    }
                }
            ) { Text("Installa") }
            else -> OutlinedButton(
                enabled = !cercando,
                shape = MaterialTheme.shapes.small,
                onClick = { cerca() }
            ) { Text(if (cercando) "Cerco…" else "Cerca ora") }
        }
    }

    if (finestraNote) {
        DialogoNoteAggiornamento(
            versione = a?.versione ?: "versione nuova",
            note = noteLette,
            onPiuTardi = { finestraNote = false },
            onInstalla = {
                finestraNote = false
                    scope.launch {
                        // Prima si segna, poi si chiede: fra la richiesta e la
                        // chiusura del computer possono passare pochi
                        // millisecondi, e segnare dopo vorrebbe dire non
                        // segnare affatto.
                        Installazione.iniziata(contesto, versionePc)
                        esitoInstalla = null
                        // Se la richiesta non parte, lo schermo «sto installando»
                        // restava davanti a un computer che non lo stava facendo,
                        // per dieci minuti. E si dice: un tasto che torna com'era
                        // senza una parola sembra rotto.
                        try {
                            api.installaAggiornamento()
                            esitoInstalla = "Chiesto alle ${oraDiAdesso()}. Se il computer resta su «pronto» senza aspettare le chat, il perché è nel suo registro (sul PC: Account → Apri i log, righe «aggiornamenti»); chiudere e riaprire SierraDeck là sblocca un «Installa» rimasto appeso."
                        } catch (e: Api.Errore) {
                            Installazione.finita(contesto)
                            esitoInstalla = "Il computer ha rifiutato la richiesta (HTTP ${e.codice}). Riprova; se continua, aggiorna SierraDeck dal suo schermo."
                        } catch (e: Exception) {
                            Installazione.finita(contesto)
                            esitoInstalla = "Non sono riuscito a chiedere l’installazione: ${e.message ?: "il computer non risponde"}."
                        }
                    }
            }
        )
    }

    // L'ultima installazione non è riuscita (0.39.2): il perché e le strade,
    // con la pagina della versione per scaricarla a mano.
    val fallito = a?.tentativoFallito
    if (fallito != null && a.fase != "installo" && a.fase != "attendo") {
        val uri = LocalUriHandler.current
        Spacer(Modifier.height(8.dp))
        Column(Modifier.fillMaxWidth().border(1.dp, Banco.ambra, MaterialTheme.shapes.small).padding(12.dp)) {
            Text("L’ULTIMA INSTALLAZIONE NON È RIUSCITA", color = Banco.ambra, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(testoTentativoFallito(fallito), color = Banco.testo, fontSize = 13.sp)
            linkAmmessoApp(fallito.pagina)?.let { link ->
                TextButton(onClick = { runCatching { uri.openUri(link) } }) { Text("Pagina della versione") }
            }
        }
    }

    // «Cerca» **sempre**, anche quando una versione è già pronta.
    //
    // Prima il tasto spariva appena qualcosa era stato scaricato: se nel
    // frattempo ne usciva una più nuova, l’unica cosa che potevi fare era
    // installare quella vecchia. Cercare non cancella ciò che è già
    // scaricato — se non c’è niente di più nuovo, il tasto «Installa» torna.
    if (a?.fase == "pronto" || a?.fase == "disponibile" || a?.fase == "errore") {
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            OutlinedButton(
                enabled = !cercando,
                shape = MaterialTheme.shapes.small,
                onClick = { cerca() }
            ) { Text(if (cercando) "Cerco…" else "Cerca se ce n’è una più nuova") }
        }
    }
}

/**
 * L'aggiornamento **dell'app**.
 *
 * Prima esisteva solo all'avvio, e in silenzio: se non compariva niente non
 * si sapeva se fosse aggiornata o se il controllo non avesse funzionato — e la
 * versione che si ha in mano non era scritta da nessuna parte.
 */
@Composable
internal fun AggiornamentoApp(api: Api) {
    val contesto = LocalContext.current
    val scope = rememberCoroutineScope()
    var cercando by remember { mutableStateOf(false) }
    var nota by remember { mutableStateOf("Controlla da sé a ogni apertura, e ti avvisa in alto.") }
    var trovata by remember { mutableStateOf<Pair<String, String>?>(null) }
    var colore by remember { mutableStateOf(Banco.testoQuieto) }

    RiquadroAggiornamento(
        titolo = "L'app su questo telefono",
        versione = "versione ${BuildConfig.VERSION_NAME}",
        stato = nota,
        colore = colore
    ) {
        OutlinedButton(
            enabled = !cercando,
            shape = MaterialTheme.shapes.small,
            onClick = {
                cercando = true
                nota = "Sto cercando…"
                colore = Banco.testoQuieto
                scope.launch {
                    val esito = try {
                        Aggiornamenti.cerca(BuildConfig.VERSION_NAME, api)
                    } catch (e: Exception) {
                        Aggiornamenti.Esito.NonRiuscita(e.message ?: "non so perché")
                    }
                    when (esito) {
                        is Aggiornamenti.Esito.Trovata -> {
                            nota = "C'è la ${esito.nome}."
                            colore = Banco.accento
                            trovata = esito.nome to esito.apk
                        }
                        is Aggiornamenti.Esito.GiaAggiornata -> {
                            nota = "È l'ultima. Non c'è niente di nuovo."
                            colore = Banco.verde
                        }
                        is Aggiornamenti.Esito.NonRiuscita -> {
                            nota = "Non ci sono riuscito (${esito.motivo})."
                            colore = Banco.ambra
                        }
                    }
                    cercando = false
                }
            }
        ) { Text(if (cercando) "Cerco…" else "Cerca ora") }
    }

    trovata?.let { (nome, apk) ->
        DialogoAggiornamentoApp(
            nome = nome,
            apk = apk,
            avviaScarico = { indirizzo, onProgresso, onGuasto ->
                Scaricamento.apk(contesto, indirizzo, onProgresso, onGuasto)
            },
            onChiudi = { trovata = null }
        )
    }
}

/**
 * Il riquadro di un aggiornamento: chi è, che versione ha, come sta, e il gesto.
 *
 * Uno solo per tutti e due, perché sono la stessa cosa detta di due programmi —
 * e quando due riquadri hanno la stessa forma il secondo si legge senza doverlo
 * rileggere.
 */
@Composable
private fun RiquadroAggiornamento(
    titolo: String,
    versione: String,
    stato: String,
    colore: androidx.compose.ui.graphics.Color,
    /** Da 0 a 100 mentre scarica; assente quando non sta scaricando. */
    percento: Int? = null,
    /** Una riga in coda, per dire che una cosa che non si vede è comunque successa. */
    poscritto: String? = null,
    azione: @Composable () -> Unit
) {
    Tessera(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(titolo, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text(versione, color = Banco.testoQuieto, fontSize = 12.sp)
                }
                azione()
            }
            Spacer(Modifier.height(10.dp))
            Text(stato, color = colore, fontSize = 13.sp)
            // La barra c’è solo mentre scarica. Prima si vedeva la sola
            // percentuale dentro una frase, e da un telefono — dove guardi
            // per due secondi — non sembrava che stesse succedendo niente.
            if (percento != null) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { percento / 100f },
                    color = colore,
                    trackColor = Banco.incisione,
                    modifier = Modifier.fillMaxWidth().height(6.dp)
                )
            }
            if (poscritto != null) {
                Spacer(Modifier.height(6.dp))
                Text(poscritto, color = Banco.testoQuieto, fontSize = 12.sp)
            }
        }
    }
}

/** L'ora di adesso, ore e minuti. Serve solo a dire «è successo, ed è successo ora». */
private fun oraDiAdesso(): String =
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date())
