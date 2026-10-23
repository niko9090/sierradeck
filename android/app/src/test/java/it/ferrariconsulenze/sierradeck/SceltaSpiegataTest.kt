package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 2.84.3 (PC 0.84.3): sotto ogni scelta si vede cosa succede. Il PC manda
 * `conseguenza` su ogni scelta, anche per le domande scritte dal programma
 * («sono bloccato») e per le opzioni spiegate delle chat degli altri PC.
 */
class SceltaSpiegataTest {
    @Test
    fun `«sono bloccato» dal PC, ogni scelta porta cosa succede`() {
        val json = """{"chi":"autopilota «App Android» · SierraDeck","domanda":"«App Android»: il controllo «I test passano» non passa. Come vado avanti?","scelte":[
            {"testo":"Lascia stare quel controllo e vai avanti","consigliata":true,"conseguenza":"quel controllo lo giudico io: non conta più per finire il lavoro"},
            {"testo":"Ti scrivo io cosa provare","conseguenza":"lo passo alla chat così com’è"},
            {"testo":"Sospendi l’autopilota","conseguenza":"fermo tutte le chat; lo riprendi con «Riprendi»"}],
            "dettagli":[],"segnaposto":"Scrivi tu la risposta"}"""
        val s = Api.json.decodeFromString(SchedaDomanda.serializer(), json)
        assertEquals(3, s.scelte.size)
        assertEquals("quel controllo lo giudico io: non conta più per finire il lavoro", s.scelte[0].conseguenza)
        assertEquals("★ Lascia stare quel controllo e vai avanti", etichettaScelta(s.scelte[0]))
    }

    @Test
    fun `una scheda di un PC più vecchio, senza conseguenza, resta com'era`() {
        val s = Api.json.decodeFromString(SchedaDomanda.serializer(), """{"chi":"x","domanda":"y","scelte":[{"testo":"Sì"}]}""")
        assertNull(s.scelte[0].conseguenza)
    }
}
