package it.ferrariconsulenze.sierradeck

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import it.ferrariconsulenze.sierradeck.nucleo.ApriChatAltrove
import it.ferrariconsulenze.sierradeck.nucleo.Opzione
import it.ferrariconsulenze.sierradeck.nucleo.SchedaDomanda
import it.ferrariconsulenze.sierradeck.rete.Api
import it.ferrariconsulenze.sierradeck.rete.PcPonte
import it.ferrariconsulenze.sierradeck.rete.SuPc
import it.ferrariconsulenze.sierradeck.schermate.radice.Apertura
import it.ferrariconsulenze.sierradeck.schermate.radice.Scheda

/**
 * 2.84.1 (PC 0.84.1): le domande delle chat degli altri PC. Le opzioni fisse
 * di Claude Code arrivano dal PC con `etichetta` in italiano («Scrivo io la
 * risposta», «Ne parlo nella chat»), al tocco si manda `testo`; se il testo
 * della domanda manca, la scheda ha `apri` e il tasto porta alla chat su quel PC.
 */
class DomandeAltriPcTest {
    @After
    fun pulisci() {
        SuPc.corrente = null
        Apertura.sessioneRichiesta = null
        Apertura.schedaRichiesta = null
    }

    @Test
    fun `«Apri la chat su PC» porta alle chat di quel PC, dentro quella conversazione`() {
        Apertura.apriChatSu(ApriChatAltrove(pcId = "pc-b", pc = "PC-ESEMPIO", sessione = "s-prova", cwd = "C:\\x", titolo = "Prova"))
        assertEquals(PcPonte("pc-b", "PC-ESEMPIO"), SuPc.corrente)
        assertEquals("s-prova", Apertura.sessioneRichiesta)
        assertEquals(Scheda.CHAT, Apertura.schedaRichiesta)
    }

}
