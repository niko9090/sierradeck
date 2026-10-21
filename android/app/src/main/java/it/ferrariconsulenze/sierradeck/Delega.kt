package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.LocalTextStyle
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.text.style.TextAlign

/**
 * Affida un lavoro nuovo (app 2.55.0), alla pari con la finestra «Nuovo
 * autopilota» del PC: su quale PC, in quale cartella (le chat aperte, i
 * progetti recenti o sfogliando), in quale workspace, l'obiettivo, il nome,
 * i criteri, la regola di pubblicazione, il cloud e la partenza. La
 * validazione è quella del PC (`AzioniTelefono.controlla`).
 *
 * Prima si sceglieva solo fra le cartelle già viste da Claude Code sul PC
 * accoppiato: «quando voglio lanciare un autopilota non mi chiede dove
 * lanciarlo» (Nicholas, 09/10).
 */
@Composable
internal fun Delega(api: Api, statoQui: Stato?, onChiudi: () -> Unit) {
    // Il PC: `null` = quello accoppiato; altrimenti uno degli altri, attraverso il ponte.
    var pcScelto by remember { mutableStateOf<PcPonte?>(SuPc.corrente) }
    var altriPc by remember { mutableStateOf<List<PcRemoto>>(emptyList()) }
    val apiDest = remember(pcScelto?.pcId, api) { pcScelto?.let { api.suPc(it.pcId) } ?: api }
    val nomeDest = pcScelto?.nome ?: PcCorrente.nome ?: "questo PC"
    var statoDest by remember(pcScelto?.pcId) { mutableStateOf(if (pcScelto == null) statoQui else null) }
    var cartelle by remember(pcScelto?.pcId) { mutableStateOf<List<String>?>(null) }
    var bozza by remember { mutableStateOf(BozzaAutopilota()) }
    var sfoglia by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    var mandando by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        altriPc = try { api.pc().let { e -> e.pc.filter { it.pcId != e.io && it.vivo } } } catch (_: Exception) { emptyList() }
    }
    LaunchedEffect(pcScelto?.pcId) {
        errore = null
        bozza = bozza.copy(cwd = "", workspace = "")
        if (pcScelto != null) statoDest = try { apiDest.stato() } catch (e: Api.Errore) { errore = spiegaGestione(e, "leggere lo stato di $nomeDest", nomeDest); null } catch (_: Exception) { null }
        cartelle = try { apiDest.cartelle().cartelle } catch (e: Api.Errore) { if (errore == null) errore = spiegaGestione(e, "leggere le cartelle di $nomeDest", nomeDest); emptyList() } catch (_: Exception) { emptyList() }
        val ws = statoDest?.workspace
        if (ws != null && bozza.workspace.isBlank()) bozza = bozza.copy(workspace = ws.attivo)
        // Come il PC: la prima destinazione è la chat che si sta guardando.
        val prima = statoDest?.chat?.firstOrNull()?.cwd ?: cartelle?.firstOrNull()
        if (prima != null && bozza.cwd.isBlank()) bozza = bozza.copy(cwd = prima)
    }
    val versioneDest = if (pcScelto == null) PcCorrente.versione else altriPc.firstOrNull { it.pcId == pcScelto?.pcId }?.versione
    val vecchio = FunzioniPc.disponibile(FunzionePc.GESTIONE, versioneDest) == false
    val controllo = AzioniTelefono.controlla(bozza)

    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Affida un lavoro") },
        text = {
            Column(Modifier.fillMaxWidth().height(560.dp).verticalScroll(rememberScrollState())) {
                // ─── su quale PC ───
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text("Su quale computer lavora", color = Banco.testoQuieto, fontSize = 12.sp); Aiuto("L’autopilota vive sul computer che scegli: lì legge i file, apre le sue chat e lascia il quaderno. Gli altri PC accesi della stessa cassaforte si raggiungono attraverso quello a cui il telefono è accoppiato.", di = "Su quale computer lavora") }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    androidx.compose.material3.FilterChip(selected = pcScelto == null, onClick = { pcScelto = null }, label = { Text(PcCorrente.nome ?: "questo PC", fontSize = 12.sp) })
                    for (p in altriPc) {
                        androidx.compose.material3.FilterChip(selected = pcScelto?.pcId == p.pcId, onClick = { pcScelto = PcPonte(p.pcId, p.mostra) }, label = { Text(p.mostra, fontSize = 12.sp, color = VIOLA_ALTRO_PC) })
                    }
                }
                if (vecchio) Text("$nomeDest ha la ${versioneDest ?: "versione di prima"}: riceve solo obiettivo, cartella (fra quelle già viste da Claude Code), regola e cloud; nome, criteri, workspace e partenza arrivano aggiornandolo alla 0.55.0.", color = Banco.ambra, fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))

                // ─── l'obiettivo ───
                OutlinedTextField(
                    value = bozza.obiettivo,
                    onValueChange = { bozza = bozza.copy(obiettivo = it) },
                    label = { Text("Cosa vuoi ottenere") },
                    placeholder = { Text("L’obiettivo, i vincoli (cosa non toccare), come si capisce che ha finito, dove guardare.", fontSize = 12.sp) },
                    modifier = Modifier.fillMaxWidth().height(170.dp)
                )
                Text("Tutto quello che scrivi arriva a lui parola per parola, come mandato: non viene riassunto né tagliato.", color = Banco.testoQuieto, fontSize = 11.sp)
                Spacer(Modifier.height(10.dp))

                // ─── la cartella ───
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text("In quale cartella lavora", color = Banco.testoQuieto, fontSize = 12.sp); Aiuto("La cartella del progetto: è lì che legge i file, lancia i comandi e lascia il quaderno. Non la radice di un disco né la cartella dell’utente.", di = "In quale cartella lavora") }
                if (bozza.cwd.isNotBlank()) Text(bozza.cwd, color = Banco.accento, fontSize = 12.sp, maxLines = 2)
                val aperte = (statoDest?.chat ?: emptyList()).map { it.cwd }.filter { it.isNotBlank() }.distinct()
                val recenti = (cartelle ?: emptyList()).filter { it !in aperte }
                if (cartelle == null) Text("Carico le cartelle di $nomeDest…", color = Banco.testoQuieto, fontSize = 12.sp)
                if (aperte.isNotEmpty()) {
                    Text("Chat aperte adesso", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    for (c in aperte) RigaCartella(c, c == bozza.cwd) { bozza = bozza.copy(cwd = c) }
                }
                if (recenti.isNotEmpty()) {
                    Text("Progetti recenti", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    for (c in recenti.take(30)) RigaCartella(c, c == bozza.cwd) { bozza = bozza.copy(cwd = c) }
                }
                TextButton(onClick = { sfoglia = true }) { Text("Altra cartella: sfoglia $nomeDest…") }
                Spacer(Modifier.height(10.dp))

                // ─── il workspace ───
                val nomiWs = statoDest?.workspace?.nomi ?: emptyList()
                if (nomiWs.isNotEmpty()) {
                    SceltaWorkspaceRiga(nomiWs, bozza.workspace) { bozza = bozza.copy(workspace = it) }
                    Text("Le chat che apre nascono in questo workspace, anche se sul computer stai guardando altro.", color = Banco.testoQuieto, fontSize = 11.sp)
                    Spacer(Modifier.height(10.dp))
                }

                // ─── nome ───
                OutlinedTextField(
                    value = bozza.nome, onValueChange = { bozza = bozza.copy(nome = it.take(AzioniTelefono.NOME_AUTOPILOTA_MAX)) },
                    label = { Text("Nome (facoltativo)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Se vuoto: le prime parole dell’obiettivo", fontSize = 12.sp) }
                )
                Spacer(Modifier.height(10.dp))

                // ─── pubblicazione, cloud, partenza ───
                Row(verticalAlignment = Alignment.CenterVertically) { Text("Pubblicazione del progetto", color = Banco.testoQuieto, fontSize = 12.sp); Aiuto(AzioniTelefono.REGOLE.joinToString("\n\n") { "${it.etichetta}: ${it.spiega}" }, di = "Pubblicazione del progetto") }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (r in AzioniTelefono.REGOLE) androidx.compose.material3.FilterChip(selected = bozza.pubblicazione == r.valore, onClick = { bozza = bozza.copy(pubblicazione = r.valore) }, label = { Text(r.etichetta, fontSize = 12.sp) })
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = bozza.cloud, onCheckedChange = { bozza = bozza.copy(cloud = it) })
                    Spacer(Modifier.width(8.dp))
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text("va sul cloud: le chat stanno sul Drive", color = Banco.testo, fontSize = 13.sp); Aiuto("Il «cloud» è il Drive di SierraDeck, dove si salvano le chat. Se le chat di questo progetto stanno sul Drive (questa spunta, oppure la sincronizzazione Drive del progetto già accesa) lavora in autonomia completa, senza farti domande: commit, unione dei suoi rami, push e pubblicazione secondo la regola qui sopra. Il remoto git e gli script di pubblicazione del progetto servono solo a sapere dove mandare su e con quale comando pubblicare. Senza Drive fa commit sui suoi rami e li unisce, e basta: niente push, niente pubblicazione.", di = "va sul cloud: le chat stanno sul Drive") }
                }
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) { Text("Partenza", color = Banco.testoQuieto, fontSize = 12.sp); Aiuto(AzioniTelefono.PARTENZE.joinToString("\n\n") { "${it.etichetta}: ${it.spiega}" }, di = "Partenza") }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (p in AzioniTelefono.PARTENZE) androidx.compose.material3.FilterChip(selected = bozza.partenza == p.valore, onClick = { bozza = bozza.copy(partenza = p.valore) }, label = { Text(p.etichetta, fontSize = 12.sp) })
                }
                Spacer(Modifier.height(10.dp))

                // ─── criteri ───
                OutlinedTextField(
                    value = bozza.criteri, onValueChange = { bozza = bozza.copy(criteri = it) },
                    label = { Text("Come si capisce che ha finito (facoltativo, uno per riga)") },
                    modifier = Modifier.fillMaxWidth().height(110.dp)
                )
                RigaConAiuto("Se li lasci vuoti li ricava lui.", "Sono i criteri di fine: li verifica lui, uno per uno, prima di dichiararsi finito. Se li lasci vuoti se li ricava da solo, guardando il progetto.")
                Spacer(Modifier.height(8.dp))
                RigaConAiuto("Quante chat apre lo decide lui.", "Quante chat apre lo decide lui, dentro il freno sui limiti del piano. Non tocca mai chat e autopiloti non suoi, «Porta qui», l’account, le preferenze né file fuori dalle sue cartelle.")
                (errore ?: (controllo as? EsitoBozza.No)?.takeIf { bozza.obiettivo.isNotBlank() }?.errore)?.let {
                    Spacer(Modifier.height(6.dp)); Text(it, color = Banco.rosso, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = controllo is EsitoBozza.Ok && !mandando,
                onClick = {
                    val r = (controllo as? EsitoBozza.Ok)?.richiesta ?: return@TextButton
                    mandando = true
                    scope.launch {
                        try {
                            apiDest.creaAutopilota(r)
                            Nota.mostra("Affidato a $nomeDest: legge il progetto e, se ha domande, arrivano in cima ad Adesso." + if (r.partenza == "subito") " Appena è pronto comincia da solo." else " Poi aspetta il tuo «Vai».")
                            onChiudi()
                        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Api.Errore) {
                            errore = spiegaGestione(e, "affidarlo a $nomeDest", nomeDest)
                        } catch (e: Exception) {
                            errore = "Non sono riuscito ad affidarlo: ${e.message ?: "il computer non risponde"}"
                        }
                        mandando = false
                    }
                }
            ) { Text(if (mandando) "Affido…" else "Prepara") }
        },
        dismissButton = { TextButton(onClick = onChiudi) { Text("Annulla") } }
    )
    if (sfoglia) SceltaCartella(
        apiDest,
        onApri = { percorso, _ -> bozza = bozza.copy(cwd = percorso) },
        onChiudi = { sfoglia = false },
        etichetta = "Scegli questa",
        titolo = "La cartella del lavoro su $nomeDest"
    )
}

