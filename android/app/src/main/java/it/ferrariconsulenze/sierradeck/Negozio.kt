package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * «Negozio»: cosa Claude Code ha in dotazione sul computer, e cosa è acceso.
 *
 * Sul computer è un pannello a schede da cui si installa, si cerca, si
 * aggiungono fonti, skill e server MCP. Qui si **guarda** e si fa quello che
 * ha senso da un telefono: cercare nel catalogo, installare, aggiornare,
 * accendere e spegnere, approvare un MCP del progetto. Aggiungere o togliere
 * una skill o un MCP e cambiarne le chiavi restano al computer, dove si vedono
 * i percorsi e le chiavi non viaggiano.
 *
 * 2.53.0: ogni voce ha lo stato scritto dal computer (le stesse parole del
 * pannello e della pagina) e sotto cosa vuol dire; un'azione mostra da quanti
 * secondi lavora, e se non riesce dice perché accanto alla voce, con
 * «Riprova». Un comando che un marketplace vuole eseguire si legge e si
 * conferma prima.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Negozio(api: Api) {
    var dati by remember { mutableStateOf<DatiNegozio?>(null) }
    var guasto by remember { mutableStateOf<String?>(null) }
    var famiglia by remember { mutableStateOf(Famiglia.PLUGIN) }
    var parola by remember { mutableStateOf("") }
    var cercata by remember { mutableStateOf("") }
    var trovati by remember { mutableStateOf<RicercaNegozio?>(null) }
    var cercando by remember { mutableStateOf(false) }
    var provoMcp by remember { mutableStateOf(false) }
    var erroreMcp by remember { mutableStateOf<String?>(null) }
    /** Cosa è riuscito e cosa cambia: verde, si toglie da sola. */
    var fatto by remember { mutableStateOf<String?>(null) }
    /** Quello che ha da dire il computer, che non è il risultato di un tocco. */
    var notaDelComputer by remember { mutableStateOf<String?>(null) }
    val lavoro = remember { mutableStateMapOf<String, Pair<String, Long>>() }
    val guasti = remember { mutableStateMapOf<String, Pair<String, () -> Unit>>() }
    val conferme = remember { mutableStateMapOf<String, Pair<String, () -> Unit>>() }
    var ora by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val scope = rememberCoroutineScope()
    val fuoco = LocalFocusManager.current

    suspend fun ricarica() {
        try {
            val letto = api.negozio()
            dati = letto
            // Il computer puo' rispondere benissimo e avere comunque qualcosa
            // da dire: il CLI dei plugin che non parte, o nessuna chat aperta.
            guasto = letto.errore?.let { "Il catalogo non risponde: $it" }
            notaDelComputer = letto.nota
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Si distingue un computer vecchio (404) da una risposta che non si
            // riesce a leggere: «aggiornalo» detto a torto ha fatto cercare nel
            // posto sbagliato per un mese (28/08).
            val e404 = (e as? Api.Errore)?.codice == 404
            guasto = if (e404) "Questo computer non sa ancora aprire il negozio da qui: aggiornalo."
            else "Il negozio non risponde come dovrebbe: ${e.message ?: "errore sconosciuto"}"
        }
    }

    suspend fun cerca(q: String) {
        cercata = q.trim()
        if (cercata.isEmpty()) { trovati = null; return }
        cercando = true
        trovati = try {
            api.cercaPlugin(cercata)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            RicercaNegozio(errore = FunzioniPc.spiega(e, FunzionePc.NEGOZIO))
        }
        cercando = false
    }

    fun provaMcp() {
        provoMcp = true
        erroreMcp = null
        scope.launch {
            try {
                val r = api.saluteMcp()
                val d = dati
                if (d != null && (r.mcp.isNotEmpty() || r.errore == null)) dati = d.copy(mcp = r.mcp)
                erroreMcp = r.errore
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                erroreMcp = FunzioniPc.spiega(e, FunzionePc.NEGOZIO)
            }
            provoMcp = false
        }
    }

    /**
     * Il giro di ogni azione: occupata coi secondi; poi cosa cambia, oppure
     * il motivo accanto alla voce con «Riprova»; oppure il comando del
     * marketplace da leggere e confermare.
     */
    fun esegui(chiave: String, testo: String, azione: suspend () -> EsitoNegozio, conConferma: (suspend (String) -> EsitoNegozio)? = null) {
        guasti.remove(chiave)
        conferme.remove(chiave)
        fatto = null
        lavoro[chiave] = testo to System.currentTimeMillis()
        scope.launch {
            val esito = try {
                azione()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Api.Errore) {
                EsitoNegozio(false, Nota.spiega(e, testo.trimEnd('…').lowercase()))
            } catch (e: Exception) {
                EsitoNegozio(false, e.message ?: "il computer non risponde")
            }
            lavoro.remove(chiave)
            val conferma = esito.conferma
            when {
                esito.ok -> {
                    fatto = "✓ ${esito.fatto ?: "Fatto."}"
                    ricarica()
                    if (cercata.isNotEmpty()) cerca(cercata)
                }
                conferma != null && conConferma != null -> conferme[chiave] = conferma.comando to {
                    esegui(chiave, testo, { conConferma(conferma.sha256) })
                }
                else -> guasti[chiave] = (esito.messaggio ?: "Non è riuscito, e il computer non ha detto perché.") to {
                    esegui(chiave, testo, azione, conConferma)
                }
            }
        }
    }

    LaunchedEffect(Unit) { ricarica() }
    // I secondi accanto a «Installo…»: il tempo passa solo mentre si lavora.
    LaunchedEffect(lavoro.isNotEmpty()) {
        while (lavoro.isNotEmpty()) { ora = System.currentTimeMillis(); delay(1000) }
    }
    LaunchedEffect(fatto) {
        if (fatto != null) { delay(9_000); fatto = null }
    }

    Column(Modifier.fillMaxSize()) {
        // ─── fascia ───
        Column {
            Row(
                Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Serigrafia("Negozio")
                    Spacer(Modifier.height(3.dp))
                    Text(
                        "Plugin, skill e server MCP di Claude Code sul computer: cosa c’è, se è acceso, e cosa vuol dire. " +
                            "Aggiungere o togliere skill e MCP si fa dal computer.",
                        color = Banco.testoQuieto,
                        fontSize = 12.sp
                    )
                }
            }
            HorizontalDivider(color = Banco.incisione)
        }

        // ─── le quattro famiglie ───
        FlowRow(
            Modifier.fillMaxWidth().background(Banco.fondo).padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            for (fam in Famiglia.entries) {
                val quanti = fam.quanti(dati)
                val daGuardare = when (fam) {
                    Famiglia.PLUGIN -> NegozioVista.daAggiornare(dati)
                    Famiglia.MCP -> NegozioVista.mcpDaGuardare(dati)
                    else -> 0
                }
                Voce(
                    testo = fam.etichetta + (if (quanti > 0) "  $quanti" else "") + (if (daGuardare > 0) "  ⚠$daGuardare" else ""),
                    attiva = fam == famiglia,
                    onClick = {
                        famiglia = fam
                        if (fam == Famiglia.MCP && !provoMcp) provaMcp()
                    }
                )
            }
        }
        HorizontalDivider(color = Banco.incisione)

        if (guasto != null && dati != null) Riga(guasto!!, Banco.rosso)
        notaDelComputer?.let { Riga(it, Banco.ambra) }
        fatto?.let { Riga(it, Banco.verde) }

        val d = dati
        when {
            guasto != null && d == null -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
                Text(guasto!!, color = Banco.testoQuieto, fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                Voce("Riprova", attiva = true) { guasto = null; scope.launch { ricarica() } }
            }
            d == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Banco.accento)
                    Spacer(Modifier.height(10.dp))
                    Text("Leggo dal computer… il catalogo ci mette qualche secondo.", color = Banco.testoQuieto, fontSize = 12.sp)
                }
            }
            else -> LazyColumn(Modifier.fillMaxSize()) {
                when (famiglia) {
                    Famiglia.PLUGIN -> {
                        item("cerca") {
                            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    OutlinedTextField(
                                        value = parola,
                                        onValueChange = { parola = it.take(100) },
                                        placeholder = { Text("cerca nel catalogo (es. documenti)", color = Banco.testoQuieto, fontSize = 13.sp) },
                                        singleLine = true,
                                        textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                        keyboardActions = KeyboardActions(onSearch = { fuoco.clearFocus(); scope.launch { cerca(parola) } }),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedBorderColor = Banco.accento,
                                            unfocusedBorderColor = Banco.incisione,
                                            focusedContainerColor = Banco.fondo,
                                            unfocusedContainerColor = Banco.fondo
                                        ),
                                        modifier = Modifier.weight(1f)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Voce("Cerca", attiva = false) { fuoco.clearFocus(); scope.launch { cerca(parola) } }
                                }
                                Spacer(Modifier.height(6.dp))
                                if (cercando) LinearProgressIndicator(color = Banco.accento, trackColor = Banco.incisione, modifier = Modifier.fillMaxWidth().height(3.dp))
                                Text(
                                    NegozioVista.riassunto(d, trovati, cercata),
                                    color = if (trovati?.errore != null) Banco.ambra else Banco.testoQuieto,
                                    fontSize = 12.sp
                                )
                            }
                        }
                        val elenco = NegozioVista.plugin(d, trovati)
                        if (elenco.isEmpty()) item("vuoto") { Vuoto("Nessun plugin.") }
                        items(elenco, key = { "p:${it.id}" }) { p ->
                            val chiave = "p:${p.id}"
                            Scheda(
                                titolo = p.nome,
                                stato = NegozioVista.stato(p),
                                sotto = listOfNotNull(p.marketplace.ifBlank { null }, p.versione?.let { "v $it" }, p.installazioni?.let { "↧ $it" }).joinToString(" · "),
                                descrizione = p.descrizione,
                                lavoro = lavoro[chiave], ora = ora, guasto = guasti[chiave], conferma = conferme[chiave],
                                onAnnullaConferma = { conferme.remove(chiave) }
                            ) {
                                if (!p.installato) {
                                    Voce("Installa", attiva = true) {
                                        esegui(chiave, "Installo…", { api.installaPlugin(p.id) }, { sha -> api.installaPlugin(p.id, sha) })
                                    }
                                } else {
                                    Voce("Aggiorna", attiva = p.aggiornamento) {
                                        esegui(chiave, "Aggiorno…", { api.aggiornaPlugin(p.id) }, { sha -> api.aggiornaPlugin(p.id, sha) })
                                    }
                                    Voce(if (p.abilitato) "Disattiva" else "Attiva", attiva = false) {
                                        esegui(chiave, if (p.abilitato) "Spengo…" else "Accendo…", { api.commutaNegozio("plugin", p.id, !p.abilitato) })
                                    }
                                }
                            }
                        }
                    }
                    Famiglia.SKILL -> {
                        if (d.skill.isEmpty()) item("vuoto") { Vuoto("Nessuna skill. Si aggiungono dal computer (Negozio → Skill → Nuova skill).") }
                        items(d.skill, key = { "s:${it.percorso}:${it.nome}" }) { s ->
                            val chiave = "s:${s.nome}"
                            Scheda(
                                titolo = s.nome,
                                stato = NegozioVista.stato(s),
                                sotto = NegozioVista.origine(s),
                                descrizione = s.descrizione,
                                lavoro = lavoro[chiave], ora = ora, guasto = guasti[chiave], conferma = null,
                                onAnnullaConferma = {}
                            ) {
                                if (s.origine != "plugin") {
                                    Voce(if (s.abilitata) "Disattiva" else "Attiva", attiva = false) {
                                        esegui(chiave, if (s.abilitata) "Spengo…" else "Accendo…", { api.commutaNegozio("skill", s.nome, !s.abilitata) })
                                    }
                                }
                            }
                        }
                    }
                    Famiglia.MCP -> {
                        item("prova") {
                            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Voce(if (provoMcp) "Provo i collegamenti…" else "Verifica i collegamenti", attiva = false) { if (!provoMcp) provaMcp() }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "Il computer prova ogni server davvero: ci vuole qualche secondo. " +
                                        (d.cartella?.let { "Cartella guardata: $it." } ?: ""),
                                    color = Banco.testoQuieto, fontSize = 12.sp
                                )
                                if (provoMcp) LinearProgressIndicator(color = Banco.accento, trackColor = Banco.incisione, modifier = Modifier.fillMaxWidth().padding(top = 6.dp).height(3.dp))
                                erroreMcp?.let { Text(it, color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
                            }
                        }
                        if (d.mcp.isEmpty()) item("vuoto") { Vuoto("Nessun MCP per la cartella della chat aperta sul computer. Si aggiungono dal computer.") }
                        items(d.mcp, key = { "m:${it.ambito}:${it.nome}" }) { m ->
                            val chiave = "m:${m.nome}"
                            val chiavi = if (m.tipo == "stdio") m.variabili else m.intestazioni
                            Scheda(
                                titolo = m.nome,
                                stato = NegozioVista.stato(m),
                                sotto = listOf(NegozioVista.dove(m), m.tipo).filter { it.isNotBlank() }.joinToString(" · "),
                                descrizione = m.come,
                                mono = true,
                                extra = if (chiavi.isEmpty()) null else "${if (m.tipo == "stdio") "variabili" else "intestazioni"}: ${chiavi.joinToString(", ")} (i valori restano sul computer)",
                                lavoro = lavoro[chiave], ora = ora, guasto = guasti[chiave], conferma = null,
                                onAnnullaConferma = {}
                            ) {
                                when {
                                    NegozioVista.soloLettura(m) -> Unit
                                    NegozioVista.daApprovare(m) -> {
                                        Voce("Approva", attiva = true) { esegui(chiave, "Approvo…", { api.commutaNegozio("mcp-approva", m.nome, true) }) }
                                        if (m.config == "da-approvare") Voce("Rifiuta", attiva = false) { esegui(chiave, "Rifiuto…", { api.commutaNegozio("mcp-approva", m.nome, false) }) }
                                    }
                                    else -> {
                                        val acceso = NegozioVista.mcpAcceso(m)
                                        Voce(if (acceso) "Disattiva" else "Attiva", attiva = false) {
                                            esegui(chiave, if (acceso) "Spengo…" else "Accendo…", { api.commutaNegozio("mcp", m.nome, !acceso) })
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Famiglia.AGENTI -> {
                        if (d.agenti.isEmpty()) item("vuoto") { Vuoto("Nessun agente.") }
                        items(d.agenti, key = { "a:${it.nome}:${it.origine}" }) { a ->
                            // Gli agenti non si accendono: Claude Code li chiama
                            // quando servono. Un interruttore finto sarebbe una bugia.
                            Scheda(
                                titolo = a.nome, stato = null,
                                sotto = if (a.origine == "utente") "personale" else "del progetto",
                                descrizione = a.descrizione,
                                lavoro = null, ora = ora, guasto = null, conferma = null, onAnnullaConferma = {}
                            ) {}
                        }
                    }
                }
                item("piede") {
                    Text(
                        "Le skill cambiano subito, anche nelle chat già aperte; plugin e MCP valgono per le chat che apri dopo la modifica.",
                        color = Banco.testoQuieto, fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
                    )
                }
            }
        }
    }
}

/** Le quattro cose che si possono avere: come si chiamano e quante sono. */
private enum class Famiglia(val etichetta: String) {
    PLUGIN("Plugin"),
    SKILL("Skill"),
    MCP("MCP"),
    AGENTI("Agenti");

    fun quanti(d: DatiNegozio?): Int = when (this) {
        PLUGIN -> d?.plugin?.count { it.installato } ?: 0
        SKILL -> d?.skill?.size ?: 0
        AGENTI -> d?.agenti?.size ?: 0
        MCP -> d?.mcp?.size ?: 0
    }
}

private fun coloreTono(tono: String): Color = when (tono) {
    "ok" -> Banco.verde
    "attesa" -> Banco.ambra
    "errore" -> Banco.rosso
    "spento" -> Banco.testoQuieto
    else -> Banco.testo
}

/** Una voce: nome con lo stato, cosa vuol dire, i tasti, e sotto il lavoro, il guasto o la conferma. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Scheda(
    titolo: String,
    stato: StatoVoce?,
    sotto: String,
    descrizione: String,
    lavoro: Pair<String, Long>?,
    ora: Long,
    guasto: Pair<String, () -> Unit>?,
    conferma: Pair<String, () -> Unit>?,
    onAnnullaConferma: () -> Unit,
    mono: Boolean = false,
    extra: String? = null,
    tasti: @Composable () -> Unit
) {
    Tessera(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp)) {
        Column(Modifier.padding(14.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(titolo, color = Banco.testo, fontWeight = FontWeight.Bold)
                if (stato != null) {
                    val c = coloreTono(stato.tono)
                    Surface(color = Color.Transparent, contentColor = c, shape = MaterialTheme.shapes.small, border = BorderStroke(1.dp, c)) {
                        Text(stato.etichetta, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp))
                    }
                }
            }
            if (sotto.isNotBlank()) Text(sotto, color = Banco.testoQuieto, fontSize = 11.sp)
            if (descrizione.isNotBlank()) {
                Spacer(Modifier.height(3.dp))
                Text(
                    descrizione, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 3,
                    fontFamily = if (mono) FontFamily.Monospace else null
                )
            }
            extra?.let { Text(it, color = Banco.testoQuieto, fontSize = 11.sp) }
            if (stato != null && stato.spiegazione.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(stato.spiegazione, color = Banco.testoQuieto, fontSize = 11.sp, lineHeight = 15.sp)
            }
            when {
                lavoro != null -> {
                    Spacer(Modifier.height(8.dp))
                    Text("${lavoro.first} ${NegozioVista.secondi(lavoro.second, ora)} s", color = Banco.testo, fontSize = 12.sp)
                    LinearProgressIndicator(color = Banco.accento, trackColor = Banco.incisione, modifier = Modifier.fillMaxWidth().padding(top = 4.dp).height(4.dp))
                }
                conferma != null -> {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Per installarlo, il marketplace chiede di eseguire questo comando sul computer, con i tuoi permessi. Confermalo solo se ti fidi di chi lo pubblica.",
                        color = Banco.ambra, fontSize = 12.sp
                    )
                    Text(conferma.first.ifBlank { "(il computer non ha il testo del comando)" }, color = Banco.testo, fontSize = 12.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(vertical = 6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Voce("Mi fido: esegui e installa", attiva = true, onClick = conferma.second)
                        Voce("Annulla", attiva = false, onClick = onAnnullaConferma)
                    }
                }
                else -> {
                    if (guasto != null) {
                        Spacer(Modifier.height(8.dp))
                        Text("⚠ ${guasto.first}", color = Banco.rosso, fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(8.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (guasto != null) Voce("Riprova", attiva = true, onClick = guasto.second)
                        tasti()
                    }
                }
            }
        }
    }
}

@Composable
private fun Riga(testo: String, colore: Color) {
    Text(testo, color = colore, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp))
}

@Composable
private fun Vuoto(testo: String) {
    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(testo, color = Banco.testoQuieto, fontSize = 13.sp)
    }
}
