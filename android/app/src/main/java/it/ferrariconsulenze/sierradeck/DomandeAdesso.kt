package it.ferrariconsulenze.sierradeck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Le domande per te, lette dal computer (`/api/domande`) ogni 2 secondi
 * finché Adesso è davanti. Prima era la scheda «Domande»; dalla 2.83.0 sta in
 * cima ad Adesso, e ogni domanda si risponde lì con un tocco.
 */
class DomandeLette {
    var voci by mutableStateOf<List<VoceDomanda>?>(null)
    var conversazioni by mutableStateOf<List<Conversazione>>(emptyList())
    var guasto by mutableStateOf<String?>(null)
    /** Le risposte già mandate, finché il computer non toglie la domanda: un tasto che resta invita a premerlo due volte. */
    val mandate = mutableStateMapOf<String, String>()
    var giro by mutableIntStateOf(0)
    /** Con «Tutte» anche le chat che hanno solo finito il turno. */
    var tutte by mutableStateOf(false)
}

/**
 * Legge le domande finché la testa di Adesso è composta: con un autopilota o
 * una conversazione aperti la lista non c'è, e le letture si fermano (prima
 * `/api/domande` andava ogni 2 secondi anche dentro un autopilota).
 */
@Composable
internal fun PolsoDomande(api: Api, d: DomandeLette) {
    LaunchedEffect(api, d.giro) {
        while (isActive) {
            try {
                val r = api.domande()
                d.voci = r.voci; d.conversazioni = r.conversazioni; d.guasto = null
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                d.guasto = FunzioniPc.spiega(e, FunzionePc.DOMANDE)
            }
            Davanti.pausa(2000)
        }
    }
    // Le voci sparite si dimenticano: se la stessa chat chiede di nuovo è una domanda nuova.
    LaunchedEffect(d.voci, d.conversazioni) {
        val vive = DomandeAdesso.chiaviVive(d.voci, d.conversazioni)
        d.mandate.keys.filter { it !in vive }.forEach { d.mandate.remove(it) }
    }
}

/** Le regole di Adesso, pure: si provano senza Compose (`DomandeAdessoTest`). */
object DomandeAdesso {
    /** La chiave di una domanda: la conversazione e la domanda di adesso (una nuova riaccende i tasti). */
    fun chiave(c: Conversazione): String = c.chiave + "|" + (c.scheda?.domanda ?: c.messaggi.lastOrNull()?.testo ?: "")

    fun chiaviVive(voci: List<VoceDomanda>?, conversazioni: List<Conversazione>): Set<String> =
        conversazioni.map { chiave(it) }.toSet() + (voci ?: emptyList()).map { it.chiave() }

    /** Quelle da mostrare in cima: chi aspetta te; con «Tutte», tutte. */
    fun inCima(tutte: List<Conversazione>, ancheFinite: Boolean): List<Conversazione> =
        if (ancheFinite) tutte else tutte.filter { aspettaTe(it) }

    /** Cosa fa il tocco su una scelta: scegliere nell'elenco della chat, rispondere con quel testo, o scrivere. */
    sealed interface Tocco {
        data class Scegli(val chat: String, val testo: String) : Tocco
        data class Rispondi(val via: ViaRisposta, val testo: String) : Tocco
        data object Scrivi : Tocco
    }

    fun tocco(c: Conversazione, scelta: SceltaScheda): Tocco {
        if (scelta.libera) return Tocco.Scrivi
        val scelte = c.scelte
        return if (scelte != null) Tocco.Scegli(scelte.chat, scelta.testo) else Tocco.Rispondi(c.risposta, scelta.testo)
    }
}

/**
 * In cima ad Adesso: le domande per te, ognuna con le scelte come tasti (un
 * tocco risponde) e il campo per scrivere. «Apri» porta alla conversazione
 * intera; con un PC più vecchio della 0.36 le schede di prima.
 */
