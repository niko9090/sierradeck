package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** «Salute del sistema» sul telefono (0.44.0). */
class SaluteTest {
    @Test
    fun `la salute arriva dal computer e si legge tutta`() {
        val j = """{"scritto":"2026-10-02T12:00:00.000Z","tono":"guasto","riassunto":"1 cosa da sistemare","voci":[{"chiave":"drive","gruppo":"drive","tono":"guasto","titolo":"Drive scollegato da 9 giorni","spiegazione":"x","cosaFare":"Account → Drive → Collega","azioni":[{"id":"apri-drive","testo":"Ricollega il Drive"}]},{"chiave":"agg","gruppo":"aggiornamento","tono":"guasto","titolo":"t","spiegazione":"s","azioni":[{"id":"scarica-a-mano","testo":"Scarica","url":"https://github.com/x"},{"id":"installa","testo":"Riprova"}],"futuro":1}]}"""
        val s = Api.json.decodeFromString(Salute.serializer(), j)
        assertEquals("guasto", s.tono)
        assertEquals(2, s.voci.size)
        // Dal telefono: «scarica a mano» si', «installa» e «apri Drive» no (si fanno dal computer o in Aggiornamenti).
        assertEquals("Scarica", azioneDalTelefono(s.voci[1].azioni[0]))
        assertNull(azioneDalTelefono(s.voci[1].azioni[1]))
        assertNull(azioneDalTelefono(s.voci[0].azioni[0]))
    }

    @Test
    fun `su un computer vecchio la sezione si spegne`() {
        assertEquals(false, FunzioniPc.disponibile(FunzionePc.SALUTE, "0.43.0"))
        assertEquals("La salute del sistema arriva aggiornando il PC alla 0.44.0.", FunzioniPc.testoMancante(FunzionePc.SALUTE))
    }
}
