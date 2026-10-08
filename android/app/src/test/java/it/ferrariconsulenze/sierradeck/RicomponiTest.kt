package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Lo schermo ricomposto per la larghezza del telefono (2.52.6). Nicholas
 * (08/10): «con certi PC nel cell si vede male la chat». Schermi veri di
 * Claude Code a 80, 120 e 200 colonne (`tests/fixtures/schermi-larghezze/`):
 * l'app deve dare esattamente quello che dà la funzione condivisa del PC e
 * della pagina (`ricomposti.json`), anche con un PC vecchio che non manda
 * colonne e continuazioni.
 */
class RicomponiTest {
    private val dir = File("../../tests/fixtures/schermi-larghezze")
    private val attesi = Api.json.parseToJsonElement(File(dir, "ricomposti.json").readText()).jsonObject

    private fun schermo(c: Int): Triple<List<String>, List<Boolean>, Int> {
        val j = Api.json.parseToJsonElement(File(dir, "claude-$c.json").readText()).jsonObject
        return Triple(
            j["grezze"]!!.jsonArray.map { it.jsonPrimitive.content },
            j["continua"]!!.jsonArray.map { it.jsonPrimitive.boolean },
            j["colonne"]!!.jsonPrimitive.int
        )
    }

    private fun atteso(k: String) = attesi[k]!!.jsonArray.map { it.jsonObject["tipo"]!!.jsonPrimitive.content to it.jsonObject["testo"]!!.jsonPrimitive.content }

    @Test
    fun `a 80, 120 e 200 colonne l'app ricompone come il PC e la pagina`() {
        for (c in listOf(80, 120, 200)) {
            val (g, cont, col) = schermo(c)
            assertEquals("$c", atteso("claude-$c"), Ricomponi.ricomponi(g, cont, col).map { it.tipo to it.testo })
            assertEquals("$c vecchio", atteso("claude-$c-pc-vecchio"), Ricomponi.ricomponi(g).map { it.tipo to it.testo })
        }
    }

    @Test
    fun `il paragrafo una riga sola, la tabella un blocco a griglia`() {
        for (c in listOf(80, 120, 200)) {
            val (g, cont, col) = schermo(c)
            val r = Ricomponi.ricomponi(g, cont, col)
            assertEquals(1, r.count { it.testo.startsWith("● ") })
            assertTrue(r.first { it.testo.startsWith("● ") }.testo.length > c)
            assertEquals(9, r.count { it.tipo == "griglia" && Regex("[│┌└├]").containsMatchIn(it.testo) })
            // In «Adatta» le righe della tabella stanno in un blocco solo, che scorre di lato.
            val blocchi = blocchiAdattati(g, cont, col)
            assertEquals(1, blocchi.count { it is Blocco.Griglia && it.righe.size == 9 })
        }
    }

    @Test
    fun `PC vecchio con continua di lunghezza sbagliata - si ignora, niente si rompe`() {
        val (g, _, col) = schermo(80)
        val b = blocchiAdattati(g, listOf(true), col)
        assertTrue(b.isNotEmpty())
    }
}
