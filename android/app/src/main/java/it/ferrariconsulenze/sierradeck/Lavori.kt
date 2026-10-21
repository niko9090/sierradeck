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

/** Il colore che riassume lo stato di un autopilota (un punto, non una teoria). */
fun coloreStato(stato: String): Color = when (stato) {
    "lavoro" -> Banco.verde
    "pronto", "attesa" -> Banco.ambra
    "sospeso", "fallito" -> Banco.rosso
    "finito" -> Banco.testoQuieto
    else -> Banco.testoQuieto
}

/**
 * Il colore del LED **come lo ha deciso il computer** (`led` in `/api/stato`,
 * dalla stessa funzione della console). L'app se lo ricalcolava da `stato` e
 * sbagliava dove conta: «finito» era blu acceso mentre PC e pagina lo
 * spengono. Con un computer vecchio (`led` vuoto) si ripiega sullo stato.
 */
fun coloreLed(led: String, stato: String): Color = when (led) {
    "led--lavoro" -> Banco.verde
    "led--attesa" -> Banco.ambra
    "led--fermo" -> Banco.rosso
    "led--finito" -> Banco.testoQuieto
    else -> coloreStato(stato)
}

/** «N di M chat» (PC 0.82.0) in cima agli autopiloti, con il perché dietro «?». Ambra quando il computer è pieno. */
@Composable
fun RigaPostiChat(p: PostiChat?) {
    if (p == null || p.riga.isBlank()) return
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(p.riga, color = if (p.pieno) Banco.ambra else Banco.testoQuieto, fontSize = 12.sp)
        Aiuto(p.spiega, di = "Chat al lavoro insieme")
    }
}

/**
 * «Lavori»: gli autopiloti, con dentro tutto quello che il pannello del computer
 * mostra — dove sono nel percorso, i criteri che si sono dati, cosa hanno deciso.
 */
@Composable
fun Lavori(
    apiAccoppiato: Api,
    statoAccoppiato: Stato?,
    apri: String? = null,
    onAperto: () -> Unit = {},
    /** Le prime righe della pagina (2.83.0): in Adesso, le domande per te. */
    testa: androidx.compose.foundation.lazy.LazyListScope.() -> Unit = {}
) {
    // Gli autopiloti del PC che stai guardando (app 2.55.0): con «Chat di X
    // dal vivo» quelli di X, attraverso il ponte, con la fascia viola in cima.
    val su = SuPc.corrente
    val api = remember(su?.pcId, apiAccoppiato) { su?.let { apiAccoppiato.suPc(it.pcId) } ?: apiAccoppiato }
    var statoSu by remember(su?.pcId) { mutableStateOf<Stato?>(null) }
    LaunchedEffect(su?.pcId) {
        if (su == null) return@LaunchedEffect
        while (isActive) {
            statoSu = try { api.stato() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { statoSu }
            Davanti.pausa(3000)
        }
    }
    val stato = if (su != null) statoSu else statoAccoppiato
    var aperto by remember { mutableStateOf<String?>(null) }
    // Gli autopiloti degli altri PC (PC 0.59.0): dal PC accoppiato, una volta al minuto
    // (0.83.0; prima ogni 15 s: su Adesso, la schermata d'apertura, 4 chiamate al minuto in più).
    var altri by remember { mutableStateOf<List<AutopilotiDiPc>?>(null) }
    var apertoAltro by remember { mutableStateOf<Pair<String, String>?>(null) }
    LaunchedEffect(su?.pcId) {
        if (su != null) return@LaunchedEffect
        while (isActive) {
            altri = try { apiAccoppiato.autopilotiAltri() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { altri ?: emptyList() }
            Davanti.pausa(60_000)
        }
    }
    // Dalla scheda Domande: «apri la sua linguetta Domande» (0.38.0).
    LaunchedEffect(apri) { if (apri != null) { aperto = apri; onAperto() } }
    var delega by remember { mutableStateOf(false) }
    val lista = stato?.autopiloti ?: emptyList()

    LaunchedEffect(lista, aperto) {
        if (aperto != null && lista.none { it.id == aperto }) aperto = null
    }

    val breve = lista.firstOrNull { it.id == aperto }
    val altro = apertoAltro?.let { (pc, id) -> altri?.firstOrNull { it.pcId == pc }?.let { p -> p.autopiloti.firstOrNull { it.id == id }?.let { p to it } } }
    if (altro != null) {
        // La scheda di sempre, con le chiamate al PC dove gira (attraverso il ponte).
        BackHandler { apertoAltro = null }
        val apiAltro = remember(altro.first.pcId) { apiAccoppiato.suPc(altro.first.pcId) }
        Column(Modifier.fillMaxSize()) {
            Text(
                "${AutopilotiAltri.giraSu(altro.first.nome)}: lavora là, con i file di là. Quello che fai qui lo esegue ${altro.first.nome}.",
                color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
            )
            DettaglioAutopilota(apiAltro, altro.second, onIndietro = { apertoAltro = null })
        }
    } else if (breve != null) {
        BackHandler { aperto = null }
        DettaglioAutopilota(api, breve, onIndietro = { aperto = null }, chatDiSessione = { s -> stato?.chat?.firstOrNull { it.sessione == s }?.id })
    } else {
        // Gli autopiloti di un altro PC: «indietro» torna a quelli di questo (2.83.0).
        BackHandler(enabled = su != null) { SuPc.corrente = null }
        // Una pagina sola che scorre (2.83.0): in cima `testa` (in Adesso le
        // domande per te), poi la fascia con «+ Affida», poi gli autopiloti.
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 12.dp)) {
            testa()
            if (su != null) item(key = "su-pc") { Column { FasciaSuPc(su, null) { SuPc.corrente = null }; BandaPcIndietro(apiAccoppiato, su.pcId, su.nome, statoSu?.computer?.versione) } }
            item(key = "fascia-lavori") { Column { FasciaLavori(lista) { delega = true }; RigaPostiChat(stato?.postiChat) } }
            if (lista.isEmpty() && AutopilotiAltri.righe(altri ?: emptyList()).isNotEmpty()) {
                item(key = "nessuno-qui") { Text("Nessun autopilota su questo PC.", color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(12.dp)) }
            } else if (lista.isEmpty()) {
                item(key = "nessuno") {
                    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Nessun autopilota.", color = Banco.testo, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Un autopilota è un lavoro che porti a termine da solo: gli dici l’obiettivo e la cartella, e lui apre le chat che servono.",
                            color = Banco.testoQuieto,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { delega = true }) { Text("Affida un lavoro") }
                    }
                }
            } else {
                // Prima quelli che aspettano te, poi quelli che lavorano, poi il
                // resto: da un telefono si guarda per sapere se serve qualcosa,
                // e la risposta non deve stare in fondo a una lista.
                items(lista.sortedBy { urgenzaAp(it) }, key = { it.id }) { ap ->
                    VoceAutopilota(ap) { aperto = ap.id }
                }
            }
            altriPc(altri) { pc, id -> apertoAltro = pc to id }
        }
        if (delega) Delega(apiAccoppiato, statoAccoppiato, onChiudi = { delega = false })
    }
}

