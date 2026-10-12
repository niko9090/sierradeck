package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il tasto «?» (app 2.62.0): la spiegazione completa sta dietro al «?», e un
 * «?» senza niente da spiegare non si mostra.
 */
class AiutoTest {
    @Test
    fun `il titolo dice di cosa parla`() {
        assertEquals("Cos’è «Code dei progetti»?", Spiegazioni.titolo("Code dei progetti"))
        assertEquals("Cos’è?", Spiegazioni.titolo(null))
        assertEquals("Cos’è?", Spiegazioni.titolo("  "))
    }

    @Test
    fun `il lettore dello schermo legge di cosa e la spiegazione`() {
        assertEquals("Spiegazione: Partenza", Spiegazioni.descrizione("Partenza"))
        assertEquals("Spiegazione", Spiegazioni.descrizione(null))
    }

    @Test
    fun `niente da spiegare, niente punto di domanda`() {
        assertFalse(Spiegazioni.serve(null))
        assertFalse(Spiegazioni.serve(""))
        assertFalse(Spiegazioni.serve("   "))
        assertTrue(Spiegazioni.serve("Al 100% le chat si fermano fino all’azzeramento."))
    }
}
