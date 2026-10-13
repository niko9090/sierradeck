package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** PC 0.70: il Quaderno con i tag, la ricerca e la data corta, come sul PC. */
class QuadernoVistaTest {
    private val schede = listOf(
        SchedaBreve("a.md", "Drive e token", "2026-10-10T08:00:00Z", listOf("drive", "trappola"), "scade in 7 giorni"),
        SchedaBreve("b.md", "Avvio lento", "2026-10-12T08:00:00Z", listOf("avvio"), "parte due volte"),
        SchedaBreve("c.md", "Cassaforte", "2026-10-11T08:00:00Z", listOf("drive", "drive"), "")
    )

    @Test
    fun `i tag con quante schede, senza contare due volte lo stesso`() {
        assertEquals(listOf("drive" to 2, "avvio" to 1, "trappola" to 1), QuadernoVista.tuttiITag(schede))
    }

    @Test
    fun `tag e ricerca insieme, le più recenti in cima`() {
        assertEquals(listOf("b.md", "c.md", "a.md"), QuadernoVista.filtra(schede, "", null).map { it.file })
        assertEquals(listOf("c.md", "a.md"), QuadernoVista.filtra(schede, "", "drive").map { it.file })
        assertEquals(listOf("a.md"), QuadernoVista.filtra(schede, "7 GIORNI", "drive").map { it.file })
    }

    @Test
    fun `la data corta come sul PC`() {
        val z = ZoneId.of("Europe/Rome")
        val ora = ZonedDateTime.of(2026, 10, 13, 10, 0, 0, 0, z).toInstant()
        fun iso(a: Int, m: Int, g: Int, h: Int = 12, min: Int = 0) = ZonedDateTime.of(a, m, g, h, min, 0, 0, z).toOffsetDateTime().toString()
        assertEquals("oggi 08:05", QuadernoVista.quandoBreve(iso(2026, 10, 13, 8, 5), ora, z))
        assertEquals("ieri", QuadernoVista.quandoBreve(iso(2026, 10, 12, 23), ora, z))
        assertEquals("3 giorni fa", QuadernoVista.quandoBreve(iso(2026, 10, 10), ora, z))
        assertEquals("02/09", QuadernoVista.quandoBreve(iso(2026, 9, 2), ora, z))
        assertEquals("02/09/2025", QuadernoVista.quandoBreve(iso(2025, 9, 2), ora, z))
        assertEquals("2026-10-xx", QuadernoVista.quandoBreve("2026-10-xx", ora, z))
    }

    @Test
    fun `un PC di prima senza tag né assaggio si legge lo stesso`() {
        val s = Api.json.decodeFromString(Schede.serializer(), """{"schede":[{"file":"a.md","titolo":"A","quando":"2026-10-10T08:00:00Z"}]}""")
        assertEquals(emptyList<String>(), s.schede[0].tag)
        assertEquals("", s.schede[0].assaggio)
    }
}
