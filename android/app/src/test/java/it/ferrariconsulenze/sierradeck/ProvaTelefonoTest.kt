package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.ProvaTelefono
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Gli stessi casi del PC (`tests/fixtures/prova-telefono-casi.json` nel
 * programma, copiato qui in `contratto/`): telefono e PC devono dare gli
 * stessi valori, byte per byte, o nessun telefono si collega più.
 */
class ProvaTelefonoTest {
    private val casi = Api.json.parseToJsonElement(File("src/test/resources/contratto/prova-telefono-casi.json").readText()).jsonObject

    @Test
    fun `segno, chi e prova uguali a quelli del PC`() {
        val elenco = casi["casi"]!!.jsonArray
        assertTrue(elenco.size >= 3)
        for (c in elenco) {
            val o = c.jsonObject
            fun v(k: String) = o[k]!!.jsonPrimitive.content
            val segno = ProvaTelefono.segno(v("chiave"))
            assertEquals(v("caso"), v("segno"), segno)
            assertEquals(v("caso"), v("chi"), ProvaTelefono.chi(segno))
            assertEquals(v("caso"), v("prova"), ProvaTelefono.prova(segno, v("sfida")))
            assertTrue(ProvaTelefono.sfidaValida(v("sfida")))
            assertTrue(ProvaTelefono.provaBuona(segno, v("sfida"), v("prova")))
            assertFalse(ProvaTelefono.provaBuona(segno, v("sfida"), v("prova").replaceFirst(v("prova").first(), if (v("prova").first() == 'a') 'b' else 'a')))
            assertFalse(ProvaTelefono.provaBuona(segno, v("sfida"), null))
        }
    }

    @Test
    fun `le sfide storte non valgono`() {
        for (s in casi["sfideNonValide"]!!.jsonArray) assertFalse(s.toString(), ProvaTelefono.sfidaValida(s.jsonPrimitive.content))
        assertTrue(ProvaTelefono.sfidaValida(ProvaTelefono.sfidaNuova()))
    }
}
