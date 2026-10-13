package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Il trasloco (PC 0.65.0) sugli esempi fatti dalle funzioni vere del PC
 * (`tests/shared/trasloco.test.ts`): uno fermo, uno finito.
 */
class TraslocoTest {
    private val t: List<TraslocoDrive> = Api.json.decodeFromString(
        ListSerializer(TraslocoDrive.serializer()),
        javaClass.classLoader!!.getResource("trasloco/trasloco-0.65.json")!!.readText()
    )
    private val adesso = java.time.Instant.parse("2026-10-12T10:00:00Z").toEpochMilli()

    @Test
    fun `fermo - il passo di adesso, il motivo, la percentuale del PC`() {
        val f = t[0]
        assertEquals("fermo", TraslocoRegole.stato(f))
        assertEquals("analisi" to "Confronto i file", TraslocoRegole.attuale(f))
        assertEquals(20, TraslocoRegole.percento(f))
        assertTrue(f.fermo!!.riprovaDaSolo)
        assertEquals("✓ Raccolgo le copie — 1 copia salvata sul Drive", TraslocoRegole.riga(f, "raccolta", "Raccolgo le copie"))
        assertEquals("! Confronto i file", TraslocoRegole.riga(f, "analisi", "Confronto i file"))
        assertFalse(TraslocoRegole.annullabile(f, adesso))
        assertTrue(TraslocoRegole.lavora(listOf(f)).not())
    }

    @Test
    fun `finito - cento per cento, il riassunto e «Annulla tutto» per 30 giorni`() {
        val f = t[1]
        assertEquals("fatto", TraslocoRegole.stato(f))
        assertEquals(100, TraslocoRegole.percento(f))
        assertEquals(null, TraslocoRegole.attuale(f))
        assertTrue(f.riassunto.last().contains("«Annulla tutto»"))
        assertTrue(TraslocoRegole.annullabile(f, adesso))
        assertFalse(TraslocoRegole.annullabile(f, java.time.Instant.parse("2026-12-01T00:00:00Z").toEpochMilli()))
    }

    @Test
    fun `PC spento (0_71_1) - il motivo in chiaro con il nome scelto e le due scelte`() {
        val f: TraslocoDrive = Api.json.decodeFromString(
            TraslocoDrive.serializer(),
            javaClass.classLoader!!.getResource("trasloco/trasloco-pc-spento-0.71.1.json")!!.readText()
        )
        val c = f.fermoChiaro!!
        assertTrue(c.scelte)
        assertEquals("pc-port", c.pc!!.pc)
        assertEquals("Portatile di casa", c.pc!!.nome)
        assertTrue(c.testo.startsWith("«Portatile di casa» è spento"))
        assertEquals("fermo", TraslocoRegole.stato(f))
    }
}
