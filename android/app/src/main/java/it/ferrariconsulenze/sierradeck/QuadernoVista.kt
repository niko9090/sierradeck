package it.ferrariconsulenze.sierradeck

import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Il Quaderno come sul PC (0.70.0): i tag con quante schede, la ricerca, la
 * data corta, le più recenti in cima. Le stesse regole di
 * src/shared/quaderno-vista.ts.
 */
object QuadernoVista {
    /** I tag con quante schede li portano: i più usati in cima, poi in ordine alfabetico. */
    fun tuttiITag(schede: List<SchedaBreve>): List<Pair<String, Int>> =
        schede.flatMap { it.tag.distinct() }.groupingBy { it }.eachCount().toList()
            .sortedWith(compareByDescending<Pair<String, Int>> { it.second }.thenBy { it.first })

    /** Le schede con il tag scelto (se c'è) e tutte le parole della ricerca, le più recenti in cima. */
    fun filtra(schede: List<SchedaBreve>, domanda: String, tag: String?): List<SchedaBreve> {
        val parole = domanda.lowercase().split(' ').filter { it.isNotBlank() }
        return schede
            .filter { tag == null || tag in it.tag }
            .filter { s -> val dove = "${s.titolo} ${s.tag.joinToString(" ")} ${s.assaggio}".lowercase(); parole.all { it in dove } }
            .sortedByDescending { it.quando }
    }

    /** «oggi 14:20», «ieri», «3 giorni fa», «12/09», «12/09/2025». */
    fun quandoBreve(iso: String, ora: Instant, zona: ZoneId = ZoneId.systemDefault()): String {
        val t = try { OffsetDateTime.parse(iso).toInstant() } catch (_: Exception) { return iso.take(10) }
        val d = t.atZone(zona)
        val oggi = ora.atZone(zona).toLocalDate()
        val giorni = ChronoUnit.DAYS.between(d.toLocalDate(), oggi)
        fun due(n: Int) = n.toString().padStart(2, '0')
        return when {
            giorni == 0L -> "oggi ${due(d.hour)}:${due(d.minute)}"
            giorni == 1L -> "ieri"
            giorni in 2..6 -> "$giorni giorni fa"
            d.year == oggi.year -> "${due(d.dayOfMonth)}/${due(d.monthValue)}"
            else -> "${due(d.dayOfMonth)}/${due(d.monthValue)}/${d.year}"
        }
    }
}
