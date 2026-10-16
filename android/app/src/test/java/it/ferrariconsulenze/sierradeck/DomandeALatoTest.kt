package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** PC 0.76.0: la domanda breve a lato, la stessa regola del PC e della pagina. */
class DomandeALatoTest {
    private fun conv(chiave: String, domanda: String, scelte: Int, chiede: Boolean = true, libera: Boolean = false) = Conversazione(
        chiave = chiave, chiede = chiede,
        scheda = SchedaDomanda(
            chi = "Chat", domanda = domanda,
            scelte = List(scelte) { SceltaScheda(testo = "s$it") } + (if (libera) listOf(SceltaScheda(testo = "Type something.", libera = true)) else emptyList())
        )
    )

    @Test fun breveFinoA200CaratteriE4Scelte() {
        assertTrue(RegolaDomande.breve(conv("chat:p1", "Rosso o blu?", 4)))
        assertTrue(RegolaDomande.breve(conv("chat:p1", "Rosso o blu?", 4, libera = true)))
        assertFalse(RegolaDomande.breve(conv("chat:p1", "Rosso o blu?", 5)))
        assertFalse(RegolaDomande.breve(conv("chat:p1", "x".repeat(201), 1)))
        assertFalse(RegolaDomande.breve(conv("chat:p1", "x".repeat(10) + "…", 1)))
        assertFalse(RegolaDomande.breve(conv("chat:p1", "ok?", 2, chiede = false)))
    }

    @Test fun soloQuellaDellaChatAperta() {
        val tutte = listOf(conv("chat:p1", "Rosso o blu?", 2), conv("chat:p2", "x".repeat(300), 2))
        assertEquals("chat:p1", RegolaDomande.diChat(tutte, "p1")?.chiave)
        assertNull(RegolaDomande.diChat(tutte, "p2"))
        assertNull(RegolaDomande.diChat(tutte, "p3"))
    }
}
