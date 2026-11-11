package it.ferrariconsulenze.sierradeck.rete

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import it.ferrariconsulenze.sierradeck.schermate.vecchie.chiave

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
    /**
     * «Linea lenta» prima di «non connesso» (PC 0.56.0, app 2.56.0): giù solo
     * dopo `GIU_DOPO_MS` senza **nessun** dato e `GIU_DOPO_FALLITI` fallimenti
     * di fila; da giù si torna verdi con `TORNA_DOPO_OK` risposte di fila.
     * Nicholas (09/10): «dice che non è connesso e la chat però scorre».
     */
    const val LENTA_DOPO_MS = 8000L
    const val GIU_DOPO_MS = 20_000L
    const val GIU_DOPO_FALLITI = 3
    const val TORNA_DOPO_OK = 2
    val ORDINE_STRADE = listOf("lan", "tailscale", "drive")
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
        is EventoLinea.Ok -> run {
            val okDiFila = l.okDiFila + 1
            val misura = (l.misure + MisuraLinea(true, maxOf(0L, e.ritardoMs), e.il)).takeLast(MISURE_TENUTE)
            // Isteresi: da giù la prima risposta fa solo «lenta».
            if (l.fase == "ricollego" && okDiFila < TORNA_DOPO_OK) {
                return@run l.copy(fase = "lenta", ultimoOk = e.il, falliti = 0, okDiFila = okDiFila, prossimoIl = null, misure = misura, strada = e.strada ?: l.strada)
            }
            var storia = l.storia
            var cambio = l.cambio
            if (l.cadutaIl != null) storia = (storia + EventoStoria("tornato", e.il, strada = e.strada, dopoMs = e.il - l.cadutaIl, tentativi = l.tentativo))
            else if (l.fase == "cerco") storia = storia + EventoStoria("collegato", e.il, strada = e.strada)
            if (e.strada != null && l.strada != null && e.strada != l.strada) {
                storia = storia + EventoStoria("cambio", e.il, da = l.strada, a = e.strada)
                cambio = Triple(l.strada, e.strada, e.il)
            }
            l.copy(
                fase = "collegato", tentativo = 0, prossimoIl = null, cadutaIl = null, motivo = null, messaggio = null,
                strada = e.strada ?: l.strada, storia = storia.takeLast(STORIA_TENUTA), cambio = cambio,
                misure = misura, ultimoOk = e.il, falliti = 0, okDiFila = okDiFila
            )
        }
        is EventoLinea.Errore -> run {
            val falliti = l.falliti + 1
            // Prima di dichiarare la caduta: con un segno di vita recente, o pochi fallimenti di fila, è solo «lenta».
            if (l.fase != "ricollego" && l.ultimoOk != null && (falliti < GIU_DOPO_FALLITI || e.il - l.ultimoOk < GIU_DOPO_MS)) {
                return@run l.copy(fase = "lenta", falliti = falliti, okDiFila = 0, motivo = e.motivo, messaggio = e.messaggio ?: l.messaggio,
                    misure = (l.misure + MisuraLinea(false, null, e.il)).takeLast(MISURE_TENUTE))
            }
            val tentativo = if (l.fase == "ricollego") l.tentativo + 1 else 1
            val storia = if (l.fase == "ricollego") l.storia else (l.storia + EventoStoria("caduta", e.il, strada = l.strada, motivo = e.motivo, messaggio = e.messaggio)).takeLast(STORIA_TENUTA)
            l.copy(
                fase = "ricollego", tentativo = tentativo, storia = storia, falliti = falliti, okDiFila = 0,
                // La caduta comincia dall'ultimo segno di vita.
                cadutaIl = if (l.fase == "ricollego") (l.cadutaIl ?: e.il) else (l.ultimoOk ?: e.il),
                prossimoIl = e.il + attesaPrima(tentativo), motivo = e.motivo, messaggio = e.messaggio ?: l.messaggio,
                misure = (l.misure + MisuraLinea(false, null, e.il)).takeLast(MISURE_TENUTE)
            )
        }
    }

    /** La fase da mostrare: collegati ma muti da `LENTA_DOPO_MS` è «lenta». La stessa per tutte le schermate. */
    fun faseVista(l: StatoLinea, adesso: Long): String =
        if (l.fase == "collegato" && l.ultimoOk != null && adesso - l.ultimoOk >= LENTA_DOPO_MS) "lenta" else l.fase

    fun parolaFase(f: String): String = when (f) { "collegato" -> "collegato"; "lenta" -> "linea lenta"; "ricollego" -> "non connesso"; else -> "mi collego…" }

    fun eOra(l: StatoLinea, ultimaIl: Long, adesso: Long): Boolean =
        if (l.fase == "ricollego") adesso >= (l.prossimoIl ?: 0L) else adesso - ultimaIl >= KEEPALIVE_OGNI_MS

    fun fraSecondi(l: StatoLinea, adesso: Long): Long = l.prossimoIl?.let { maxOf(0L, (it - adesso + 999) / 1000) } ?: 0L

    /** La chat chiusa là, il PIN, «via Drive non si fa»: la linea è su, è la richiesta a non andare. */
    fun erroreDiStrada(motivo: String): Boolean = motivo !in setOf("chat", "pin", "lento")

    fun stradaBreve(s: String?): String = when (s) { "lan" -> "rete di casa"; "tailscale" -> "Tailscale"; "drive" -> "Drive, lento"; else -> "strada non ancora nota" }
    fun icona(s: String?): String = when (s) { "lan" -> "🏠"; "tailscale" -> "🔐"; "drive" -> "☁️"; else -> "…" }

    /**
     * La strada fra il telefono e il PC accoppiato, dall'indirizzo (0.52.0):
     * 100.64–127.x è Tailscale, gli indirizzi privati sono la rete di casa.
     * Un nome o un indirizzo pubblico: non si sa.
     */
    fun stradaDiIndirizzo(indirizzo: String): String? {
        val host = indirizzo.substringAfter("://").substringBefore("/").substringBeforeLast(":").trim('[', ']')
        val p = host.split('.').mapNotNull { it.toIntOrNull() }
        if (p.size != 4) return null
        return when {
            p[0] == 100 && p[1] in 64..127 -> "tailscale"
            p[0] == 10 || (p[0] == 192 && p[1] == 168) || (p[0] == 172 && p[1] in 16..31) || p[0] == 127 -> "lan"
            else -> null
        }
    }

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
    val cambio: Triple<String, String, Long>? = null,
    /** L'ultimo segno di vita (app 2.56.0): qualunque risposta, non solo il controllo. */
    val ultimoOk: Long? = null,
    val falliti: Int = 0,
    val okDiFila: Int = 0
)

