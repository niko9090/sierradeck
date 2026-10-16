package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** PC 0.77.0: le regole della Panoramica, uguali a `src/shared/panoramica.ts`. */
class PanoramicaTest {
    private fun s(id: String, stato: String, nataIl: Long, ruolo: String? = null) = SchedaPanoramica(id = id, titolo = id, stato = stato, nataIl = nataIl, ruolo = ruolo)

    @Test fun gruppiEOrdineFisso() {
        val g = RegolePanoramica.ordinaSchede(listOf(
            s("rev", "lavora", 5, "revisione"), s("norm", "ferma", 1), s("svil2", "lavora", 3, "sviluppo"),
            s("svil1", "lavora", 2, "sviluppo"), s("coll", "chiede", 9, "collaudo"), s("fine", "finita", 0, "sviluppo")
        ))
        assertEquals(listOf("chiede", "lavora", "ferma", "finita"), g.map { it.first })
        assertEquals(listOf(listOf("coll"), listOf("svil1", "svil2", "rev"), listOf("norm"), listOf("fine")), g.map { p -> p.second.map { it.id } })
    }

    @Test fun maiSalti() {
        val base = listOf(s("a", "lavora", 1, "sviluppo"), s("b", "lavora", 2, "sviluppo"), s("c", "ferma", 3), s("d", "lavora", 4, "collaudo"))
        val piatto = { x: List<SchedaPanoramica> -> RegolePanoramica.ordinaSchede(x).flatMap { p -> p.second.map { it.id } } }
        assertEquals(piatto(base), piatto(base.reversed()))
        assertEquals(listOf("a", "d", "b", "c"), piatto(base.map { if (it.id == "b") it.copy(stato = "ferma") else it }))
    }

    @Test fun linguetteEAltre() {
        val chat = (0 until 12).map { s("c$it", if (it >= 7) "lavora" else "ferma", it.toLong()) }
        val (visibili, altre) = RegolePanoramica.linguetteVisibili(RegolePanoramica.LARGHEZZA_FISSA + 5 * RegolePanoramica.LARGHEZZA_LINGUETTA, chat, "c0")
        assertFalse(altre.any { it.stato == "lavora" })
        assertEquals("c0", visibili.first().id)
        assertEquals(listOf("c0", "c7", "c8", "c9", "c10", "c11"), visibili.map { it.id })
    }

    @Test fun gruppoStabile() {
        assertEquals("chiede", RegolePanoramica.gruppoStabile("chiede", "lavora", 1000, 1000))
        assertEquals("lavora", RegolePanoramica.gruppoStabile("ferma", "lavora", 1000, 4000))
        assertEquals("ferma", RegolePanoramica.gruppoStabile("ferma", "lavora", 1000, 9000))
    }

    @Test fun righePulite() {
        val schermo = listOf("\u001B[32m● Leggo src/somma.js\u001B[0m", "● Scrivo il test", "✻ Brewing… (12s · esc to interrupt)", "────────", "❯ ", "  ⏵⏵ bypass permissions on (shift+tab to cycle)")
        assertEquals(listOf("● Scrivo il test", "✻ Brewing… (12s · esc to interrupt)"), RegolePanoramica.righeDalVivo(schermo))
        assertEquals("da 3 min", RegolePanoramica.daQuanto(0, 180_000))
    }
}
