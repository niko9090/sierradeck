package it.ferrariconsulenze.sierradeck

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable

/**
 * Il collegamento verso un altro PC (PC 0.51.0, app 2.51.0): la copia in
 * Kotlin di `src/shared/collegamento.ts`, con gli stessi test.
 *
 * Nicholas (07/10): «Miglioriamo la connessione ai pc con anche la
 * visualizzazione grafica del cambio e anche la visualizzazione della
 * riconnessione». La macchina degli stati (collegato → ricollego con attese
 * 1, 2, 5, 10, 30 s, mai una resa → collegato), la qualità in tacche dal
 * ritardo e dalle perdite, la storia con l'ora e il motivo, il cambio di
 * strada «passo da X a Y», la coda di quello che scrivi a linea giù (un id
 * per messaggio: il PC non lo scrive mai due volte).
 */
object Linea {
    val ATTESE_MS = listOf(1000L, 2000L, 5000L, 10_000L, 30_000L)
    const val KEEPALIVE_OGNI_MS = 2000L
    const val KEEPALIVE_SCADE_MS = 6000L
    const val MISURE_TENUTE = 12
    const val STORIA_TENUTA = 30
    const val CAMBIO_VISIBILE_MS = 4000L
    val ORDINE_STRADE = listOf("lan", "tailscale", "webrtc", "drive")
    val NUOVA = StatoLinea()

    fun attesaPrima(tentativo: Int): Long = ATTESE_MS[(tentativo - 1).coerceIn(0, ATTESE_MS.size - 1)]

    fun qualita(misure: List<MisuraLinea>): QualitaLinea {
        val ultime = misure.takeLast(MISURE_TENUTE)
        if (ultime.isEmpty()) return QualitaLinea(0, null, 0.0, "non ancora misurata")
        val riuscite = ultime.filter { it.ok && it.ritardoMs != null }.map { it.ritardoMs!! }.sorted()
        val perdite = (ultime.size - ultime.count { it.ok }).toDouble() / ultime.size
        if (riuscite.isEmpty()) return QualitaLinea(0, null, perdite, "non arriva niente")
        val meta = riuscite.size / 2
        val ritardo = if (riuscite.size % 2 == 1) riuscite[meta] else Math.round((riuscite[meta - 1] + riuscite[meta]) / 2.0)
        var tacche = if (ritardo < 150) 4 else if (ritardo < 400) 3 else if (ritardo < 1000) 2 else 1
        if (perdite > 0) tacche -= 1
        if (perdite > 0.25) tacche -= 1
        tacche = tacche.coerceIn(1, 4)
        val parola = when (tacche) { 4 -> "ottima"; 3 -> "buona"; 2 -> "incerta"; else -> "debole" }
        return QualitaLinea(tacche, ritardo, perdite, parola)
    }

    fun passo(l: StatoLinea, e: EventoLinea): StatoLinea = when (e) {
        is EventoLinea.RiprovaAdesso -> if (l.fase == "ricollego") l.copy(prossimoIl = e.il) else l
        is EventoLinea.Ok -> {
            var storia = l.storia
            var cambio = l.cambio
            if (l.fase == "ricollego" && l.cadutaIl != null) storia = (storia + EventoStoria("tornato", e.il, strada = e.strada, dopoMs = e.il - l.cadutaIl, tentativi = l.tentativo))
            else if (l.fase == "cerco") storia = storia + EventoStoria("collegato", e.il, strada = e.strada)
            if (e.strada != null && l.strada != null && e.strada != l.strada) {
                storia = storia + EventoStoria("cambio", e.il, da = l.strada, a = e.strada)
                cambio = Triple(l.strada, e.strada, e.il)
            }
            l.copy(
                fase = "collegato", tentativo = 0, prossimoIl = null, cadutaIl = null, motivo = null, messaggio = null,
                strada = e.strada ?: l.strada, storia = storia.takeLast(STORIA_TENUTA), cambio = cambio,
                misure = (l.misure + MisuraLinea(true, maxOf(0L, e.ritardoMs), e.il)).takeLast(MISURE_TENUTE)
            )
        }
        is EventoLinea.Errore -> {
            val tentativo = if (l.fase == "ricollego") l.tentativo + 1 else 1
            val storia = if (l.fase == "ricollego") l.storia else (l.storia + EventoStoria("caduta", e.il, strada = l.strada, motivo = e.motivo, messaggio = e.messaggio)).takeLast(STORIA_TENUTA)
            l.copy(
                fase = "ricollego", tentativo = tentativo, storia = storia,
                cadutaIl = if (l.fase == "ricollego") (l.cadutaIl ?: e.il) else e.il,
                prossimoIl = e.il + attesaPrima(tentativo), motivo = e.motivo, messaggio = e.messaggio ?: l.messaggio,
                misure = (l.misure + MisuraLinea(false, null, e.il)).takeLast(MISURE_TENUTE)
            )
        }
    }