/**
 * Un solo collegamento **per PC** (app 2.56.0), condiviso da indicatore in
 * alto, chat, cambio di PC e Lavori. Lo fa avanzare ogni risposta dell'`Api`
 * verso quel PC (stato, storia, scrivi, file…): `"accoppiato"` per il PC a cui
 * il telefono è accoppiato, l'id del PC per quelli raggiunti dal ponte.
 */
object Collegamenti {
    const val ACCOPPIATO = "accoppiato"
    private val linee = androidx.compose.runtime.mutableStateMapOf<String, StatoLinea>()
    fun di(chiave: String): StatoLinea = linee[chiave] ?: Linea.NUOVA
    @Synchronized fun passo(chiave: String, e: EventoLinea): StatoLinea {
        val n = Linea.passo(linee[chiave] ?: Linea.NUOVA, e)
        linee[chiave] = n
        return n
    }
    @Synchronized fun azzera(chiave: String) { linee.remove(chiave) }
}
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
data class NodoMappa(val id: String = "", val nome: String = "", val host: String? = null, val x: Double = 50.0, val y: Double = 50.0, val io: Boolean = false, val stato: String = "incerto")
@Serializable
data class LineaMappa(val a: String = "", val strada: String? = null, val stato: String = "giu", val colore: String = "#f85149", val testo: String = "")
@Serializable
data class MappaPc(val nodi: List<NodoMappa> = emptyList(), val linee: List<LineaMappa> = emptyList())