fun LazyListScope.domandeInCima(api: Api, d: DomandeLette, onApri: (Conversazione) -> Unit) {
    item(key = "domande-polso") { PolsoDomande(api, d) }
    val conv = d.conversazioni
    val elenco = d.voci
    d.guasto?.let { g -> item(key = "domande-guasto") { Text(g, color = Banco.ambra, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) } }
    if (conv.isNotEmpty()) {
        val n = contaAspettanoTe(conv)
        val mostrate = DomandeAdesso.inCima(conv, d.tutte)
        item(key = "domande-testa") {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (n > 0) "ASPETTANO TE · $n" else "NIENTE CHE ASPETTI TE",
                    color = if (n > 0) Banco.ambra else Banco.testoQuieto, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp, modifier = Modifier.weight(1f)
                )
                if (mostrate.size < conv.size || d.tutte) TextButton(onClick = { d.tutte = !d.tutte }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(if (d.tutte) "Solo chi aspetta" else "Tutte ${conv.size}", fontSize = 13.sp)
                }
            }
        }
        items(mostrate, key = { "conv-" + it.chiave }) { c ->
            SchedaConversazione(
                api, c, d.mandate[DomandeAdesso.chiave(c)],
                onMandata = { d.mandate[DomandeAdesso.chiave(c)] = it; d.giro += 1 },
                onApri = { onApri(c) }
            )
        }
        return
    }
    if (elenco == null) {
        item(key = "domande-leggo") { Text("Leggo le domande…", color = Banco.testoQuieto, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) }
        return
    }
    if (elenco.isEmpty()) {
        item(key = "domande-niente") {
            RigaConAiuto(
                "Nessuna domanda per te.",
                "Qui in cima compaiono, senza bloccare niente, le domande degli autopiloti e le scelte che una chat aspetta (un permesso, «vuoi procedere?»). Ognuna si risponde da qui con un tocco; sparisce da sola quando il computer riceve la risposta.",
                di = "Domande", modifier = Modifier.padding(horizontal = 12.dp)
            )
        }
        return
    }
    // Un PC prima della 0.36: le schede di allora.
    items(elenco, key = { "voce-" + it.chiave() }) { v ->
        Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
            val gia = d.mandate[v.chiave()]
            when (v.tipo) {
                "autopilota" -> SchedaAutopilota(api, v, gia) { d.mandate[v.chiave()] = it }
                "chat" -> SchedaChatFerma(api, v, gia) { d.mandate[v.chiave()] = it }
                else -> SchedaScelta(api, v, gia) { d.mandate[v.chiave()] = it }
            }
        }
    }
}

/** Una domanda in Adesso: chi chiede, la domanda in una frase, le scelte come tasti. */
@Composable
private fun SchedaConversazione(api: Api, c: Conversazione, gia: String?, onMandata: (String) -> Unit, onApri: () -> Unit) {
    var inCorso by remember(c.chiave) { mutableStateOf(false) }
    var nota by remember(c.chiave) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun manda(ricordo: String, azione: suspend () -> Unit) {
        inCorso = true; nota = null
        scope.launch {
            try {
                azione(); onMandata(ricordo)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                nota = SceltaVista.rifiuto(e, "mandarlo")
            }
            inCorso = false
        }
    }
    Tessera(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(c.vista?.let { coloreVista(it.colore) } ?: if (c.chiede) Banco.ambra else Banco.testoQuieto))
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(titoloConSegno(c), color = if (c.suPc != null) ColoreRemoto else Banco.testo, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
                    Text((c.vista?.let { "${it.parola} · " } ?: "") + c.sotto, color = Banco.testoQuieto, fontSize = 12.sp, maxLines = 2)
                }
                TextButton(onClick = onApri, modifier = Modifier.heightIn(min = 48.dp)) { Text("Apri") }
            }
            val scheda = c.scheda
            when {
                gia != null -> Text("Mandata: «${gia.take(80)}». Sparisce appena il computer la riceve.", color = Banco.verde, fontSize = 13.sp)
                scheda != null -> SchedaDomandaVista(
                    scheda, inCorso, if (c.risposta.via == "rispondi") "Rispondi" else "Manda",
                    onScelta = { o ->
                        when (val t = DomandeAdesso.tocco(c, o)) {
                            is DomandeAdesso.Tocco.Scrivi -> nota = SceltaVista.SCRIVI
                            is DomandeAdesso.Tocco.Scegli -> manda(t.testo) { api.scegli(t.chat, t.testo) }
                            is DomandeAdesso.Tocco.Rispondi -> manda(t.testo) { api.rispondiConversazione(t.via, t.testo) }
                        }
                    },
                    onScrivi = { t -> manda(t) { api.rispondiConversazione(c.risposta, t) } }
                )
                else -> {
                    c.messaggi.lastOrNull { it.da != "tu" }?.let { Text(it.testo, color = Banco.testo, fontSize = 14.sp, maxLines = 6, modifier = Modifier.padding(vertical = 6.dp)) }
                    CampoRisposta(c.segnaposto, if (c.risposta.via == "rispondi") "Rispondi" else "Manda", null, { api.rispondiConversazione(c.risposta, it) }, onMandata)
                }
            }
            nota?.let { Text(it, color = Banco.ambra, fontSize = 13.sp) }
        }
    }
}