/** «Su altri PC» (PC 0.59.0): gli autopiloti degli altri PC, con «gira su <PC>», e chi non risponde con il perché. */
internal fun androidx.compose.foundation.lazy.LazyListScope.altriPc(altri: List<AutopilotiDiPc>?, onApri: (String, String) -> Unit) {
    if (altri == null || altri.isEmpty()) return
    item {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text("SU ALTRI PC", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold); Aiuto("Gli autopiloti che girano sugli altri PC della tua stessa chiave di casa: lavorano là, con i file di là. Da qui li guardi e li governi; ogni azione va al PC dove girano.", di = "SU ALTRI PC") }
            // Una riga sola per chi non risponde (2.73.0, come PC e pagina): il perché dietro il «?».
            for (g in AutopilotiAltri.guasti(altri)) Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                Text("● ${g.nome} · non risponde", color = Banco.ambra, fontSize = 12.sp)
                Aiuto(g.errore ?: "", di = "${g.nome} non risponde")
            }
        }
    }
    items(AutopilotiAltri.righe(altri), key = { "${it.first.pcId}-${it.second.id}" }) { (p, ap) ->
        Column {
            VoceAutopilota(ap) { onApri(p.pcId, ap.id) }
            Text(AutopilotiAltri.giraSu(p.nome), color = Banco.testoQuieto, fontSize = 11.sp, modifier = Modifier.padding(start = 40.dp, bottom = 4.dp))
        }
    }
}

@Composable
internal fun Punto(colore: Color) {
    Box(Modifier.size(10.dp).clip(CircleShape).background(colore))
}

/**
 * Quanto conta adesso, dal più al meno.
 *
 * Non è un giudizio sull’autopilota: è l’ordine in cui vuoi vederli quando
 * prendi in mano il telefono. Prima chi si è fermato — perché senza di te non
 * riparte — poi chi aspetta una risposta, poi chi sta lavorando.
 */
