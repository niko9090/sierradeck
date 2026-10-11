package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

/**
 * PC 0.60.9: una chat chiusa da te sul computer, vista dall'app. La risposta di
 * `/api/stato` con `chiuse` (dati d'esempio); un computer vecchio non la manda.
 */
class ChiuseDaTeTest {
    private val sessione = "11111111-2222-4333-8444-555555555555"
    private val vista = Chat(id = "pane-a", titolo = "Prova", sessione = sessione)

    @Test
    fun `chiusa da te - si torna all elenco e lo si dice con l ora`() {
        val s = Api.json.decodeFromString(Stato.serializer(), """{"chat":[],"chiuse":[{"sessione":"$sessione","il":"2026-10-11T15:47:00.000Z"}]}""")
        val c = ChiuseDaTe.chiusaDi(vista, s.chat, s.chiuse)
        assertEquals(sessione, c?.sessione)
        val testo = ChiuseDaTe.avviso("Prova", c!!, ZoneId.of("UTC"))
        assertTrue(testo, testo.contains("alle 15:47"))
        assertTrue(testo.contains("Riprendi una conversazione"))
    }

    @Test
    fun `sparita senza chiusura voluta (riavvio, guasto) o ancora aperta - niente avviso`() {
        assertNull(ChiuseDaTe.chiusaDi(vista, emptyList(), emptyList()))
        assertNull(ChiuseDaTe.chiusaDi(vista, listOf(vista), listOf(ChiusaDaTe(sessione, "2026-10-11T15:47:00.000Z"))))
        // Un computer vecchio: niente campo, niente avviso.
        val vecchio = Api.json.decodeFromString(Stato.serializer(), """{"chat":[]}""")
        assertTrue(vecchio.chiuse.isEmpty())
    }
}