    fun eOra(l: StatoLinea, ultimaIl: Long, adesso: Long): Boolean =
        if (l.fase == "ricollego") adesso >= (l.prossimoIl ?: 0L) else adesso - ultimaIl >= KEEPALIVE_OGNI_MS

    fun fraSecondi(l: StatoLinea, adesso: Long): Long = l.prossimoIl?.let { maxOf(0L, (it - adesso + 999) / 1000) } ?: 0L

    /** La chat chiusa là, il PIN, «via Drive non si fa»: la linea è su, è la richiesta a non andare. */
    fun erroreDiStrada(motivo: String): Boolean = motivo !in setOf("chat", "pin", "lento")

    fun stradaBreve(s: String?): String = when (s) { "lan" -> "rete di casa"; "tailscale" -> "Tailscale"; "webrtc" -> "WebRTC"; "drive" -> "Drive, lento"; else -> "strada non ancora nota" }
    fun icona(s: String?): String = when (s) { "lan" -> "🏠"; "tailscale" -> "🔐"; "webrtc" -> "🌐"; "drive" -> "☁️"; else -> "…" }

    fun stradaMigliore(rispondono: Collection<String>): String? = ORDINE_STRADE.firstOrNull { it in rispondono }
    fun meglio(nuova: String, inUso: String?): Boolean = inUso == null || ORDINE_STRADE.indexOf(nuova) < ORDINE_STRADE.indexOf(inUso)

    fun cambioVisibile(l: StatoLinea, adesso: Long): String? {
        val c = l.cambio ?: return null
        if (adesso - c.third > CAMBIO_VISIBILE_MS) return null
        return "Passo da ${stradaBreve(c.first)} a ${stradaBreve(c.second)}"
    }

    private fun ora(il: Long): String {
        val c = java.util.Calendar.getInstance().apply { timeInMillis = il }
        return "%02d:%02d:%02d".format(c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE), c.get(java.util.Calendar.SECOND))
    }
    private fun durata(ms: Long): String { val s = Math.round(ms / 1000.0); return if (s < 90) "$s s" else "${Math.round(s / 60.0)} min" }

    fun rigaStoria(e: EventoStoria): String {
        val via = e.strada?.let { " (${stradaBreve(it)})" } ?: ""
        return when (e.tipo) {
            "collegato" -> "${ora(e.il)} · collegato$via"
            "caduta" -> "${ora(e.il)} · caduta$via: ${e.messaggio ?: e.motivo ?: ""}"
            "tornato" -> "${ora(e.il)} · tornato$via dopo ${durata(e.dopoMs ?: 0)} e ${e.tentativi} ${if (e.tentativi == 1) "tentativo" else "tentativi"}"
            else -> "${ora(e.il)} · passo da ${stradaBreve(e.da)} a ${stradaBreve(e.a)}"
        }
    }

    fun testoRiconnessione(l: StatoLinea, nomePc: String, adesso: Long): String? {
        if (l.fase != "ricollego") return null
        val fra = fraSecondi(l, adesso)
        val giu = l.cadutaIl?.let { " da ${durata(adesso - it)}" } ?: ""
        return "Collegamento con $nomePc caduto$giu · tentativo ${l.tentativo} · " + (if (fra > 0) "riprovo fra $fra s" else "riprovo adesso")
    }

    // ─── la coda dell'input ───
    fun accoda(c: List<VoceCodaLinea>, id: String, testo: String, il: Long): List<VoceCodaLinea> =
        if (c.any { it.id == id }) c else c + VoceCodaLinea(id, testo, il, "attesa")
    fun prossimoDaMandare(c: List<VoceCodaLinea>): VoceCodaLinea? = if (c.any { it.stato == "invio" }) null else c.firstOrNull { it.stato == "attesa" }
    fun inInvio(c: List<VoceCodaLinea>, id: String) = c.map { if (it.id == id) it.copy(stato = "invio") else it }
    fun consegnato(c: List<VoceCodaLinea>, id: String) = c.filter { it.id != id }
    fun nonPartito(c: List<VoceCodaLinea>, id: String) = c.map { if (it.id == id) it.copy(stato = "attesa") else it }
    fun nuovoId(): String = "m" + java.util.UUID.randomUUID().toString().replace("-", "").take(24)
}

