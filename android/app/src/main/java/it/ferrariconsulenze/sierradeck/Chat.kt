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
 * «Chat»: l'elenco delle conversazioni aperte, e dentro ciascuna il terminale.
 *
 * Un solo livello di profondità: dall'elenco si entra in una chat, e da lì il
 * tasto indietro riporta all'elenco (non fuori dall'app — uscire per sbaglio da
 * dove si sta scrivendo è il modo più veloce per perdere quello che si scrive).
 */
@Composable
fun Chat(api: Api, stato: Stato?) {
    var aperta by remember { mutableStateOf<String?>(null) }
    val chat = stato?.chat ?: emptyList()

    // Se la chat aperta sparisce (chiusa altrove), si torna all'elenco da soli.
    LaunchedEffect(chat, aperta) {
        if (aperta != null && chat.none { it.id == aperta }) aperta = null
    }

    val corrente = chat.firstOrNull { it.id == aperta }
    if (corrente != null) {
        BackHandler { aperta = null }
        DettaglioChat(api, corrente, onIndietro = { aperta = null })
    } else {
        ElencoChat(api, chat, onApri = { aperta = it.id })
    }
}

@Composable
private fun ElencoChat(api: Api, chat: List<Chat>, onApri: (Chat) -> Unit) {
    var mostraNuova by remember { mutableStateOf(false) }
    var mostraRiprendi by remember { mutableStateOf(false) }

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
        if (chat.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Nessuna chat aperta.", color = Banco.testoQuieto)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(chat, key = { it.id }) { c ->
                    Tessera(
                        onClick = { onApri(c) },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text(c.titolo.ifBlank { c.cwd }, color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1)
                            if (!c.ultimaRiga.isNullOrBlank()) {
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    c.ultimaRiga!!,
                                    color = Banco.testoQuieto,
                                    fontSize = 12.sp,
                                    fontFamily = FontFamily.Monospace,
                                    maxLines = 1
                                )
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
private fun DettaglioChat(api: Api, chat: Chat, onIndietro: () -> Unit) {
    var dentro by remember(chat.id) { mutableStateOf<Dentro?>(null) }
    var testo by remember(chat.id) { mutableStateOf("") }
    var menuAperto by remember { mutableStateOf(false) }
    var rinominando by remember { mutableStateOf(false) }
    var chiudendo by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    // Come si legge lo schermo: adattato alla larghezza, o la griglia esatta.
    // Sta qui e non dentro la vista perche' il tasto che lo cambia e' in testata.
    var modo by remember { mutableStateOf(ModoTerminale.ADATTA) }

    LaunchedEffect(chat.id) {
        while (isActive) {
            try { dentro = api.dentro(chat.id) } catch (_: Exception) {}
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
                    dentro?.titolo?.ifBlank { chat.titolo }?.ifBlank { chat.cwd } ?: chat.titolo.ifBlank { chat.cwd },
                    color = Banco.testo, fontWeight = FontWeight.Bold, maxLines = 1, fontSize = 15.sp
                )
                if (chat.cwd.isNotBlank()) {
                    Text(
                        chat.cwd.substringAfterLast(Char(92)).substringAfterLast('/'),
                        color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1
                    )
                }
            }
            // Le due letture dello schermo. Il tasto dice **dove vai**, non dove
            // sei: e' l'unico modo perche' si capisca senza provarlo.
            TastoContorno(if (modo == ModoTerminale.ADATTA) "Griglia" else "Adatta") {
                modo = if (modo == ModoTerminale.ADATTA) ModoTerminale.GRIGLIA else ModoTerminale.ADATTA
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

        // ─── terminale ───
        VistaTerminale(
            grezze = dentro?.grezze ?: emptyList(),
            modo = modo,
            modifier = Modifier.weight(1f).fillMaxWidth()
        )
        HorizontalDivider(color = Banco.incisione)

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
                        scope.launch { try { api.scrivi(chat.id, da) } catch (_: Exception) {} }
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

/** Sceglie una cartella conosciuta e apre lì una chat nuova. */
@Composable
private fun SceltaCartella(api: Api, onChiudi: () -> Unit) {
    var cartelle by remember { mutableStateOf<List<String>?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { cartelle = try { api.cartelle().cartelle } catch (_: Exception) { emptyList() } }

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Apri una chat in…") },
        text = {
            Column(Modifier.fillMaxWidth().height(320.dp).verticalScroll(rememberScrollState())) {
                when {
                    cartelle == null -> Text("Carico…", color = Banco.testoQuieto)
                    cartelle!!.isEmpty() -> Text("Nessuna cartella conosciuta.", color = Banco.testoQuieto)
                    else -> for (c in cartelle!!) {
                        Column(
                            Modifier.fillMaxWidth().padding(vertical = 8.dp).clickableCartella {
                                onChiudi()
                                scope.launch { try { api.apri(c) } catch (_: Exception) {} }
                            }
                        ) {
                            Text(c.substringAfterLast('\\').substringAfterLast('/'), color = Banco.testo, maxLines = 1)
                            Text(c, color = Banco.testoQuieto, fontSize = 11.sp, maxLines = 1)
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
