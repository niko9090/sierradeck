package it.ferrariconsulenze.sierradeck

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.isActive
import kotlinx.serialization.Serializable

/**
 * La pagina di un workspace (app 2.90.0, PC 0.95.1). Nicholas, 05/11: «le
 * pagine sono organizzate male… roba chiara e che sia utile». Prima la pagina
 * dell'autopilota aveva una riga «Dettagli ▾» che apriva tutto insieme
 * (avanzamento, domande una seconda volta, file, panoramica), gli specialisti
 * erano righe di testo e le chat del workspace stavano in un'altra voce della
 * barra, senza legame.
 *
 * Adesso quattro linguette, sempre le stesse: **Conversazione** (con lui, le
 * sue domande dentro), **Lavoro** (le richieste in coda e gli specialisti, che
 * si toccano e si guardano lavorare), **File** (cosa ha cambiato), **Chat**
 * (le chat di questo workspace).
 */
enum class LinguettaWorkspace(val nome: String) {
    CONVERSAZIONE("Conversazione"),
    LAVORO("Lavoro"),
    FILE("File"),
    CHAT("Chat")
}

/** 0.90.0 del PC: una riga della conversazione di uno specialista. */
@Serializable
data class RigaSpecialista(val tipo: String = "testo", val testo: String = "", val quando: String? = null, val errore: Boolean = false)

/** La conversazione di uno specialista (le ultime righe); `trovata = false` finché la CLI non l'ha scritta. */
@Serializable
data class TrascrizioneSpecialista(val id: String = "", val trovata: Boolean = false, val righe: List<RigaSpecialista> = emptyList())

/** Le regole della pagina, senza Compose (così si provano). */
object RegoleWorkspace {
    /** Il numero accanto al nome della linguetta, se dice qualcosa. */
    fun conto(l: LinguettaWorkspace, specialisti: Int, richiesteAperte: Int, chat: Int): Int? = when (l) {
        LinguettaWorkspace.LAVORO -> (specialisti + richiesteAperte).takeIf { it > 0 }
        LinguettaWorkspace.CHAT -> chat.takeIf { it > 0 }
        else -> null
    }

    /** Uno specialista è al lavoro adesso? (gli stati del PC: lavoro, avviato). */
    fun alLavoro(s: SpecialistaOrchestratore): Boolean = s.stato == "lavoro" || s.stato == "avviato"

    /** Prima quelli al lavoro, poi gli altri, nell'ordine in cui arrivano. */
    fun ordinaSpecialisti(l: List<SpecialistaOrchestratore>): List<SpecialistaOrchestratore> = l.sortedBy { if (alLavoro(it)) 0 else 1 }

    /** Chi è, in una parola: il ruolo, se no «specialista». */
    fun chi(s: SpecialistaOrchestratore): String = s.ruolo?.takeIf { it.isNotBlank() }?.replaceFirstChar { it.uppercase() } ?: "Specialista"

    /** «al lavoro · 4 min», «finito»: lo stato in parole e da quanto. */
    fun statoSpecialista(s: SpecialistaOrchestratore): String {
        val parola = when (s.stato) {
            "lavoro", "avviato" -> "al lavoro"
            "finito", "fatto", "unito" -> "finito"
            "fallito", "errore" -> "non riuscito"
            else -> s.stato.ifBlank { "in attesa" }
        }
        return listOfNotNull(parola, s.durata?.takeIf { it.isNotBlank() }).joinToString(" · ")
    }
}

/** Le linguette della pagina: pastiglie della stessa larghezza, la scelta in evidenza. */
@Composable
internal fun LinguetteWorkspace(scelta: LinguettaWorkspace, conti: (LinguettaWorkspace) -> Int?, onScegli: (LinguettaWorkspace) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
            .background(Banco.chassis, RoundedCornerShape(50)).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        for (l in LinguettaWorkspace.entries) {
            val su = l == scelta
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(50))
                    .background(if (su) Banco.accentoTenue else androidx.compose.ui.graphics.Color.Transparent)
                    .tocco { onScegli(l) },
                contentAlignment = Alignment.Center
            ) {
                val n = conti(l)
                Text(
                    l.nome + (n?.let { " $it" } ?: ""),
                    color = if (su) Banco.testo else Banco.testoQuieto,
                    fontSize = 13.sp, maxLines = 1,
                    fontWeight = if (su) FontWeight.SemiBold else FontWeight.Normal
                )
            }
        }
    }
}

/**
 * La linguetta «Lavoro»: la percentuale, le richieste in coda con la loro, e gli
 * specialisti come schede da toccare per guardarli lavorare. In fondo il
 * quaderno e lo storico del progetto.
 */
