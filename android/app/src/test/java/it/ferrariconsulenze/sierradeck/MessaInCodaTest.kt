package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.ErroriInvio
import it.ferrariconsulenze.sierradeck.nucleo.MessaInCoda
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MessaInCodaTest {
    @Test fun codaNonProntaLoDice() {
        val e = ErroriInvio()
        var partito = false
        assertFalse(MessaInCoda.tenta(e, "chat:a", codaPronta = false, telefonoPronto = true) { partito = true })
        assertFalse(partito)
        assertEquals(MessaInCoda.CODA_NON_PRONTA, e.motivi.value["chat:a"])
    }

    @Test fun telefonoNonProntoLoDice() {
        val e = ErroriInvio()
        assertFalse(MessaInCoda.tenta(e, "ap:x", codaPronta = true, telefonoPronto = false) { })
        assertEquals(MessaInCoda.TELEFONO_NON_PRONTO, e.motivi.value["ap:x"])
    }

    @Test fun pcInAggiornamentoLoDice() {
        val e = ErroriInvio()
        assertFalse(MessaInCoda.tenta(e, "chat:a", true, true, aggiornando = true) { })
        assertEquals(MessaInCoda.PC_IN_AGGIORNAMENTO, e.motivi.value["chat:a"])
    }

    @Test fun erroreNelSalvataggioNonESilenzioso() {
        val e = ErroriInvio()
        assertFalse(MessaInCoda.tenta(e, "chat:a", true, true) { throw java.io.IOException("disco pieno") })
        assertEquals(MessaInCoda.NON_SALVATO, e.motivi.value["chat:a"])
    }

    @Test fun riuscitoPulisceSoloLaSuaCasella() {
        val e = ErroriInvio()
        e.segna("chat:a", "x"); e.segna("chat:b", "y")
        assertTrue(MessaInCoda.tenta(e, "chat:a", true, true) { })
        assertNull(e.motivi.value["chat:a"])
        assertEquals("y", e.motivi.value["chat:b"])
    }

    @Test fun fraseCorta() {
        assertEquals("Non inviato: il PC si sta aggiornando", MessaInCoda.frase(MessaInCoda.PC_IN_AGGIORNAMENTO))
    }
}