@Composable
private fun RigaCartella(c: String, scelta: Boolean, onClick: () -> Unit) {
    // Il nome, e sotto il percorso: due progetti con lo stesso nome in dischi
    // diversi erano indistinguibili.
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 5.dp)) {
        Text(c.substringAfterLast('\\').substringAfterLast('/'), color = if (scelta) Banco.accento else Banco.testo, fontWeight = if (scelta) FontWeight.Bold else FontWeight.Normal, fontSize = 13.sp)
        Text(c, color = Banco.testoQuieto, fontSize = 10.sp, maxLines = 1)
    }
}

/** Il quaderno di una cartella: le schede lasciate dalle chat e dagli autopiloti. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun Quaderno(api: Api, cwd: String, onChiudi: () -> Unit) {
    var schede by remember { mutableStateOf<List<SchedaBreve>?>(null) }
    var aperta by remember { mutableStateOf<SchedaPiena?>(null) }
    // PC 0.70: la ricerca e il tag scelto, come sul PC.
    var domanda by remember { mutableStateOf("") }
    var tagScelto by remember { mutableStateOf<String?>(null) }
    // «Nessuna scheda» e «non riesco a leggerle» sono due cose diverse: prima
    // un 403 (cartella non conosciuta) si leggeva come un quaderno vuoto.
    var guasto by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(cwd) {
        schede = try { api.quaderno(cwd).schede } catch (e: Exception) {
            guasto = if (e is Api.Errore) Nota.spiega(e, "leggere il quaderno") else "Non sono riuscito a leggere il quaderno: ${e.message ?: "il computer non risponde"}"
            emptyList()
        }
    }

    AlertDialog(
        onDismissRequest = { if (aperta != null) aperta = null else onChiudi() },
        title = { Text(aperta?.titolo?.ifBlank { "Quaderno" } ?: "Quaderno") },
        text = {
            Column(Modifier.fillMaxWidth().height(380.dp).verticalScroll(rememberScrollState())) {
                val ap = aperta
                if (ap != null) {
                    Text(QuadernoVista.quandoBreve(ap.quando, java.time.Instant.now()), color = Banco.testoQuieto, fontSize = 11.sp)
                    Text(ap.corpo, color = Banco.testo, fontSize = 13.sp)
                } else when {
                    guasto != null -> Text(guasto!!, color = Banco.ambra, fontSize = 13.sp)
                    schede == null -> Text("Carico…", color = Banco.testoQuieto)
                    schede!!.isEmpty() -> Text("Nessuna scheda in questa cartella: il quaderno (.sierradeck/quaderno) si riempie quando le chat annotano decisioni, vincoli ed errori risolti.", color = Banco.testoQuieto)
                    else -> {
                        val tutte = schede!!
                        OutlinedTextField(value = domanda, onValueChange = { domanda = it }, singleLine = true,
                            placeholder = { Text("Cerca fra le schede", fontSize = 13.sp) }, modifier = Modifier.fillMaxWidth())
                        val tags = QuadernoVista.tuttiITag(tutte)
                        if (tags.isNotEmpty()) {
                            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                androidx.compose.material3.FilterChip(selected = tagScelto == null, onClick = { tagScelto = null }, label = { Text("Tutte ${tutte.size}") })
                                for ((t, n) in tags) {
                                    androidx.compose.material3.FilterChip(selected = tagScelto == t, onClick = { tagScelto = if (tagScelto == t) null else t }, label = { Text("$t $n") })
                                }
                            }
                        }
                        val ora = java.time.Instant.now()
                        val viste = QuadernoVista.filtra(tutte, domanda, tagScelto)
                        if (viste.isEmpty()) Text("Nessuna scheda per questa ricerca.", color = Banco.testoQuieto, fontSize = 13.sp)
                        for (s in viste) {
                            Column(Modifier.fillMaxWidth().clickable {
                                scope.launch { aperta = tenta("aprire la scheda del quaderno") { api.scheda(cwd, s.file) } }
                            }.padding(vertical = 8.dp)) {
                                Text(s.titolo.ifBlank { s.file }, color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                if (s.assaggio.isNotBlank()) Text(s.assaggio, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
                                Text((listOf(QuadernoVista.quandoBreve(s.quando, ora)) + s.tag).joinToString(" · "), color = Banco.testoQuieto, fontSize = 11.sp)
                            }
                            HorizontalDivider(color = Banco.incisione)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = { if (aperta != null) aperta = null else onChiudi() }) {
                Text(if (aperta != null) "Indietro" else "Chiudi")
            }
        }
    )
}
