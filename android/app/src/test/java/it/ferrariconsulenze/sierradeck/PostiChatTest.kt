package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PC 0.82.0: «N di M chat» in cima agli autopiloti. Il computer manda in
 * `/api/stato` i numeri e i testi già scritti (riga e perché), uguali al PC e
 * alla pagina; un computer più vecchio non li manda.
 */
class PostiChatTest {
    @Test
    fun `il computer pieno con la fila - riga e perche come li scrive lui`() {
        val s = Api.json.decodeFromString(
            Stato.serializer(),
            """{"chat":[],"postiChat":{"attive":3,"posti":3,"inFila":2,"regolazione":0,"perche":"carico","risale":false,"riga":"3 di 3 chat · 2 in fila","spiega":"Il PC è sotto sforzo: le chat nuove aspettano finché si libera."}}"""
        )
        val p = s.postiChat!!
        assertEquals("3 di 3 chat · 2 in fila", p.riga)
        assertTrue(p.pieno)
        assertTrue(p.spiega.contains("sotto sforzo"))
    }

    @Test
    fun `c e posto - non e pieno`() {
        assertFalse(PostiChat(attive = 1, posti = 6, riga = "1 di 6 chat").pieno)
    }

    @Test
    fun `un computer piu vecchio non lo manda - niente riga`() {
        assertNull(Api.json.decodeFromString(Stato.serializer(), """{"chat":[]}""").postiChat)
    }
}
