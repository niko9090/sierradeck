package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.ComponiWorkspace
import org.junit.Assert.assertEquals
import org.junit.Test

/** La riga «Avanzamento» in alto nel workspace: sempre scritta, anche senza dato. */
class RigaAvanzamentoTest {
    @Test fun conLaPercentualeDice80() {
        assertEquals("Avanzamento 80%", ComponiWorkspace.testoAvanzamento(80))
    }

    @Test fun senzaDatoDiceTrattino() {
        assertEquals("Avanzamento —", ComponiWorkspace.testoAvanzamento(null))
    }
}
