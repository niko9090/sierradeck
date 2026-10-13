package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** «Sposta su ▾» (PC 0.71.0): i PC di arrivo e la conferma li scrive il PC, l'app li mostra. */
class SpostaSuTest {
    private val riga: RigaProgettoDrive = Api.json.decodeFromString(
        RigaProgettoDrive.serializer(),
        """{"id":"p1","nome":"prova","spostaSu":[
          {"pc":"pc-c","nome":"PC-C","qui":true,"acceso":true,"attuale":false,"testo":"PC-C (questo PC) · acceso"},
          {"pc":"pc-a","nome":"PC-A","qui":false,"acceso":true,"attuale":true,"testo":"PC-A · acceso · dove vive adesso"},
          {"pc":"pc-b","nome":"PC-B","qui":false,"acceso":false,"attuale":false,"testo":"PC-B · spento",
           "riassunto":{"titolo":"Sposta «prova» su PC-B?","righe":["Da: PC-A","Verso: PC-B"],"conferma":"Conferma: sposta su PC-B","avviso":"PC-B adesso risulta spento"}}
        ]}"""
    )

    @Test
    fun `legge i PC di arrivo e la conferma del PC`() {
        assertTrue(SpostaSu.mostra(riga))
        val b = riga.spostaSu.first { it.pc == "pc-b" }
        assertEquals("Sposta «prova» su PC-B?", SpostaSu.titolo(b, riga.nome))
        assertEquals("Da: PC-A\nVerso: PC-B\n⚠ PC-B adesso risulta spento", SpostaSu.testoConferma(b))
        assertEquals("Conferma: sposta su PC-B", SpostaSu.bottone(b))
    }

    @Test
    fun `un PC di prima senza elenco non mostra il tasto`() {
        val vecchia = Api.json.decodeFromString(RigaProgettoDrive.serializer(), """{"id":"p1","nome":"prova"}""")
        assertFalse(SpostaSu.mostra(vecchia))
    }

    @Test
    fun `senza riassunto la conferma resta comprensibile`() {
        val c = riga.spostaSu.first { it.pc == "pc-c" }
        assertEquals("Sposta «prova» su PC-C?", SpostaSu.titolo(c, "prova"))
        assertTrue(SpostaSu.testoConferma(c).contains("Annulla tutto"))
    }
}
