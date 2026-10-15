package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 2.72.1 (PC 0.72.1). Nicholas, 15/10: «vedo ancora un sacco di messaggi
 * "consegnato alle" che occupano tutto lo spazio; le domande non si capiscono,
 * scrive troppe cose ed è una chat a sé stante; deve esserci la domanda e le
 * risposte eventuali».
 */
class SchedaDomandaTest {
    private fun msg(id: String, stato: String, dettaglio: String, manda: Boolean = false) =
        StatoMessaggio(id = id, testo = "testo $id", stato = stato, dettaglio = dettaglio, mandaAdesso = manda)

    @Test
    fun `i consegnati sono spunte, dal più vecchio, con ora e testo da leggere toccando`() {
        val c = messaggiCompatti(listOf(
            msg("c2", "consegnato", "consegnato alle 10:02"),
            msg("c1", "consegnato", "consegnato alle 10:01"),
            msg("c0", "consegnato", "consegnato alle 10:00")
        ))
        assertEquals(listOf("c0", "c1", "c2"), c.segni.map { it.id })
        assertTrue(c.segni.all { it.consegnato })
        assertEquals("consegnato alle 10:00: testo c0", c.segni[0].titolo)
        assertNull(c.fermo)
    }

    @Test
    fun `chi è fermo è una riga sola, con il più vecchio, il numero e Manda adesso`() {
        val c = messaggiCompatti(listOf(
            msg("a", "in attesa", "in attesa da 8 min", manda = true),
            msg("b", "in attesa", "in attesa da 5 min", manda = true),
            msg("v", "in consegna", "in consegna alla chat"),
            msg("c", "consegnato", "consegnato alle 10:00")
        ))
        assertEquals(MessaggioFermo("in attesa da 8 min", 2, "testo a", true), c.fermo)
        assertEquals(listOf(true, false), c.segni.map { it.consegnato })
    }

    @Test
    fun `la scheda della domanda arriva dal PC e si legge`() {
        val c = Api.json.decodeFromString(Conversazione.serializer(), """
            {"chiave":"chat:c-1","tipo":"chat","titolo":"Prova","chiede":true,"risposta":{"via":"scrivi","chat":"c-1"},
             "scelte":{"chat":"c-1","opzioni":[{"numero":1,"testo":"Yes","scelta":true}]},
             "scheda":{"chi":"chat «Prova» · SierraDeck","domanda":"Do you want to proceed?",
               "scelte":[{"testo":"Yes (Recommended)","numero":1,"consigliata":true},{"testo":"Type something.","numero":2,"libera":true}],
               "dettagli":[{"etichetta":"Lo schermo della chat","testo":"Bash command\nDo you want to proceed?"}],
               "segnaposto":"Oppure scrivile tu","poi":2}}
        """)
        val s = c.scheda!!
        assertEquals("Do you want to proceed?", s.domanda)
        assertTrue(s.scelte[0].consigliata)
        assertTrue(s.scelte[1].libera)
        assertEquals(2, s.poi)
        assertEquals("★ Yes (Recommended)", etichettaScelta(s.scelte[0]))
        assertEquals("Lo schermo della chat", s.dettagli[0].etichetta)
    }

    @Test
    fun `la linguetta dell'autopilota ha la stessa scheda, e un PC vecchio non la manda`() {
        val d = Api.json.decodeFromString(DomandaScheda.serializer(), """
            {"chiave":"via:ap-1","tipo":"via","testo":"Mi dai il via?","opzioni":["Vai"],"origine":"via",
             "scheda":{"chi":"autopilota «Notte»","domanda":"Si è preparato: gli dai il via?","scelte":[{"testo":"Vai","consigliata":true}],"dettagli":[],"segnaposto":"Oppure scrivigli"}}
        """)
        assertEquals("Si è preparato: gli dai il via?", d.scheda?.domanda)
        val vecchia = Api.json.decodeFromString(DomandaScheda.serializer(), """{"chiave":"d:1","tipo":"domanda","testo":"x","opzioni":[]}""")
        assertNull(vecchia.scheda)
        assertFalse(SceltaScheda(testo = "x").consigliata)
        assertEquals("☑ x", etichettaScelta(SceltaScheda(testo = "x", spuntata = true)))
    }
}