/**
 * L'ordine dell'elenco (2.73.0): dalla vista del PC quando c'è, come sul PC —
 * un autopilota «al lavoro» con una domanda aperta è «aspetta te» e sta in alto.
 */
fun urgenzaAp(a: AutopilotaBreve): Int = a.vista?.stato?.id?.let { id ->
    when (id) { "guasto" -> 0; "aspetta", "senza-segni" -> 1; "pronto" -> 2; "al-lavoro", "prepara" -> 3; "finito" -> 5; else -> 4 }
} ?: urgenzaDi(a.stato)

fun urgenzaDi(stato: String): Int = when (stato) {
    "sospeso", "fallito" -> 0
    "attesa" -> 1
    "pronto" -> 2
    "lavoro" -> 3
    "finito" -> 5
    else -> 4
}

/** Lo stato in una parola, quella che diresti tu. */
fun statoInParole(stato: String): String = when (stato) {
    "lavoro" -> "al lavoro"
    "intervista" -> "si prepara"
    "attesa" -> "aspetta te"
    "pronto" -> "pronto"
    "sospeso" -> "fermo"
    "fallito" -> "guasto"
    "finito" -> "finito"
    else -> stato
}

/** La fascia dell’elenco: quanti sono, e il gesto per aggiungerne uno. */
@Composable
private fun FasciaLavori(lista: List<AutopilotaBreve>, onDelega: () -> Unit) {
    val chiedono = lista.any { it.stato in setOf("sospeso", "fallito", "pronto", "attesa") }
    Column {
        Row(
            Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Serigrafia("Lavori")
                Spacer(Modifier.height(3.dp))
                // Tutti gli stati, non solo i fermi: «1 in attesa di te» contava
                // i sospesi e taceva su chi aspettava il via o una risposta.
                Text(
                    riassuntoLavori(lista),
                    color = if (chiedono) Banco.ambra else Banco.testoQuieto,
                    fontSize = 12.sp
                )
            }
            Surface(
                onClick = onDelega,
                color = Banco.fondo,
                contentColor = Banco.testo,
                shape = MaterialTheme.shapes.small,
                border = BorderStroke(1.dp, Banco.incisione)
            ) {
                Text(
                    "+ Affida",
                    color = Banco.accento,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                )
            }
        }
        HorizontalDivider(color = Banco.incisione)
    }
}

/**
 * Un autopilota nell’elenco.
 *
 * Prima era un nome, una riga di stato e «3/7» in fondo: tre informazioni
 * senza gerarchia, e quel rapporto non diceva niente a colpo d’occhio. Ora lo
 * stato è una parola tua («aspetta te», «si è arreso»), i criteri sono una
 * barra — che è come si legge un avanzamento — e il colore del filetto a
 * sinistra si riconosce prima di leggere.
 */
