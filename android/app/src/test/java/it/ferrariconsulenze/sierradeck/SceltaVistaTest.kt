package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Le domande di Claude Code nell'app (2.52.5). Nicholas (08/10): «non riesco a
 * rispondere alle domande». Le scelte sono quelle che il PC riconosce sugli
 * schermi veri (`tests/fixtures/claude-2.1.294-domande/scelte.json`, generato e
 * controllato dal test vitest `domande-claude-vere`).
 */
class SceltaVistaTest {
    private val tutte = Api.json.parseToJsonElement(File("../../tests/fixtures/claude-2.1.294-domande/scelte.json").readText()).jsonObject
    private fun scelte(nome: String): Scelte {
        val j = tutte[nome]
        require(j != null && j != JsonNull) { "nessuna scelta in $nome" }
        return Api.json.decodeFromJsonElement(Scelte.serializer(), j)
    }

    @Test
    fun `l'app legge ogni schermo vero, con le spiegazioni e la risposta libera`() {
        assertEquals(12, tutte.size)
        for (n in tutte.keys) assertTrue(n, scelte(n).opzioni.size >= 2)
        val s = scelte("singola")
        assertEquals(listOf("Rosso", "Verde", "Blu", "Type something.", "Chat about this"), s.opzioni.map { it.testo })
        assertEquals("Il colore della natura e della calma", s.opzioni[1].descrizione)
        assertTrue(s.opzioni[3].libera)
        assertFalse(s.multipla)
    }

    @Test
    fun `come si mostra un'opzione`() {
        val s = scelte("singola")
        assertEquals(SceltaVista.Etichetta("2", "Verde", "Il colore della natura e della calma"), SceltaVista.etichetta(s.opzioni[1]))
        val libera = SceltaVista.etichetta(s.opzioni[3])
        assertTrue(libera.testo.contains("parole tue"))
        assertTrue(libera.sotto!!.contains("Type something."))
        assertNull(SceltaVista.etichetta(s.opzioni[4]).sotto)
        val m = scelte("multi-spuntata")
        assertTrue(m.multipla)
        assertEquals("☑ Lunedì", SceltaVista.etichetta(m.opzioni[0]).testo)
        assertEquals("☐ Martedì", SceltaVista.etichetta(m.opzioni[1]).testo)
        val invio = m.opzioni.first { it.invio }
        assertEquals("↵", SceltaVista.etichetta(invio).numero)
        assertTrue(SceltaVista.etichetta(invio).testo.contains("Submit"))
    }

    @Test
    fun `una spunta fa una domanda nuova, un'altra domanda pure, la stessa no`() {
        assertNotEquals(SceltaVista.firma(scelte("multi")), SceltaVista.firma(scelte("multi-spuntata")))
        assertNotEquals(SceltaVista.firma(scelte("due-1")), SceltaVista.firma(scelte("due-2")))
        assertEquals(SceltaVista.firma(scelte("libera")), SceltaVista.firma(scelte("libera-sopra")))
        // Senza caselle la firma è quella di prima (2.16): i testi, uno per riga.
        assertEquals("Yes\nNo", SceltaVista.firma(scelte("permesso")))
    }

    @Test
    fun `il rifiuto del computer si dice con le sue parole`() {
        assertEquals("Già mandata: aspetta che lo schermo cambi.", SceltaVista.rifiuto(Api.Errore(409, """{"errore":"gia mandata: aspetta che lo schermo cambi"}"""), "mandarla"))
        assertTrue(SceltaVista.rifiuto(Api.Errore(409, """{"errore":"la scelta e cambiata: guarda di nuovo"}"""), "mandarla").startsWith("La scelta è cambiata"))
        val opz = "La chat aspetta che tu scelga fra: 1. Yes, 2. No. Tocca un'opzione, oppure scrivi il suo numero o il suo testo."
        assertEquals(opz, SceltaVista.rifiuto(Api.Errore(409, """{"errore":"$opz"}"""), "mandarla"))
        assertTrue(SceltaVista.rifiuto(RuntimeException("rete"), "mandarla").contains("rete"))
    }

    @Test
    fun `nelle tre schermate le opzioni passano da qui, e «Type something» non si tocca`() {
        for (f in listOf("Chat.kt", "Conversazioni.kt", "Domande.kt")) {
            val t = File("src/main/java/it/ferrariconsulenze/sierradeck/$f").readText()
            assertTrue(f, t.contains("TestoOpzione(o)"))
            assertTrue(f, t.contains("SceltaVista.SCRIVI"))
            assertFalse(f, t.contains("joinToString(\"\\n\") { it.testo }"))
        }
    }
}
