package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Il numero delle Domande del telefono e' quello del computer (0.37.2): lo
 * stesso del tasto «Domande» del PC e della sua colonna, compresi gli
 * autopiloti che aspettano il via. Da un computer piu' vecchio si conta come
 * prima.
 */
class DomandeContoTest {

    @Test
    fun `il numero viene dal computer quando lo manda`() {
        val s = Api.json.decodeFromString(
            Stato.serializer(),
            """{"domande":[{"id":"d-1","testo":"x"}],"chat":[{"id":"c","chiede":true}],"domandeInAttesa":3}"""
        )
        assertEquals(3, domandeInAttesa(s))
    }

    @Test
    fun `da un computer vecchio si contano domande e scelte`() {
        val s = Api.json.decodeFromString(
            Stato.serializer(),
            """{"domande":[{"id":"d-1","testo":"x"}],"chat":[{"id":"c","chiede":true},{"id":"e"}]}"""
        )
        assertEquals(2, domandeInAttesa(s))
    }
}
