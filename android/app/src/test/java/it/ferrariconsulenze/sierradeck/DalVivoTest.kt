package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Si vede sempre chi lavora (PC 0.69.0): l'app legge le parole decise dal PC
 * («al lavoro · da 12 min», «nessun segno da 10 min», lo stato di ogni
 * messaggio) e le chat in sottofondo. Con un PC più vecchio i campi mancano.
 */
class DalVivoTest {
    @Test
    fun `l'autopilota con il suo stato dal vivo`() {
        val a = Api.json.decodeFromString(AutopilotaBreve.serializer(), """
            {"id":"ap-1","nome":"Prova","stato":"lavoro","led":"led--lavoro",
             "dalVivo":{"etichetta":"al lavoro","da":"12 min","ultimaAzione":"scrive i test","senzaSegni":"nessun segno da 10 min"}}
        """)
        assertEquals("al lavoro", a.dalVivo?.etichetta)
        assertEquals("nessun segno da 10 min", a.dalVivo?.senzaSegni)
    }

    @Test
    fun `i messaggi verso la chat, con Manda adesso`() {
        val d = Api.json.decodeFromString(AutopilotaDettaglio.serializer(), """
            {"id":"ap-1","stato":"lavoro","messaggi":[
              {"id":"m-1","testo":"controlla","stato":"in attesa","dettaglio":"in attesa da 3 min","mandaAdesso":true},
              {"id":"m-0","testo":"parti","stato":"consegnato","dettaglio":"consegnato alle 20:01"}]}
        """)
        assertEquals(2, d.messaggi.size)
        assertTrue(d.messaggi[0].mandaAdesso)
        assertEquals("consegnato alle 20:01", d.messaggi[1].dettaglio)
    }

    @Test
    fun `un PC vecchio non manda niente di nuovo, e va bene`() {
        val a = Api.json.decodeFromString(AutopilotaBreve.serializer(), """{"id":"ap-1","stato":"lavoro"}""")
        assertNull(a.dalVivo)
        val c = Api.json.decodeFromString(Chat.serializer(), """{"id":"sf-1","titolo":"x","sottofondo":{"id":"autopilota:ap-1","nome":"il suo autopilota"}}""")
        assertEquals("il suo autopilota", c.sottofondo?.nome)
    }
}
