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

/** Chiede il nome nuovo e lo consegna a chi l'ha aperta: la chiamata la fa lei, che resta viva. */
@Composable
internal fun RinominaChat(titolo: String, onSalva: (String) -> Unit, onChiudi: () -> Unit) {
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
 * `E:\Users\utente\Documents\Qualcosa` su una tastiera del telefono. Quindi si
 * sfoglia, partendo dai posti che contano — i dischi, la tua cartella, i
 * progetti già noti — invece che dalla radice.
 */
@Composable
internal fun SceltaCartella(api: Api, workspace: Workspace = Workspace(), onApri: (String, String?) -> Unit, onChiudi: () -> Unit, etichetta: String = "Apri qui", titolo: String = "Apri una chat in…") {
    var giro by remember { mutableStateOf<Sfoglia?>(null) }
    // Dove nasce la chat (0.55.0): il predefinito è il workspace davanti sul computer.
    var ws by remember { mutableStateOf(workspace.attivo) }
    // Nome e modello (app 2.56.0), come «+ Nuova chat» del PC.
    var nomeChat by remember { mutableStateOf("") }
    var modello by remember { mutableStateOf("default") }
    var modelli by remember { mutableStateOf<List<ModelloClaude>>(emptyList()) }
    LaunchedEffect(Unit) { modelli = try { api.modelli().modelli } catch (_: Exception) { emptyList() } }
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
                        fontSize = 12.sp,
                        maxLines = 2
                    )
                }
            }
        },
        text = {
            Column(Modifier.fillMaxWidth().height(380.dp)) {
                SceltaWorkspaceRiga(workspace.nomi, ws) { ws = it }
                if (etichetta == "Apri qui") {
                    OutlinedTextField(value = nomeChat, onValueChange = { nomeChat = it.take(80) }, singleLine = true,
                        placeholder = { Text("Nome (facoltativo): se vuoto, quello della cartella", fontSize = 12.sp) }, modifier = Modifier.fillMaxWidth())
                    if (modelli.isNotEmpty()) {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            for (m in modelli) androidx.compose.material3.FilterChip(selected = modello == m.valore, onClick = { modello = m.valore }, label = { Text(m.etichetta, fontSize = 12.sp) })
                        }
                    }
                }
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
                                NuovaChat.nome = nomeChat; NuovaChat.modello = modello
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
                                    Text(v.percorso, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
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
internal fun SceltaSessione(api: Api, nomePc: String?, conGestione: Boolean, onSpazio: () -> Unit, onScegli: (SessioneRipresa) -> Unit, onChiudi: () -> Unit) {
    // Le tre azioni di una conversazione (PC 0.79.0): «⋯» sulla riga.
    var azioniPer by remember { mutableStateOf<SessioneRipresa?>(null) }
    var rileggi by remember { mutableStateOf(0) }
    var sessioni by remember { mutableStateOf<List<SessioneRipresa>?>(null) }
    // Un guasto non e' «niente da riprendere»: prima le due cose si
    // confondevano, e un computer che non rispondeva sembrava senza storia.
    var guasto by remember { mutableStateOf<String?>(null) }
    // Le chat senza nome (PC 0.60.0): fuori dall'elenco, contate; la casella le rimette.
    var senzaNome by remember { mutableStateOf(false) }
    var nascoste by remember { mutableStateOf(0) }
    LaunchedEffect(senzaNome, rileggi) {
        // Una lettura riuscita toglie il guasto di prima (prima restava per sempre).
        guasto = null
        sessioni = try { api.sessioni(senzaNome).also { nascoste = it.nascoste }.sessioni } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
            guasto = "Non riesco a leggere le conversazioni dal computer: ${e.message ?: "non risponde"}. Chiudi e riprova fra poco."
            emptyList()
        }
    }

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { TitoloDialogo("Riprendi una conversazione", "Le conversazioni di Claude Code su questo computer, dalla più recente. Toccandone una si riapre sul computer con tutta la sua storia, nel workspace dove era salvata. Quelle «su un altro PC» vivono là: toccandone una le scrivi da qui, e quel PC la avvia in sottofondo — là non si apre nessuna finestra — e il messaggio parte appena è pronta.") },
        text = {
            Column(Modifier.fillMaxWidth().height(320.dp).verticalScroll(rememberScrollState())) {
                if (nascoste > 0 || senzaNome) TextButton(onClick = { senzaNome = !senzaNome }) {
                    Text(ChatSenzaNome.testo(senzaNome, nascoste), fontSize = 12.sp)
                }
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
                                        fontSize = 12.sp, maxLines = 1
                                    )
                                }
                            }
                            if (s.cwd.isNotBlank()) Text(s.cwd, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
                        }
                        if (conGestione && s.altrove.isNullOrBlank()) TextButton(onClick = { azioniPer = s }) { Text("⋯ Chiudi, archivia, elimina", fontSize = 12.sp) }
                        HorizontalDivider(color = Banco.incisione)
                    }
                }
            }
        },
        confirmButton = { if (conGestione) TextButton(onClick = onSpazio) { Text("Spazio delle chat") } },
        dismissButton = { TextButton(onClick = onChiudi) { Text("Chiudi") } }
    )
    azioniPer?.let { s -> AzioniChatDialogo(api, s.id, s.titolo.ifBlank { s.cwd }, nomePc, onFatto = { rileggi += 1 }, onChiudi = { azioniPer = null }) }
}

/** Un click semplice su una riga di elenco. */
private fun Modifier.clickableCartella(onClick: () -> Unit): Modifier =
    this.tocco(onClick = onClick)
/** Nome e modello scelti nella finestra della chat nuova, per chi la apre (la finestra si chiude nello stesso tocco). */
internal object NuovaChat { var nome: String = ""; var modello: String = "default" }

/** Quale PC ospita la chat: questo, o uno degli altri accesi della stessa cassaforte. */
@Composable
internal fun SceltaOspite(api: Api, onScegli: (String, String) -> Unit, onChiudi: () -> Unit) {
    var pc by remember { mutableStateOf<ElencoPc?>(null) }
    LaunchedEffect(Unit) { pc = try { api.pc() } catch (_: Exception) { ElencoPc() } }
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { TitoloDialogo("Ospitata da…", "Il PC ospite è quello su cui la chat lavora davvero: il suo claude.exe parte solo lì, e sugli altri si apre dal vivo guardando lui. Cambiarlo non cancella niente e si annulla da «Dove vive ogni chat» sul PC.") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                Spacer(Modifier.height(8.dp))
                Text("Il computer di questa chat", color = Banco.testo, modifier = Modifier.fillMaxWidth().clickableCartella { onScegli("qui", PcCorrente.nome ?: "questo PC") }.padding(vertical = 10.dp))
                HorizontalDivider(color = Banco.incisione)
                val altri = pc?.pc?.filter { it.pcId != pc?.io } ?: emptyList()
                if (pc == null) Text("Leggo gli altri PC…", color = Banco.testoQuieto, fontSize = 12.sp)
                for (p in altri) {
                    Text(p.mostra + if (p.vivo) "" else " (spento)", color = if (p.vivo) Banco.testo else Banco.testoQuieto,
                        modifier = Modifier.fillMaxWidth().clickableCartella { onScegli(p.pcId, p.mostra) }.padding(vertical = 10.dp))
                    HorizontalDivider(color = Banco.incisione)
                }
            }
        },
        confirmButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
}
