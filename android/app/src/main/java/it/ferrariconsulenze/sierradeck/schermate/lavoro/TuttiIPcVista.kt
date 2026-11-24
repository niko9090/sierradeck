package it.ferrariconsulenze.sierradeck.schermate.lavoro

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import it.ferrariconsulenze.sierradeck.nucleo.Davanti
import it.ferrariconsulenze.sierradeck.nucleo.ElencoPc
import it.ferrariconsulenze.sierradeck.rete.Api
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import it.ferrariconsulenze.sierradeck.dati.Deposito
import it.ferrariconsulenze.sierradeck.nucleo.GruppoPc
import it.ferrariconsulenze.sierradeck.nucleo.StatoGruppoPc
import it.ferrariconsulenze.sierradeck.nucleo.TonoChat
import it.ferrariconsulenze.sierradeck.nucleo.TuttiIPc
import it.ferrariconsulenze.sierradeck.rete.PcNoto
import it.ferrariconsulenze.sierradeck.schermate.altro.LedChat
import it.ferrariconsulenze.sierradeck.schermate.comune.tocco
import it.ferrariconsulenze.sierradeck.schermate.radice.Parola
import it.ferrariconsulenze.sierradeck.schermate.tema.Banco

/**
 * **Tutti i PC insieme** (k-and5): ogni PC collegato col suo stato e le sue
 * chat sotto, senza sceglierlo. Ogni PC legge dal suo `Deposito` (la copia che
 * l'app tiene già); uno che non risponde resta in elenco con l'ultima copia.
 * Un tocco su una chat la apre ([onApriChat] riceve il PC e la chat).
 */
@Composable
fun TuttiIPcVista(elenco: List<PcNoto>, corrente: String?, ponte: ElencoPc?, onApriChat: (pc: String, chat: String) -> Unit) {
    val files = LocalContext.current.filesDir
    val copie = HashMap<String, Deposito.Copia>()
    for (p in elenco) key(p.id) { copie[p.id] = Deposito.di(p.id, p.chiave, files).stato.collectAsStateWithLifecycle().value }
    // I PC che il telefono non ha accoppiato ma il suo PC raggiunge dal ponte (anche con SierraDeck di prima).
    val altri = TuttiIPc.dalPonte(elenco, ponte)
    val api = elenco.firstOrNull { it.id == corrente }?.let { Api(it.id, it.chiave) }
    val lette = remember { mutableStateMapOf<String, Deposito.Copia>() }
    val daLeggere = TuttiIPc.daLeggere(altri, ponte).map { it.id }
    LaunchedEffect(api, daLeggere) {
        if (api == null) return@LaunchedEffect
        while (isActive) {
            coroutineScope {
                for (id in daLeggere) launch {
                    val s = withTimeoutOrNull(8_000) { try { api.suPc(id).stato() } catch (e: CancellationException) { throw e } catch (_: Exception) { null } }
                    val prima = lette[id]
                    lette[id] = if (s != null) Deposito.Copia(s, System.currentTimeMillis(), vecchia = false)
                        else Deposito.Copia(prima?.stato, prima?.quando ?: 0L, vecchia = true, motivo = "non risponde dal ponte")
                }
            }
            Davanti.pausa(5_000)
        }
    }
    for (p in altri) {
        copie[p.id] = lette[p.id]
            ?: if (p.id in daLeggere) Deposito.Copia(null, 0, vecchia = true) else Deposito.Copia(null, 0, vecchia = true, motivo = "spento")
    }
    val gruppi = TuttiIPc.tutti(elenco + altri, copie, corrente, Parola.Companion::oraBreve)
        .map { if (it.id in altri.map { a -> a.id }) it.copy(dalPonte = true) else it }
    CorpoTuttiIPc(gruppi, onApriChat)
}

/** Il PC accoppiato che risponde elenca gli altri PC della rete (`/api/pc`), ogni 15 secondi mentre l'app è davanti. */
@Composable
fun rememberPcDelPonte(elenco: List<PcNoto>, corrente: String?): ElencoPc? {
    var letto by remember { mutableStateOf<ElencoPc?>(null) }
    val api = elenco.firstOrNull { it.id == corrente }?.let { Api(it.id, it.chiave) }
    LaunchedEffect(api?.let { corrente }) {
        if (api == null) return@LaunchedEffect
        while (isActive) {
            try { letto = api.pc() } catch (e: CancellationException) { throw e } catch (_: Exception) { }
            Davanti.pausa(15_000)
        }
    }
    return letto
}

/** Il disegno, da gruppi già pronti (lo usano anche le foto). */
@Composable
fun CorpoTuttiIPc(gruppi: List<GruppoPc>, onApriChat: (pc: String, chat: String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 12.dp)) {
        for (g in gruppi) {
            item(key = "pc-" + g.id) { IntestazionePc(g) }
            if (g.chat.isEmpty()) item(key = "v-" + g.id) {
                Text(
                    if (g.stato == StatoGruppoPc.NON_RAGGIUNGIBILE) "Nessuna copia delle chat." else "Nessuna chat accesa.",
                    style = MaterialTheme.typography.bodySmall, color = Banco.testoQuieto,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                )
            }
            items(g.chat, key = { "c-" + g.id + "-" + it.id }) { c ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).tocco(enabled = !c.protetta && !g.dalPonte) { onApriChat(g.id, c.id) }.padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    LedChat(if (g.ultimaCopia) null else c.tono)
                    Spacer(Modifier.width(10.dp))
                    Text(c.titolo, style = MaterialTheme.typography.bodyMedium, color = Banco.testo, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(
                        if (c.protetta) "protetta" else c.parola.substringBefore(" ·"),
                        style = MaterialTheme.typography.labelMedium,
                        color = if (c.tono == TonoChat.SCEGLIE && !g.ultimaCopia) Banco.ambra else Banco.testoQuieto,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
private fun IntestazionePc(g: GruppoPc) {
    val colore = when (g.stato) {
        StatoGruppoPc.RAGGIUNGIBILE -> Banco.verde
        StatoGruppoPc.SI_AGGIORNA -> Banco.accento
        StatoGruppoPc.VECCHIO, StatoGruppoPc.NON_RAGGIUNGIBILE -> Banco.rosso
    }
    Row(
        Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(colore))
        Text(g.nome, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = Banco.testo, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        Text(g.frase, style = MaterialTheme.typography.labelMedium, color = colore, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (g.chiedono > 0) Text("${g.chiedono} per te", style = MaterialTheme.typography.labelMedium, color = Banco.ambra)
    }
}