data class MisuraLinea(val ok: Boolean, val ritardoMs: Long?, val il: Long)
data class QualitaLinea(val tacche: Int, val ritardoMs: Long?, val perdite: Double, val parola: String)
data class EventoStoria(
    val tipo: String, val il: Long, val strada: String? = null, val motivo: String? = null, val messaggio: String? = null,
    val dopoMs: Long? = null, val tentativi: Int = 0, val da: String? = null, val a: String? = null
)
data class StatoLinea(
    val fase: String = "cerco",
    val strada: String? = null,
    val tentativo: Int = 0,
    val prossimoIl: Long? = null,
    val cadutaIl: Long? = null,
    val motivo: String? = null,
    val messaggio: String? = null,
    val misure: List<MisuraLinea> = emptyList(),
    val storia: List<EventoStoria> = emptyList(),
    /** da, a, quando: per l'animazione «passo da X a Y». */
    val cambio: Triple<String, String, Long>? = null
)
sealed class EventoLinea {
    data class Ok(val il: Long, val ritardoMs: Long, val strada: String? = null) : EventoLinea()
    data class Errore(val il: Long, val motivo: String, val messaggio: String? = null) : EventoLinea()
    data class RiprovaAdesso(val il: Long) : EventoLinea()
}
data class VoceCodaLinea(val id: String, val testo: String, val il: Long, val stato: String)

/** La strada fra il PC accoppiato e l'altro PC, e il tempo del giro (PC 0.51.0, nelle risposte del ponte). */
@Serializable
data class InfoPonte(val strada: String? = null, val ritardoMs: Long? = null)

/* ─── la mappa dei PC (pannello Salute) ─── */

@Serializable
data class NodoMappa(val id: String = "", val nome: String = "", val x: Double = 50.0, val y: Double = 50.0, val io: Boolean = false, val stato: String = "incerto")
@Serializable
data class LineaMappa(val a: String = "", val strada: String? = null, val stato: String = "giu", val colore: String = "#f85149", val testo: String = "")
@Serializable
data class MappaPc(val nodi: List<NodoMappa> = emptyList(), val linee: List<LineaMappa> = emptyList())

fun coloreDa(hex: String): Color = try { Color(android.graphics.Color.parseColor(hex)) } catch (_: Exception) { Color.Gray }

/* ─── i pezzi a schermo ─── */

/** L'orologio della fascia: avanza ogni mezzo secondo mentre serve. */
@Composable
fun adessoVivo(attivo: Boolean): Long {
    var adesso by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(attivo) {
        while (attivo) { adesso = System.currentTimeMillis(); delay(500) }
    }
    return if (attivo) adesso else System.currentTimeMillis()
}

/** Icona della strada, tacche e ritardo, accanto a «SU <PC>». Toccando: la storia. */
@Composable
fun IndicatoreLinea(linea: StatoLinea, nomePc: String) {
    var storia by remember { mutableStateOf(false) }
    val q = Linea.qualita(linea.misure)
    val giu = linea.fase == "ricollego"
    val tacche = if (giu) 0 else q.tacche
    val colore = when { giu -> Banco.rosso; tacche >= 3 -> Banco.verde; tacche == 2 -> Banco.ambra; else -> Banco.rosso }
    Row(
        Modifier.background(Banco.fondo.copy(alpha = 0.6f)).clickable { storia = true }.padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        Text(Linea.icona(linea.strada), fontSize = 13.sp)
        Spacer(Modifier.width(4.dp))
        for (i in 0 until 4) {
            Box(Modifier.padding(horizontal = 1.dp).width(3.dp).height((4 + i * 3).dp).background(if (i < tacche) colore else Banco.incisione))
        }
        Spacer(Modifier.width(4.dp))
        Text(if (giu) "giù" else q.ritardoMs?.let { "$it ms" } ?: "…", color = if (giu) Banco.rosso else Banco.testoQuieto, fontSize = 11.sp)
    }
    if (storia) {
        AlertDialog(
            onDismissRequest = { storia = false },
            title = { Text("Collegamento con $nomePc") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(
                        "Adesso: " + (if (giu) "caduto, riprovo da solo" else "${Linea.stradaBreve(linea.strada)}, qualità ${q.parola}" + (q.ritardoMs?.let { ", $it ms di ritardo tipico" } ?: "") + (if (q.perdite > 0) ", ${Math.round(q.perdite * 100)}% di chiamate perse" else "")) + ".",
                        color = Banco.testo, fontSize = 13.sp
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Le cadute, i ritorni e i cambi di strada di questa schermata, con l'ora e il motivo (gli ultimi trenta). Le strade si provano in quest'ordine: rete di casa 🏠, Tailscale 🔐, collegamento diretto via Internet (WebRTC) 🌐, Drive ☁️ (lento). Quando ne torna una migliore il PC ci passa da solo, senza chiudere niente. Il ritardo è il giro completo: dal telefono al PC accoppiato, a $nomePc e ritorno. Le tacche: 4 = sotto 150 ms e niente perso; ne tolgono una le chiamate perse e il ritardo che sale (400 ms, 1 s).",
                        color = Banco.testoQuieto, fontSize = 12.sp
                    )
                    Spacer(Modifier.height(8.dp))
                    if (linea.storia.isEmpty()) Text("Ancora niente da raccontare.", color = Banco.testoQuieto, fontSize = 12.sp)
                    for (e in linea.storia.reversed()) {
                        Text(Linea.rigaStoria(e), fontSize = 12.sp, color = when (e.tipo) { "caduta" -> Banco.rosso; "cambio" -> VIOLA_ALTRO_PC; else -> Banco.verde })
                    }
                }
            },
            confirmButton = { TextButton(onClick = { storia = false }) { Text("Chiudi") } }
        )
    }
}