@Composable
internal fun LinguettaLavoro(
    av: AvanzamentoAutopilota?,
    nota: String?,
    onSpecialista: (SpecialistaOrchestratore) -> Unit,
    onQuaderno: () -> Unit,
    onStorico: (() -> Unit)?,
    altro: @Composable () -> Unit = {}
) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        nota?.let { n -> item(key = "nota") { Text(n, color = Banco.ambra, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp)) } }
        val p = av?.percento
        item(key = "percento") {
            Tessera(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Column(Modifier.padding(14.dp)) {
                    Serigrafia("Avanzamento")
                    Spacer(Modifier.height(6.dp))
                    if (av == null && nota == null) Text("Leggo l’avanzamento…", color = Banco.testoQuieto, fontSize = 13.sp)
                    else if (p == null) Text("Ancora nessuna percentuale: arriva quando ha un piano.", color = Banco.testoQuieto, fontSize = 13.sp)
                    else Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(RegoleAvanzamento.percento(p), color = Banco.testo, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.width(12.dp))
                        Box(Modifier.weight(1f)) { BarraPercentoWorkspace(p) }
                    }
                    val o = av?.orchestratore
                    val sotto = listOfNotNull(
                        o?.piano?.takeIf { it.totale > 0 }?.let { "${it.uniti} di ${it.totale} compiti uniti" },
                        if (o?.pensa == true) "sta pensando" else null
                    )
                    if (sotto.isNotEmpty()) Text(sotto.joinToString(" · "), color = Banco.testoQuieto, fontSize = 12.sp)
                    av?.calo?.let { c -> Text("scesa da ${RegoleAvanzamento.percento(c.da)} a ${RegoleAvanzamento.percento(c.a)}: ${c.perche}", color = Banco.ambra, fontSize = 12.sp) }
                }
            }
        }
        val specialisti = RegoleWorkspace.ordinaSpecialisti(av?.orchestratore?.specialisti ?: emptyList())
        item(key = "spec-testa") { Etichetta("Specialisti · ${specialisti.size}") }
        if (specialisti.isEmpty()) item(key = "spec-vuoto") {
            Text("Nessuno specialista adesso: li apre l’autopilota quando serve.", color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(bottom = 8.dp))
        }
        items(specialisti, key = { "s-" + it.id }) { s -> SchedaSpecialista(s) { onSpecialista(s) } }
        val richieste = RegoleAvanzamento.ordinate(av?.coda?.richieste ?: emptyList())
        item(key = "rich-testa") { Spacer(Modifier.height(8.dp)); Etichetta("Richieste · ${richieste.size}") }
        if (richieste.isEmpty()) item(key = "rich-vuoto") {
            Text("Nessuna richiesta in coda: scrivigli cosa vuoi nella Conversazione.", color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(bottom = 8.dp))
        }
        items(richieste, key = { "r-" + it.id }) { r ->
            Tessera(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    Text(r.titolo.ifBlank { r.testo }, color = if (r.stato == "fatta") Banco.testoQuieto else Banco.testo, fontSize = 14.sp, maxLines = 3)
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(RegoleAvanzamento.rigaRichiesta(r), color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    }
                    if (r.stato != "fatta") { Spacer(Modifier.height(6.dp)); BarraPercentoWorkspace(r.percento) }
                }
            }
        }
        item(key = "altro") { altro() }
        item(key = "quaderno") {
            Row(Modifier.padding(vertical = 8.dp)) {
                androidx.compose.material3.TextButton(onClick = onQuaderno, modifier = Modifier.heightIn(min = 48.dp)) { Text("Quaderno del progetto") }
                onStorico?.let { androidx.compose.material3.TextButton(onClick = it, modifier = Modifier.heightIn(min = 48.dp)) { Text("Storico") } }
            }
        }
    }
}

/** La barra di una percentuale (0-100), arrotondata. */
@Composable
internal fun BarraPercentoWorkspace(p: Double) {
    val f = (p / 100.0).coerceIn(0.0, 1.0).toFloat()
    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(Banco.incisione)) {
        Box(Modifier.fillMaxWidth(f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(ColoreStato.verde))
    }
}

