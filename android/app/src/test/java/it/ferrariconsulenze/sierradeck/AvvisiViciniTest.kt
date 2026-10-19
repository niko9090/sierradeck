package it.ferrariconsulenze.sierradeck

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 2.80.0, Nicholas: «arrivano mille notifiche quando un autopilota lavora». */
class AvvisiViciniTest {
    private fun stato(chiede: Boolean) = JSONObject().put(
        "chat",
        JSONArray().put(JSONObject().put("id", "c1").put("titolo", "Sito").put("chiede", chiede).put("governata", true))
    )

    @Test fun `una scelta che va e viene in meno di un minuto si annuncia una volta`() {
        val gia = mutableSetOf<String>()
        var annunci = 0
        var ora = 1_000_000L
        for (i in 0 until 10) {
            annunci += Avvisi.daAnnunciare(stato(i % 2 == 0), gia, false, ora).count { it.chiave == "k:c1" }
            ora += 3_000
        }
        assertEquals(1, annunci)
    }

    @Test fun `dopo un minuto di quiete una scelta nuova si annuncia di nuovo`() {
        val gia = mutableSetOf<String>()
        var ora = 1_000_000L
        assertEquals(1, Avvisi.daAnnunciare(stato(true), gia, false, ora).count { it.chiave == "k:c1" })
        ora += 2_000; Avvisi.daAnnunciare(stato(false), gia, false, ora)
        ora += 70_000; Avvisi.daAnnunciare(stato(false), gia, false, ora)
        ora += 1_000
        assertEquals(1, Avvisi.daAnnunciare(stato(true), gia, false, ora).count { it.chiave == "k:c1" })
    }

    @Test fun `vicini a meno di 20 secondi non suonano`() {
        assertTrue(Avvisi.suona(null, 1_000))
        assertFalse(Avvisi.suona(1_000, 15_000))
        assertTrue(Avvisi.suona(1_000, 21_000))
    }
}
