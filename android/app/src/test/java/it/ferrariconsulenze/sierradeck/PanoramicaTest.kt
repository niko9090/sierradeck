package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import it.ferrariconsulenze.sierradeck.nucleo.Battuta
import it.ferrariconsulenze.sierradeck.nucleo.Panoramica
import it.ferrariconsulenze.sierradeck.nucleo.SchedaPanoramica

/** PC 0.77.0: le regole della Panoramica, uguali a `src/shared/panoramica.ts`. */
class PanoramicaTest {
    private fun s(id: String, stato: String, nataIl: Long, ruolo: String? = null) = SchedaPanoramica(id = id, titolo = id, stato = stato, nataIl = nataIl, ruolo = ruolo)

    @Test fun pianoDalPc() {
        val p = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }.decodeFromString<Panoramica>(
            """{"workspace":"W","situazione":{"obiettivo":"o","stato":{"id":"da-verificare","parola":"da verificare","colore":"ambra","simbolo":"◐"},"criteri":{"fatti":0,"totali":2,"testo":"0/2","elenco":[{"descrizione":"a","esito":"no"},{"descrizione":"b","esito":"mai"}]}},"piano":[{"fase":"in-revisione","nome":"In revisione","compiti":[{"id":"c-2","testo":"Media","fase":"in-revisione","ruolo":"revisione","autore":"sviluppo","giri":1}]}],"schede":[{"id":"p","stato":"ferma","specialista":true,"soloMia":true}]}"""
        )
        assertEquals("da verificare", p.situazione?.stato?.parola)
        assertEquals(listOf("no", "mai"), p.situazione?.criteri?.elenco?.map { it.esito })
        assertEquals("sviluppo", p.piano.first().compiti.first().autore)
        assertEquals(true, p.schede.first().soloMia)
    }

}
