package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.sottofondo.AvvisoPc
import it.ferrariconsulenze.sierradeck.sottofondo.Avvisi
import it.ferrariconsulenze.sierradeck.sottofondo.ChiusuraAvviso
import it.ferrariconsulenze.sierradeck.sottofondo.RegoleAvvisi
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AffidabilitaSottofondoTest {
    private fun av(n: Long, id: String, chiuso: ChiusuraAvviso? = null) =
        AvvisoPc(n = n, id = id, tipo = "domanda", titolo = "t", chiuso = chiuso)

    @Test fun unAvvisoChiusoNelloStessoPaccoNonSiMostra() {
        val pacco = listOf(av(1, "d1"), av(2, "d2"), av(3, "d1", ChiusuraAvviso(come = "risposta")))
        val fuori = RegoleAvvisi.senzaSuperati(pacco)
        assertEquals(listOf(2L, 3L), fuori.map { it.n })
    }

    @Test fun unaChiusuraVieneSempreTenutaPerTogliereLaNotificaVecchia() {
        val pacco = listOf(av(5, "d9", ChiusuraAvviso(come = "programma", testo = "Sì")))
        assertEquals(pacco, RegoleAvvisi.senzaSuperati(pacco))
    }

    @Test fun riapertoDopoLaChiusuraSiMostra() {
        val pacco = listOf(av(1, "d1"), av(2, "d1", ChiusuraAvviso(come = "scaduta")), av(3, "d1"))
        assertEquals(listOf(2L, 3L), RegoleAvvisi.senzaSuperati(pacco).map { it.n })
    }

    @Test fun duePacchiDelloStessoAvvisoSuonanoUnaVoltaSola() {
        val pacco = listOf(av(1, "d1"), av(4, "d1"))
        assertEquals(listOf(4L), RegoleAvvisi.senzaSuperati(pacco).map { it.n })
    }

    @Test fun laNotificaDiUnaDomandaRispostaAltroveSiTogli() {
        val stato = JSONObject("""{"domande":[{"id":"q2"}]}""")
        assertEquals(listOf("q1"), Avvisi.domandeSparite(stato, listOf("q1", "q2")))
    }

    @Test fun senzaElencoDelleDomandeNonSiTogliNiente() {
        assertTrue(Avvisi.domandeSparite(JSONObject("""{"chat":[]}"""), listOf("q1")).isEmpty())
    }

    @Test fun laStessaReteChetornaDopoLaPerditaSveglia() {
        val rete = Any()
        assertTrue(RegoleAvvisi.reteCambiata(rete, rete, persa = true))
        assertFalse(RegoleAvvisi.reteCambiata(rete, rete, persa = false))
        assertFalse(RegoleAvvisi.reteCambiata(null, rete, persa = false))
        assertTrue(RegoleAvvisi.reteCambiata(Any(), rete, persa = false))
    }

    @Test fun senzaReteSiDormeLungoMaICasiSpecialiRestano() {
        assertEquals(RegoleAvvisi.ATTESA_SENZA_RETE_MS, RegoleAvvisi.attesaConRete(60_000L, senzaRete = true))
        assertEquals(60_000L, RegoleAvvisi.attesaConRete(60_000L, senzaRete = false))
        assertEquals(0L, RegoleAvvisi.attesaConRete(0L, senzaRete = true))
        assertEquals(-1L, RegoleAvvisi.attesaConRete(-1L, senzaRete = true))
    }
}