/** La fascia di riconnessione (non blocca niente) e l'annuncio del cambio di strada. */
@Composable
fun FasciaLinea(linea: StatoLinea, nomePc: String, onRiprova: () -> Unit) {
    val adesso = adessoVivo(linea.fase == "ricollego" || linea.cambio != null)
    val cambio = Linea.cambioVisibile(linea, adesso)
    AnimatedVisibility(visible = cambio != null, enter = slideInVertically() + fadeIn(), exit = fadeOut()) {
        Text(
            "⇄ ${cambio ?: ""}", color = VIOLA_ALTRO_PC, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().background(VIOLA_ALTRO_PC.copy(alpha = 0.14f)).padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
    val giu = Linea.testoRiconnessione(linea, nomePc, adesso) ?: return
    Row(
        Modifier.fillMaxWidth().background(Banco.rosso.copy(alpha = 0.14f)).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(giu, color = Banco.rosso, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            Text(
                (linea.messaggio?.let { "${it.trimEnd('.')}. " } ?: "") + "Lo schermo resta, attenuato: al ritorno si aggiorna da solo. Quello che scrivi intanto resta in coda e parte al ritorno, una volta sola.",
                color = Banco.testo, fontSize = 11.sp, maxLines = 4
            )
        }
        Spacer(Modifier.width(8.dp))
        OutlinedButton(onClick = onRiprova) { Text("Riprova adesso", fontSize = 12.sp) }
    }
}

/** I messaggi in coda: in attesa di invio, o in volo. */
@Composable
fun CodaLinea(coda: List<VoceCodaLinea>, onTogli: (String) -> Unit) {
    if (coda.isEmpty()) return
    Column(Modifier.fillMaxWidth().background(Banco.chassis).padding(horizontal = 10.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for (v in coda) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text((if (v.stato == "invio") "↗ sto mandando: «" else "⏳ in attesa di invio: «") + v.testo.take(100) + "»", color = Banco.ambra, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 2)
                if (v.stato == "attesa") TextButton(onClick = { onTogli(v.id) }) { Text("Togli", fontSize = 11.sp) }
            }
        }
    }
}

/** La mappa dei PC nella Salute: questo PC al centro, gli altri intorno, linee colorate. */
@Composable
fun MappaPcVista(m: MappaPc) {
    val centro = m.nodi.firstOrNull() ?: return
    Text("MAPPA DEI PC", color = Banco.testoQuieto, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    Box(Modifier.fillMaxWidth().aspectRatio(1.4f)) {
        Canvas(Modifier.matchParentSize()) {
            val sx = size.width / 100f
            val sy = size.height / 100f
            for (l in m.linee) {
                val n = m.nodi.firstOrNull { it.id == l.a } ?: continue
                drawLine(
                    coloreDa(l.colore), Offset(centro.x.toFloat() * sx, centro.y.toFloat() * sy), Offset(n.x.toFloat() * sx, n.y.toFloat() * sy),
                    strokeWidth = 4f, pathEffect = if (l.stato == "ok") null else PathEffect.dashPathEffect(floatArrayOf(14f, 10f))
                )
            }
            for (n in m.nodi) {
                drawCircle(if (n.io) VIOLA_ALTRO_PC else when (n.stato) { "acceso" -> Color(0xFF3FB950); "incerto" -> Color(0xFF6F767E); else -> Color(0xFFF85149) }, radius = if (n.io) 22f else 16f, center = Offset(n.x.toFloat() * sx, n.y.toFloat() * sy))
            }
        }
    }
    for (n in m.nodi) {
        val l = m.linee.firstOrNull { it.a == n.id }
        Text(if (n.io) "● ${n.nome} (questo PC, al centro)" else "● ${l?.testo ?: n.nome}", color = if (n.io) VIOLA_ALTRO_PC else l?.let { coloreDa(it.colore) } ?: Banco.testo, fontSize = 12.sp)
    }
    Text("Linea piena: si raggiunge direttamente. Tratteggiata ambra: solo via Drive, lento. Tratteggiata rossa: adesso non risponde.", color = Banco.testoQuieto, fontSize = 11.sp)
}
