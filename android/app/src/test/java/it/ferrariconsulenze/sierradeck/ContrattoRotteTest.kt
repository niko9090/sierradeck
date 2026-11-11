package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.rete.Strade
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Ponte
import it.ferrariconsulenze.sierradeck.schermate.vecchie.chiave

/**
 * Il contratto delle rotte col PC (11/11): lo scrive il vitest
 * `tests/android/rotte-lente-app.test.ts` dalle costanti vere del PC, e qui si
 * controlla che l'app lo rispetti. Prima il vitest leggeva `Api.kt` col testo:
 * spostare il file lo rompeva.
 */
class ContrattoRotteTest {
    private val contratto = Api.json.parseToJsonElement(File("src/test/resources/contratto/rotte.json").readText()).jsonObject
    private fun elenco(chiave: String) = contratto[chiave]!!.jsonArray.map { it.jsonPrimitive.content }

    @Test
    fun `le rotte lente dell'app comprendono quelle del ponte del PC`() {
        assertEquals(emptyList<String>(), elenco("lente").filter { it !in Api.ROTTE_LENTE })
        // Il Centralino (11/11) usa le sue: devono comprendere le stesse.
        assertEquals(emptyList<String>(), elenco("lente").filter { it !in Strade.LENTE })
        assertEquals(emptyList<String>(), Api.ROTTE_LENTE.filter { it !in Strade.LENTE })
    }

    @Test
    fun `le rotte del ponte sono quelle del PC`() {
        assertEquals(elenco("ponte").toSet(), Ponte.ROTTE.toSet())
    }
}
