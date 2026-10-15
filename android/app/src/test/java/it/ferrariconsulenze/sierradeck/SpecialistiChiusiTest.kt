package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PC 0.74.0: gli specialisti che hanno finito chiudono la loro chat da soli.
 * L'app lo legge dal PC e mostra «chat chiusa» al posto di «Guarda»; da un PC
 * vecchio, senza il campo, resta «Guarda» come prima.
 */
class SpecialistiChiusiTest {
    @Test
    fun `chiusa arriva dal PC e manca dai PC vecchi`() {
        val s = Api.json.decodeFromString(
            Specialisti.serializer(),
            """{"riga":"Lavoro diviso fra specialisti","elenco":[{"id":"c-1","ruolo":"Sviluppo","stato":"finita","sessionId":"s-1","chiusa":true},{"id":"c-2","ruolo":"Revisione","stato":"al lavoro","sessionId":"s-2"}]}"""
        )
        assertEquals(2, s.elenco.size)
        assertTrue(s.elenco[0].chiusa)
        assertFalse(s.elenco[1].chiusa)
    }
}