@Composable
private fun VoceAutopilota(ap: AutopilotaBreve, onApri: () -> Unit) {
    val colore = coloreLed(ap.led, ap.stato)
    Tessera(
        onClick = onApri,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp)
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(3.dp).fillMaxHeight().background(colore))
            Column(Modifier.weight(1f).padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        ap.nome,
                        color = Banco.testo,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        modifier = Modifier.weight(1f)
                    )
                    // PC 0.70: la parola e il colore decisi dal PC.
                    if (ap.vista != null) Text(ap.vista.stato.parola, color = coloreVista(ap.vista.stato.colore), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    else Text(statoInParole(ap.stato), color = colore, fontSize = 12.sp)
                }
                ap.vista?.let { v ->
                    Spacer(Modifier.height(4.dp))
                    Text(sottoAutopilota(v), color = Banco.testoQuieto, fontSize = 12.sp)
                    if (v.ultima.isNotBlank()) Text(v.ultima, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
                }
                // «Bloccato, provo un'altra strada»: il PC e la pagina lo dicono,
                // l'app lo taceva.
                val sotto = if (ap.vista != null) "" else if (ap.strategia.isNotBlank()) "bloccato, provo: ${ap.strategia}" else ap.motivo
                if (sotto.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(sotto, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 2)
                }
                // Si vede sempre chi lavora (PC 0.69.0); dalla 0.70 lo dice già la vista.
                if (ap.vista == null) ap.dalVivo?.let { DalVivo(it) }
                if (ap.criteri > 0) {
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LinearProgressIndicator(
                            progress = { ap.fatti.toFloat() / ap.criteri.toFloat() },
                            color = colore,
                            trackColor = Banco.incisione,
                            modifier = Modifier.weight(1f).height(5.dp)
                        )
                        // Con la vista (PC 0.70) «criteri n/m» è già nella riga sopra: niente doppione (2.73.0).
                        if (ap.vista == null) {
                            Spacer(Modifier.width(10.dp))
                            Text(
                                "${ap.fatti} criteri su ${ap.criteri} · ${interventiInParole(ap.cicli)}",
                                color = Banco.testoQuieto,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
/**
 * Tutti gli autopiloti in una riga: «1 fermo · 1 aspetta il via · 2 al
 * lavoro · 3 finiti». Prima i casi che aspettano te, e solo quelli che ci sono.
 * Pura: si prova senza Compose.
 */
fun riassuntoLavori(lista: List<AutopilotaBreve>): String {
    if (lista.isEmpty()) return "nessun lavoro affidato"
    // 2.73.0: lo stato della vista del PC quando c'è (una domanda aperta è «aspetta», non «lavoro»).
    fun statoDi(a: AutopilotaBreve): String = when (a.vista?.stato?.id) {
        "guasto" -> "fallito"; "aspetta", "senza-segni" -> "attesa"; "pronto" -> "pronto"; "prepara" -> "intervista"
        "al-lavoro" -> "lavoro"; "finito" -> "finito"; "fermo" -> "sospeso"; else -> a.stato
    }
    fun conta(vararg stati: String) = lista.count { statoDi(it) in stati }
    val pezzi = mutableListOf<String>()
    conta("sospeso", "fallito").takeIf { it > 0 }?.let { pezzi += if (it == 1) "1 fermo" else "$it fermi" }
    conta("attesa").takeIf { it > 0 }?.let { pezzi += if (it == 1) "1 aspetta una risposta" else "$it aspettano una risposta" }
    conta("pronto").takeIf { it > 0 }?.let { pezzi += if (it == 1) "1 aspetta il via" else "$it aspettano il via" }
    conta("intervista").takeIf { it > 0 }?.let { pezzi += "$it si prepara" + (if (it == 1) "" else "no") }
    conta("lavoro").takeIf { it > 0 }?.let { pezzi += "$it al lavoro" }
    conta("finito").takeIf { it > 0 }?.let { pezzi += if (it == 1) "1 finito" else "$it finiti" }
    return pezzi.joinToString(" · ")
}

/** «al lavoro · da 12 min», l'ultima azione, «nessun segno da 10 min» (PC 0.69.0): le parole del PC. */
@Composable
fun DalVivo(v: StatoDalVivo, senzaStato: Boolean = false) {
    val colore = coloreVista(tonoDalVivo(v.etichetta))
    Spacer(Modifier.height(4.dp))
    if (senzaStato) {
        val riga = RegolePanoramica.rigaDalVivoSenzaStato(v)
        if (riga.isNotBlank()) Text(riga, color = if (v.senzaSegni != null) Banco.ambra else Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(v.etichetta, color = colore, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        if (v.da.isNotBlank()) Text(" · da ${v.da}", color = Banco.testoQuieto, fontSize = 12.sp)
        v.senzaSegni?.let { Text(" · ⚠ $it", color = Banco.ambra, fontSize = 12.sp) }
    }
    if (v.ultimaAzione.isNotBlank()) Text(v.ultimaAzione, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
}

/** Il riquadro «Adesso» (PC 0.81.0): una riga per chat, le ferme in cima e in rosso. */
@Composable
fun AdessoVista(a: Adesso) {
    if (a.righe.isEmpty() && a.finite == 0) return
    Spacer(Modifier.height(6.dp))
    Column(Modifier.fillMaxWidth().border(1.dp, Banco.incisione, RoundedCornerShape(6.dp)).padding(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Adesso", color = Banco.testo, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Aiuto(a.aiuto, di = "Adesso")
        }
        a.righe.forEach { r ->
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(r.chi) }
                    if (r.compito.isNotBlank()) withStyle(SpanStyle(color = Banco.testoQuieto)) { append(" · ${r.compito}") }
                    append(" — ")
                    withStyle(SpanStyle(color = coloreVista(coloreAdesso(r.tono)))) { append(r.testo) }
                },
                color = Banco.testo,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 3.dp)
            )
        }
        righeFinite(a.finite)?.let { Text(it, color = Banco.testoQuieto, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp)) }
    }
}

/**
 * I messaggi verso la chat (2.72.1): spunte ✓ su una riga, e una riga sola
 * per chi è fermo, con «Manda adesso» (vedi `MessaggiCompattiVista`).
 */
@Composable
fun MessaggiVersoLaChat(messaggi: List<StatoMessaggio>, onManda: () -> Unit) = MessaggiCompattiVista(messaggi, onManda)
