package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.Ponte
import it.ferrariconsulenze.sierradeck.schermate.radice.Dettaglio
import it.ferrariconsulenze.sierradeck.schermate.radice.Navigazione
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** k-tpc2: le chat dei PC raggiunti dal ponte si aprono, sul PC giusto. */
class ChatDelPonteTest {
    private val accoppiati = listOf("pc-a", "pc-b")

    @Test
    fun `toccare una chat di un PC del ponte apre il dettaglio su quel PC`() {
        val d = Navigazione.chatDi("pc-ponte", "c1", accoppiati)
        assertEquals(Dettaglio.Chat("c1", sulPonte = "pc-ponte"), d)
        val p = Navigazione.apri(Navigazione.INIZIO, d)
        assertEquals(d, p.dettaglio)
        assertTrue(p.tuttoSchermo)
        // le chiamate della chat vanno a quel PC attraverso il ponte
        assertEquals("pc-ponte", d.api(Api("http://x", "k")).ponte)
    }

    @Test
    fun `una chat di un PC accoppiato resta una chat normale`() {
        val d = Navigazione.chatDi("pc-b", "c1", accoppiati)
        assertNull(d.sulPonte)
        assertNull(d.api(Api("http://x", "k")).ponte)
    }

    @Test
    fun `storia e scrivi passano dal ponte`() {
        assertTrue("/api/storia" in Ponte.ROTTE)
        assertTrue("/api/scrivi" in Ponte.ROTTE)
    }

    @Test
    fun `il PC del ponte si ritrova dopo la rotazione`() {
        val p = Navigazione.apri(Navigazione.INIZIO, Dettaglio.Chat("c|1", sulPonte = "pc-ponte"))
        assertEquals(p, Navigazione.riprendi(Navigazione.salva(p)))
    }
}
