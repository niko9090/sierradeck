package it.ferrariconsulenze.sierradeck.schermate.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.ferrariconsulenze.sierradeck.nucleo.Chat
import it.ferrariconsulenze.sierradeck.nucleo.Davanti
import it.ferrariconsulenze.sierradeck.nucleo.RigheChat
import it.ferrariconsulenze.sierradeck.nucleo.SceltaLavoro
import it.ferrariconsulenze.sierradeck.nucleo.Scelte
import it.ferrariconsulenze.sierradeck.nucleo.Storia
import it.ferrariconsulenze.sierradeck.nucleo.senzaMezziCaratteri
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.schermate.comune.CasellaScrivi
import it.ferrariconsulenze.sierradeck.schermate.comune.InviiInCoda
import it.ferrariconsulenze.sierradeck.schermate.comune.TastoAzioniChat
import it.ferrariconsulenze.sierradeck.schermate.comune.TastoScelta
import it.ferrariconsulenze.sierradeck.schermate.comune.mettiInCoda
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco
import it.ferrariconsulenze.sierradeck.schermate.tema.FontTerminale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** La lettura delle righe nuove: fuori dalla schermata, così le foto la danno finta. */
fun interface FonteStoria {
    /** Le righe dopo `dopo` (-1 = le ultime); null se il PC non risponde. */
    suspend fun dopo(dopo: Int): Storia?
}

/** Dal PC vero: `/api/storia` con `dopo`, decodificato fuori dal filo principale. */
fun fonteStoria(api: Api, chat: String): FonteStoria = FonteStoria { dopo ->
    try {
        val testo = api.grezzo("/api/storia", buildJsonObject { put("chat", chat); put("dopo", dopo) }.toString())
        withContext(Dispatchers.Default) { Api.json.decodeFromString(Storia.serializer(), testo) }
    } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
}

/**
 * **Una chat** (app 11/11): le righe del terminale per numero di riga, solo
 * quelle nuove a ogni giro; testo copiabile; le scelte del terminale come
 * tasti; la casella col microfono che passa dalla coda degli invii; «⋯» con
 * Rinomina e Chiudi.
 */
@Composable
fun SchermataDettaglioChat(
    pc: String,
    chat: Chat?,
    id: String,
    fonte: FonteStoria,
    api: Api?,
    onIndietro: () -> Unit,
    iniziali: RigheChat = RigheChat(),
    scelteIniziali: Scelte? = null
) {
    var righe by remember(id) { mutableStateOf(iniziali) }
    var scelte by remember(id) { mutableStateOf(scelteIniziali) }
    var giu by remember(id) { mutableStateOf(false) }
    var nota by remember(id) { mutableStateOf<String?>(null) }
    LaunchedEffect(id) {
        var vuoti = 0
        while (true) {
            Davanti.flusso.filter { it }.first()
            val s = fonte.dopo(righe.dopo())
            if (s == null) giu = true
            else {
                giu = false
                val prima = righe
                righe = withContext(Dispatchers.Default) { prima.unisci(s) }
                scelte = s.scelte?.takeIf { it.opzioni.isNotEmpty() }
                vuoti = if (righe == prima) vuoti + 1 else 0
            }
            // Più piano quando non cambia niente: fino a 5 s.
            delay(if (vuoti < 3) 1_500 else 5_000)
        }
    }
    val titolo = chat?.nome ?: chat?.titolo?.ifBlank { null } ?: "Chat"
    val elenco = rememberLazyListState()
    LaunchedEffect(righe.ultima) {
        if (righe.righe.isNotEmpty()) {
            val inFondo = elenco.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= elenco.layoutInfo.totalItemsCount - 3 } ?: true
            if (inFondo) elenco.scrollToItem(elenco.layoutInfo.totalItemsCount.coerceAtLeast(1) - 1)
        }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().background(Banco.chassis), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onIndietro) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Indietro") }
            Column(Modifier.weight(1f)) {
                Text(titolo, style = MaterialTheme.typography.titleMedium, color = Banco.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val sotto = when {
                    giu -> "Il computer non risponde: riprovo da solo."
                    chat?.chiede == true -> "Aspetta te"
                    chat?.governata == true -> "La guida l’autopilota"
                    else -> nota
                }
                sotto?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = if (giu || chat?.chiede == true) Banco.ambra else Banco.testoQuieto) }
            }
            TastoAzioniChat(api, id, titolo, onEsito = { nota = it }, onChiusa = onIndietro)
        }
        if (chat?.pin == "chiusa") {
            Text("Questa chat è protetta: aprila dal PC.", color = Banco.testoQuieto, modifier = Modifier.padding(16.dp))
            return@Column
        }
        androidx.compose.foundation.layout.Box(Modifier.weight(1f)) { SelectionContainer {
            LazyColumn(Modifier.fillMaxSize(), state = elenco, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)) {
                if (righe.righe.isEmpty()) item { Text(if (giu) "Non riesco a leggere la chat." else "Leggo la chat…", color = Banco.testoQuieto) }
                items(righe.righe, key = { it.first }) { (_, t) ->
                    Text(t.ifEmpty { " " }, fontFamily = FontTerminale, fontSize = 13.sp, lineHeight = 17.sp, color = Banco.testo)
                }
                item(key = "coda") { InviiInCoda("chat:$id") }
            }
        } }
        scelte?.let { s ->
            Column(Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (o in s.opzioni.filter { !it.libera }) TastoScelta(SceltaLavoro(o.numero.toString(), o.testo, consigliata = false), largo = true) {
                    // Sparisce subito: un secondo tocco finirebbe nella domanda dopo.
                    scelte = null
                    val corpo = buildJsonObject { put("chat", id); put("opzione", senzaMezziCaratteri(o.testo)) }.toString()
                    mettiInCoda(pc, "/api/scegli", corpo, "scelta:$id", o.testo)
                }
            }
        }
        CasellaScrivi(
            casella = "chat:$id", segnaposto = "Scrivi alla chat…",
            onManda = { t -> mettiInCoda(pc, "/api/scrivi", buildJsonObject { put("chat", id); put("testo", t) }.toString(), "chat:$id", t) },
            modifier = Modifier.imePadding()
        )
    }
}
