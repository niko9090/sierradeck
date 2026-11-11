package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import it.ferrariconsulenze.sierradeck.nucleo.SchedaDomanda
import it.ferrariconsulenze.sierradeck.rete.Api

/**
 * 2.84.3 (PC 0.84.3): sotto ogni scelta si vede cosa succede. Il PC manda
 * `conseguenza` su ogni scelta, anche per le domande scritte dal programma
 * («sono bloccato») e per le opzioni spiegate delle chat degli altri PC.
 */
class SceltaSpiegataTest {
    @Test
    fun `una scheda di un PC più vecchio, senza conseguenza, resta com'era`() {
        val s = Api.json.decodeFromString(SchedaDomanda.serializer(), """{"chi":"x","domanda":"y","scelte":[{"testo":"Sì"}]}""")
        assertNull(s.scelte[0].conseguenza)
    }
}