/** Uno specialista: chi è, cosa fa, da quanto; il pallino verde se lavora. Un tocco lo apre. */
@Composable
private fun SchedaSpecialista(s: SpecialistaOrchestratore, onApri: () -> Unit) {
    val lavora = RegoleWorkspace.alLavoro(s)
    Tessera(onClick = onApri, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(if (lavora) ColoreStato.verde else Banco.testoQuieto))
                Spacer(Modifier.width(8.dp))
                Text(RegoleWorkspace.chi(s), color = Banco.testo, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
                Text(RegoleWorkspace.statoSpecialista(s), color = if (lavora) ColoreStato.verde else Banco.testoQuieto, fontSize = 12.sp)
            }
            if (s.compito.isNotBlank()) { Spacer(Modifier.height(4.dp)); Text(s.compito, color = Banco.testo, fontSize = 13.sp, maxLines = 3) }
            s.attivita?.takeIf { it.isNotBlank() }?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1) }
            Text(if (s.adottata) "Apri la chat ▸" else "Guarda cosa fa ▸", color = Banco.accento, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

/**
 * La conversazione di uno specialista, dal vivo (riletta ogni tre secondi): il
 * compito che ha ricevuto, cosa scrive, i comandi che usa e cosa gli
 * rispondono. Si guarda e basta: lo governa l'autopilota.
 */
@Composable
internal fun ChatSpecialista(api: Api, workspace: String, s: SpecialistaOrchestratore, onIndietro: () -> Unit) {
    BackHandler { onIndietro() }
    var t by remember(s.id) { mutableStateOf<TrascrizioneSpecialista?>(null) }
    var nota by remember(s.id) { mutableStateOf<String?>(null) }
    LaunchedEffect(s.id, workspace) {
        while (isActive) {
            try { t = api.specialista(workspace, s.id); nota = null } catch (e: Api.Errore) {
                nota = if (FunzioniPc.mancaSulPc(e)) "Questo computer non manda ancora le chat degli specialisti: aggiornalo alla 0.95.1." else "Non riesco a leggerla (HTTP ${e.codice}): riprovo da solo."
            } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) {
                nota = "Non riesco a leggerla: ${e.message ?: "il computer non risponde"}. Riprovo da solo."
            }
            Davanti.pausa(3000)
        }
    }
    val lista = rememberLazyListState()
    val righe = t?.righe ?: emptyList()
    LaunchedEffect(righe.size) { if (righe.isNotEmpty()) lista.animateScrollToItem(righe.size - 1) }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onIndietro, modifier = Modifier.size(48.dp)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro", tint = Banco.testo) }
            Column(Modifier.weight(1f)) {
                Text(RegoleWorkspace.chi(s), color = Banco.testo, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(RegoleWorkspace.statoSpecialista(s), color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 1)
            }
        }
        nota?.let { Text(it, color = Banco.ambra, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }
        LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp), state = lista) {
            if (t != null && righe.isEmpty()) item(key = "vuota") {
                Text(if (t?.trovata == false) "Non ha ancora scritto niente." else "Nessuna riga.", color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(vertical = 12.dp))
            }
            items(righe.size) { i -> RigaDiSpecialista(righe[i]) }
        }
        Text("Lo governa l’autopilota: qui lo guardi e basta.", color = Banco.testoQuieto, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
    }
}

@Composable
private fun RigaDiSpecialista(r: RigaSpecialista) {
    androidx.compose.foundation.text.selection.SelectionContainer {
        when (r.tipo) {
            "compito" -> Text(
                r.testo, color = Banco.testo, fontSize = 14.sp,
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
                    .background(Banco.accentoTenue, RoundedCornerShape(Banco.raggio))
                    .border(1.dp, Banco.accento.copy(alpha = 0.35f), RoundedCornerShape(Banco.raggio))
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            )
            "strumento" -> Text(r.testo, color = Banco.accento, fontSize = 12.sp, fontFamily = FontTerminale, modifier = Modifier.padding(top = 6.dp))
            "esito" -> Text(r.testo, color = if (r.errore) ColoreStato.rosso else Banco.testoQuieto, fontSize = 12.sp, fontFamily = FontTerminale, modifier = Modifier.padding(start = 10.dp, bottom = 2.dp))
            else -> Text(r.testo, color = Banco.testo, fontSize = 14.sp, lineHeight = 21.sp, modifier = Modifier.padding(vertical = 4.dp))
        }
    }
}

/** La linguetta «Chat»: le chat di questo workspace; un tocco le apre nella voce Chat. */
@Composable
internal fun LinguettaChatWorkspace(chat: List<Chat>) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        if (chat.isEmpty()) item(key = "vuoto") {
            Text("Nessuna chat aperta in questo workspace. Le apre l’autopilota quando serve, oppure le apri tu dalla voce Chat.", color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(vertical = 12.dp))
        }
        items(chat, key = { it.id }) { c ->
            val l = leggiChat(c)
            Tessera(onClick = { Apertura.apriChat(c.id) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text((c.nome ?: c.titolo).ifBlank { "Chat" }, color = Banco.testo, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
                        Text(l.parola, color = coloreTono(l.tono), fontSize = 12.sp, maxLines = 1)
                    }
                    c.ultimaRiga?.takeIf { it.isNotBlank() }?.let { Text(it, color = Banco.testoQuieto, fontSize = 12.sp, fontFamily = FontTerminale, maxLines = 1) }
                }
            }
        }
    }
}
