package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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

/** Numeri di token leggibili: 12.4k, 3.1M. */
private fun tokenBrevi(n: Long): String = when {
    n >= 1_000_000 -> "%.1fM".format(n / 1_000_000.0)
    n >= 1_000 -> "%.1fk".format(n / 1_000.0)
    else -> n.toString()
}

/**
 * «Computer»: ciò che si governa del banco da lontano — i workspace, i
 * salvataggi, i consumi, lo stile, e l'aggiornamento del computer.
 */
@Composable
fun Computer(api: Api, stato: Stato?) {
    val scope = rememberCoroutineScope()
    var consumi by remember { mutableStateOf<Consumi?>(null) }
    var account by remember { mutableStateOf<Account?>(null) }
    var salvataggi by remember { mutableStateOf<List<Salvataggio>>(emptyList()) }
    var pref by remember { mutableStateOf<Preferenze?>(null) }
    var aggiornamento by remember { mutableStateOf<Aggiornamento?>(null) }
    var nuovoWs by remember { mutableStateOf("") }
    var confermaCarica by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        consumi = try { api.consumi() } catch (_: Exception) { null }
        account = try { api.account() } catch (_: Exception) { null }
        salvataggi = try { api.salvataggi().salvataggi } catch (_: Exception) { emptyList() }
        pref = try { api.preferenze().preferenze } catch (_: Exception) { null }
    }
    // Lo stato dell'aggiornamento cambia mentre scarica: si rinfresca.
    LaunchedEffect(Unit) {
        while (isActive) {
            aggiornamento = try { api.aggiornamento() } catch (_: Exception) { aggiornamento }
            delay(2000)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {

        // ─── Workspace ───
        // Tutto dentro una tessera sola: prima i workspace erano chip sospesi e
        // sotto, staccato, un campo con una scritta di fianco — tre cose che non
        // sembravano la stessa cosa. Qui si vede subito dove sei e dove puoi
        // andare, e il campo per crearne uno sta nello stesso pannello.
        Sezione("Workspace")
        val ws = stato?.workspace
        Tessera(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                if ((ws?.nomi ?: emptyList()).isEmpty()) {
                    Text("Nessun workspace.", color = Banco.testoQuieto, fontSize = 13.sp)
                } else {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        for (nome in ws?.nomi ?: emptyList()) {
                            VoceWorkspace(
                                nome = nome,
                                attivo = nome == ws?.attivo,
                                onClick = { scope.launch { try { api.cambiaWorkspace(nome) } catch (_: Exception) {} } }
                            )
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = Banco.incisione)
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = nuovoWs,
                        onValueChange = { nuovoWs = it.take(40) },
                        placeholder = { Text("Nome del nuovo", color = Banco.testoQuieto, fontSize = 14.sp) },
                        textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Banco.accento,
                            unfocusedBorderColor = Banco.incisione,
                            focusedContainerColor = Banco.fondo,
                            unfocusedContainerColor = Banco.fondo
                        ),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(10.dp))
                    Button(
                        enabled = nuovoWs.isNotBlank(),
                        shape = MaterialTheme.shapes.small,
                        onClick = {
                            val n = nuovoWs.trim(); nuovoWs = ""
                            scope.launch { try { api.creaWorkspace(n) } catch (_: Exception) {} }
                        }
                    ) { Text("Crea") }
                }
            }
        }

        Divisore()

        // ─── Account ───
        // Sola lettura, e di proposito: entrare da un telefono vuol dire
        // scrivere una password su una tastiera che qualcuno guarda, e uscire
        // vuol dire togliere l’accesso al **computer** con un tocco fatto in
        // tram. Sapere con quale account stai lavorando, invece, serve.
        Sezione("Account")
        Tessera(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        account?.email ?: if (account?.entrato == true) "entrato" else "Nessun account",
                        color = Banco.testo,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        maxLines = 1
                    )
                    Text(
                        if (account?.entrato == true) "Il computer sta lavorando con questo account."
                        else "Il computer lavora senza account. Si entra dal suo schermo.",
                        color = Banco.testoQuieto,
                        fontSize = 12.sp
                    )
                }
            }
        }

        Divisore()

        // ─── Consumi ───
        Sezione("Consumi (token)")
        val c = consumi
        if (c == null) Text("Carico…", color = Banco.testoQuieto)
        else {
            QuotaRiga("Oggi", c.oggi)
            QuotaRiga("7 giorni", c.settimana)
            QuotaRiga("Totale", c.totale)
        }

        Divisore()

        // ─── Salvataggi ───
        Sezione("Salvataggi")
        if (salvataggi.isEmpty()) Text("Nessun salvataggio.", color = Banco.testoQuieto)
        else for (s in salvataggi) {
            Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(s.nome, color = Banco.testo, maxLines = 1)
                        Text("${s.chat} chat · ${s.quando}", color = Banco.testoQuieto, fontSize = 12.sp)
                    }
                    OutlinedButton(onClick = { confermaCarica = s.nome }) { Text("Carica") }
                }
            }
        }

        Divisore()

        // ─── Impostazioni ───
        Sezione("Aspetto")
        val p = pref
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((chiave, etichetta) in listOf("banco" to "Banco", "foglio" to "Foglio")) {
                FilterChip(
                    selected = (p?.stile ?: "banco") == chiave,
                    onClick = {
                        pref = p?.copy(stile = chiave) ?: Preferenze(stile = chiave)
                        scope.launch { try { api.impostaStile(chiave) } catch (_: Exception) {} }
                    },
                    label = { Text(etichetta) }
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Chiarore del fondo", color = Banco.testoQuieto, fontSize = 12.sp)
        var chiarore by remember(p?.chiarore) { mutableStateOf((p?.chiarore ?: 20).toFloat()) }
        Slider(
            value = chiarore,
            onValueChange = { chiarore = it },
            valueRange = 0f..100f,
            onValueChangeFinished = {
                scope.launch { try { api.impostaChiarore(chiarore.toInt()) } catch (_: Exception) {} }
            }
        )

        Divisore()

        // ─── Aggiornamenti ───
        // Due programmi, due aggiornamenti, e prima ce n'era uno solo: si
        // vedeva quello del computer e dell'app non si sapeva niente —
        // nemmeno quale versione si avesse in mano.
        Sezione("Aggiornamenti")
        AggiornamentoApp()
        Spacer(Modifier.height(10.dp))
        AggiornamentoPc(api, aggiornamento)

        Spacer(Modifier.height(24.dp))
    }

    // conferma caricamento salvataggio (sostituisce ciò che hai a schermo)
    val nome = confermaCarica
    if (nome != null) {
        AlertDialog(
            onDismissRequest = { confermaCarica = null },
            title = { Text("Caricare «$nome»?") },
            text = { Text("Sostituisce le chat che hai a schermo con quelle del salvataggio.") },
            confirmButton = {
                TextButton(onClick = {
                    confermaCarica = null
                    scope.launch { try { api.caricaSalvataggio(nome) } catch (_: Exception) {} }
                }) { Text("Carica") }
            },
            dismissButton = { TextButton(onClick = { confermaCarica = null }) { Text("Annulla") } }
        )
    }
}

