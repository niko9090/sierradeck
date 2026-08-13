package it.glos.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Prove sulla firma con cui l'app si presenta alla pagina.
 *
 * Il difetto era che non si presentava affatto: la pagina la scambiava per un
 * browser e le offriva di installare l'app che stava già usando.
 */
class IdentitaTest {

    private val chrome =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36"

    @Test
    fun `la firma si aggiunge in coda senza perdere quella di sistema`() {
        val ua = Identita.userAgent(chrome, "1.3.0")
        assertTrue("deve restare riconoscibile come Android", ua.contains("Android 14"))
        assertTrue(ua.endsWith("SierraDeck/1.3.0"))
    }

    @Test
    fun `la pagina ci riconosce e legge la versione`() {
        // La stessa espressione della pagina (`versioneApp` in client-pagina.ts):
        // se cambia una delle due, questa prova cade.
        val comeLaPagina = Regex("""SierraDeck/([0-9]+\.[0-9]+\.[0-9]+)""")
        val trovata = comeLaPagina.find(Identita.userAgent(chrome, "1.3.0"))?.groupValues?.get(1)
        assertEquals("1.3.0", trovata)
    }

    @Test
    fun `chiamata due volte non raddoppia la firma`() {
        val una = Identita.userAgent(chrome, "1.3.0")
        assertEquals(una, Identita.userAgent(una, "1.3.0"))
    }

    @Test
    fun `senza uno user agent di sistema resta almeno la firma`() {
        assertEquals("SierraDeck/1.3.0", Identita.userAgent(null, "1.3.0"))
        assertEquals("SierraDeck/1.3.0", Identita.userAgent("", "1.3.0"))
    }
}
