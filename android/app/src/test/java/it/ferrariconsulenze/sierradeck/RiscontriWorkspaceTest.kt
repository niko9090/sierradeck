package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.RiscontriWorkspace
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RiscontriWorkspaceTest {
    @Test fun allaPrimaLetturaScendeSempre() {
        assertTrue(RiscontriWorkspace.scendi(true, 0, 30))
    }

    @Test fun inFondoSegueLeRigheNuove() {
        assertTrue(RiscontriWorkspace.scendi(false, 29, 30))
        assertTrue(RiscontriWorkspace.scendi(false, 27, 30))
    }

    @Test fun seHaiRialzatoLaChatNonTiPortaGiu() {
        assertFalse(RiscontriWorkspace.scendi(false, 10, 30))
    }

    @Test fun chatVuotaDiceLaVerita() {
        assertEquals("Leggo la chat…", RiscontriWorkspace.fraseChatVuota(false, false, 0))
        assertTrue(RiscontriWorkspace.fraseChatVuota(false, true, 0)!!.startsWith("Non riesco"))
        assertTrue(RiscontriWorkspace.fraseChatVuota(true, false, 0)!!.startsWith("Ancora niente"))
        assertNull(RiscontriWorkspace.fraseChatVuota(true, false, 3))
    }

    @Test fun specialistaNonConfondeErroreEVuoto() {
        assertEquals("Leggo…", RiscontriWorkspace.fraseSpecialista(null, false))
        assertTrue(RiscontriWorkspace.fraseSpecialista(null, true)!!.startsWith("Non riesco"))
        assertEquals("Non ha ancora scritto niente.", RiscontriWorkspace.fraseSpecialista(emptyList(), false))
        assertNull(RiscontriWorkspace.fraseSpecialista(listOf("riga"), false))
    }

    @Test fun esitoMossaCambiaSubito() {
        assertEquals("Mando…", RiscontriWorkspace.esitoMossa(null))
        assertEquals("Fatto.", RiscontriWorkspace.esitoMossa(true))
        assertTrue(RiscontriWorkspace.esitoMossa(false).startsWith("Il computer"))
    }
}
