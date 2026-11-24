package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.schermate.radice.Dettaglio
import it.ferrariconsulenze.sierradeck.schermate.radice.Navigazione
import it.ferrariconsulenze.sierradeck.schermate.radice.SezioneAltro
import it.ferrariconsulenze.sierradeck.schermate.radice.VoceBarra
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** «La chat a tutto schermo» (app 3.5.0): quali posti tolgono le due barre. */
class TuttoSchermoTest {
    @Test
    fun `una chat prende tutto lo schermo`() {
        assertTrue(Navigazione.apri(Navigazione.INIZIO, Dettaglio.Chat("c1")).tuttoSchermo)
    }

    @Test
    fun `la chat con l'autopilota di un workspace prende tutto lo schermo`() {
        assertTrue(Navigazione.apri(Navigazione.INIZIO, Dettaglio.Autopilota("a1")).tuttoSchermo)
    }

    @Test
    fun `l'elenco, le domande, i file e Altro tengono le barre`() {
        assertFalse(Navigazione.INIZIO.tuttoSchermo)
        assertFalse(Navigazione.apri(Navigazione.INIZIO, Dettaglio.Domanda("d1")).tuttoSchermo)
        assertFalse(Navigazione.apri(Navigazione.INIZIO, Dettaglio.Cartella("p")).tuttoSchermo)
        assertFalse(Navigazione.apri(Navigazione.INIZIO, Dettaglio.Sezione(SezioneAltro.CHAT)).tuttoSchermo)
        assertFalse(Navigazione.tocca(Navigazione.apri(Navigazione.INIZIO, Dettaglio.Chat("c1")), VoceBarra.FILE).tuttoSchermo)
    }

    @Test
    fun `tornando indietro le barre ricompaiono`() {
        val aperta = Navigazione.apri(Navigazione.INIZIO, Dettaglio.Autopilota("a1"))
        assertFalse(Navigazione.indietro(aperta)!!.tuttoSchermo)
    }
}
