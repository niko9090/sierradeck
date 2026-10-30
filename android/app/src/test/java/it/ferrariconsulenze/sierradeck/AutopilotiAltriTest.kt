package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Gli autopiloti degli altri PC (app 2.59.0, PC 0.59.0) sulla risposta di
 * `/api/autopiloti/altri` scritta dal test del PC
 * (`tests/main/autopiloti-altri.test.ts`), su dati d'esempio.
 */
class AutopilotiAltriTest {
    private val pc: List<AutopilotiDiPc> = Api.json.decodeFromString(
        RispostaAutopilotiAltri.serializer(),
        javaClass.classLoader!!.getResource("autopiloti-altri/altri-0.59.json")!!.readText()
    ).pc

    @Test
    fun `ogni autopilota dice dove gira`() {
        val righe = AutopilotiAltri.righe(pc)
        assertEquals(1, righe.size)
        assertEquals("PORTATILE-ESEMPIO", righe[0].first.nome)
        assertEquals("ap-prova", righe[0].second.id)
        assertEquals("gira su PORTATILE-ESEMPIO", AutopilotiAltri.giraSu(righe[0].first.nome))
    }

    @Test
    fun `un PC che non risponde ha il suo perché, con le strade provate`() {
        val g = AutopilotiAltri.guasti(pc).single()
        assertEquals("PC-VECCHIO", g.nome)
        assertTrue(g.errore!!.contains("Strade provate"))
    }

    @Test
    fun `le azioni passano dal ponte, rispondere compreso`() {
        for (r in listOf("/api/autopilota", "/api/autopilota/dialogo", "/api/autopilota/avanzamento", "/api/rispondi")) assertTrue(r, r in Ponte.ROTTE)
    }
}
