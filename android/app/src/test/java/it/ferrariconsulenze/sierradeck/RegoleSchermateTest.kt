package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.AdessoTelefono
import it.ferrariconsulenze.sierradeck.nucleo.AutopilotaBreve
import it.ferrariconsulenze.sierradeck.nucleo.AvanzamentoTelefono
import it.ferrariconsulenze.sierradeck.nucleo.Decisa
import it.ferrariconsulenze.sierradeck.nucleo.RegoleSchermate
import it.ferrariconsulenze.sierradeck.nucleo.Tono
import it.ferrariconsulenze.sierradeck.nucleo.VoceAttesa
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class RegoleSchermateTest {
    private val ora = Instant.parse("2026-11-11T10:00:00Z").toEpochMilli()

    @Test fun consensoRiconosciutoEInOrdine() {
        val s = listOf("Sì, sempre", "No", "Sì, questa volta")
        assertTrue(RegoleSchermate.eConsenso(s))
        assertEquals(listOf("No", "Sì, questa volta", "Sì, sempre"), RegoleSchermate.ordineConsenso(s))
        assertFalse(RegoleSchermate.eConsenso(listOf("Sì", "No")))
    }

    @Test fun rigaSeNonRispondi() {
        assertEquals("Aspetta te: non scelgo io al posto tuo", RegoleSchermate.rigaSeNonRispondi(null, true, "A", ora))
        assertEquals("Se non rispondi: fra 40 min scelgo io «A»", RegoleSchermate.rigaSeNonRispondi("2026-11-11T10:40:00Z", false, "A", ora))
        assertEquals("Se non rispondi: fra 2 ore scelgo io la strada più prudente", RegoleSchermate.rigaSeNonRispondi("2026-11-11T12:00:00Z", null, null, ora))
        assertNull(RegoleSchermate.rigaSeNonRispondi(null, null, "A", ora))
    }

    @Test fun rigaDecisa() {
        assertEquals("Hai risposto: Sì", RegoleSchermate.rigaDecisa(Decisa("tu", "Sì", "")))
        assertEquals("Ha scelto il programma: No", RegoleSchermate.rigaDecisa(Decisa("programma", "No", "")))
        assertEquals("Non serve più", RegoleSchermate.rigaDecisa(Decisa("superata", "", "")))
    }

    @Test fun schedeInOrdineESenzaArchiviati() {
        val a = listOf(
            AutopilotaBreve(id = "1", nome = "Riposo", adesso = AdessoTelefono("A riposo", "riposo")),
            AutopilotaBreve(id = "2", nome = "Lavora", adesso = AdessoTelefono("Al lavoro", "lavora"), avanzamento = AvanzamentoTelefono(140, 25)),
            AutopilotaBreve(id = "3", nome = "Fermo", adesso = AdessoTelefono("Fermo per un errore", "fermo")),
            AutopilotaBreve(id = "4", nome = "Aspetta", adesso = AdessoTelefono("Aspetta te", "aspetta")),
            AutopilotaBreve(id = "5", nome = "Vecchio", archiviato = true)
        )
        val s = RegoleSchermate.schedeWorkspace(a)
        assertEquals(listOf("3", "4", "2", "1"), s.map { it.id })
        assertEquals(100, s[2].percento)
        assertEquals(Tono.FERMO, s[0].tono)
    }

    @Test fun adessoDaUnPcDiPrima() {
        assertEquals("A riposo" to Tono.RIPOSO, RegoleSchermate.adessoDi(AutopilotaBreve(id = "x", nome = "x")))
    }

    @Test fun parole() {
        assertEquals("manca circa 25 min", RegoleSchermate.mancaCirca(25))
        assertEquals("manca circa 2 ore", RegoleSchermate.mancaCirca(120))
        assertNull(RegoleSchermate.mancaCirca(0))
        assertEquals("Sistema la barra", RegoleSchermate.titolo(null, "[k12] sistema la barra"))
        assertEquals("Dal PC", RegoleSchermate.titolo("Dal PC", "k1 x"))
        assertEquals("Collaudo", RegoleSchermate.ruolo(null, "verificatore"))
        assertEquals(0xFF4AA3FFL, RegoleSchermate.argbRuolo("#4aa3ff"))
        assertNull(RegoleSchermate.argbRuolo("blu"))
        assertEquals("in fila, 2°", RegoleSchermate.statoVoce(VoceAttesa(posizione = 2), false))
        assertEquals("mancano circa 12 min", RegoleSchermate.statoVoce(VoceAttesa(minutiStimati = 11.6), true))
    }
}
