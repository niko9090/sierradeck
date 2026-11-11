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
import it.ferrariconsulenze.sierradeck.nucleo.Scelte
import it.ferrariconsulenze.sierradeck.rete.Api

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

}