@Composable
private fun AggiornamentoPc(api: Api, a: Aggiornamento?) {
    val scope = rememberCoroutineScope()
    var cercando by remember { mutableStateOf(false) }
    var nota by remember { mutableStateOf<String?>(null) }

    RiquadroAggiornamento(
        titolo = "SierraDeck sul computer",
        versione = "il programma sul PC",
        stato = when (a?.fase) {
            "disponibile" -> "C'è la ${a.versione ?: "versione nuova"}, pronta da scaricare."
            "scarico" -> "Sto scaricando la ${a.versione ?: ""} — ${a.percento ?: 0}%."
            "pronto" -> "La ${a.versione ?: ""} è scaricata. Installandola, il computer si chiude e riparte da solo."
            "aggiornato" -> "È aggiornato. Controlla da sé ogni sei ore."
            else -> nota ?: "Nessun aggiornamento in sospeso. Controlla da sé ogni sei ore."
        },
        colore = when (a?.fase) {
            "disponibile", "pronto" -> Banco.accento
            "scarico" -> Banco.ambra
            else -> Banco.testoQuieto
        }
    ) {
        when (a?.fase) {
            "disponibile" -> Button(
                shape = MaterialTheme.shapes.small,
                onClick = { scope.launch { try { api.scaricaAggiornamento() } catch (_: Exception) {} } }
            ) { Text("Scarica") }
            "scarico" -> Text("${a.percento ?: 0}%", color = Banco.ambra, fontSize = 13.sp)
            "pronto" -> Button(
                shape = MaterialTheme.shapes.small,
                onClick = { scope.launch { try { api.installaAggiornamento() } catch (_: Exception) {} } }
            ) { Text("Installa e riavvia") }
            else -> OutlinedButton(
                enabled = !cercando,
                shape = MaterialTheme.shapes.small,
                onClick = {
                    cercando = true; nota = "Sto cercando…"
                    scope.launch {
                        nota = try {
                            api.cercaAggiornamentoPc()
                            "Ho chiesto al computer di guardare adesso."
                        } catch (e: Exception) {
                            // Un computer più vecchio non conosce questa strada:
                            // non è un guasto, e chiamarlo errore spaventerebbe.
                            "Questo computer non sa ancora cercare a comando: aggiornalo dal suo schermo."
                        }
                        cercando = false
                    }
                }
            ) { Text(if (cercando) "Cerco…" else "Cerca ora") }
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
private fun AggiornamentoApp() {
    val contesto = LocalContext.current
    var cercando by remember { mutableStateOf(false) }
    var nota by remember { mutableStateOf("Controlla da sé a ogni apertura.") }
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
                Aggiornamenti.cerca(BuildConfig.VERSION_NAME) { esito ->
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
                            nota = "Non ci sono riuscito: ${esito.motivo}."
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
        }
    }
}

@Composable
private fun QuotaRiga(nome: String, q: Quota) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(nome, color = Banco.testo, modifier = Modifier.width(90.dp))
        Text(
            "↑${tokenBrevi(q.ingresso)}  ↓${tokenBrevi(q.uscita)}  ⟳${tokenBrevi(q.cache)}  · ${q.chat} chat",
            color = Banco.testoQuieto,
            fontSize = 13.sp
        )
    }
}

@Composable
private fun Sezione(titolo: String) {
    Serigrafia(titolo)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun Divisore() {
    Spacer(Modifier.height(16.dp))
    HorizontalDivider(color = Banco.incisione)
    Spacer(Modifier.height(16.dp))
}

/**
 * Un workspace nell'elenco.
 *
 * Quello in cui sei ha il pieno dell'accento, gli altri il contorno inciso: si
 * capisce dove sei senza leggere, che e' il punto di guardarli tutti insieme.
 * Il chip di Material non lo diceva abbastanza — due grigi appena diversi.
 */
@Composable
private fun VoceWorkspace(nome: String, attivo: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        color = if (attivo) Banco.accento else Banco.fondo,
        contentColor = if (attivo) Banco.fondo else Banco.testo,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, if (attivo) Banco.accento else Banco.incisione)
    ) {
        Text(
            nome,
            fontSize = 13.sp,
            fontWeight = if (attivo) FontWeight.Bold else FontWeight.Normal,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
        )
    }
}
