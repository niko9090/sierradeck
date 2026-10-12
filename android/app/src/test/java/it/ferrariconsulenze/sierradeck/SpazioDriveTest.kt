package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lo spazio sul Drive (PC 0.65.0) sulla risposta d'esempio fatta dalle
 * funzioni vere del PC (`tests/shared/spazio-drive-app.test.ts`).
 */
class SpazioDriveTest {
    private val s: StatoSpazioDrive = Api.json.decodeFromString(
        StatoSpazioDrive.serializer(),
        javaClass.classLoader!!.getResource("spazio-drive/spazio-0.65.json")!!.readText()
    )

    @Test
    fun `la misura del PC si legge, con i byte per tipo`() {
        val m = s.misura!!
        assertEquals(5, m.totale.file)
        assertEquals(9_300_000.0, m.perTipo["chat"]!!.byte, 0.0)
        assertEquals("SierraDeck usa 11 MB in 5 file · account: 3,2 GB di 15 GB", SpazioRegole.riepilogo(m))
        assertEquals(listOf("Chat: 8,9 MB · 2 file", "Progetti: 800 byte · 1 file", "Battiti e posta dei PC: 8,8 KB · 1 file", "Indice, chiavi e workspace: 1,9 MB · 1 file"), SpazioRegole.righe(m))
    }

    @Test
    fun `le proposte e le pulizie nel recupero, senza quelle annullate`() {
        assertEquals("doppie", s.proposte.single().tipo)
        assertTrue(s.proposte.single().spiega.contains("recupero"))
        assertEquals(listOf("pulizia-esempio"), SpazioRegole.inRecupero(s).map { it.id })
    }

    @Test
    fun `un PC prima della 0_65 non manda lo spazio, e il pannello si legge lo stesso`() {
        val p = Api.json.decodeFromString(PannelloDrive.serializer(), javaClass.classLoader!!.getResource("pannello-drive/pannello-0.58.json")!!.readText())
        assertNull(p.spazio)
    }

    @Test
    fun `i byte come li scrive il PC`() {
        assertEquals("512 byte", SpazioRegole.byte(512.0))
        assertEquals("1,5 KB", SpazioRegole.byte(1536.0))
        assertEquals("340 MB", SpazioRegole.byte(340.0 * 1024 * 1024))
    }
}
