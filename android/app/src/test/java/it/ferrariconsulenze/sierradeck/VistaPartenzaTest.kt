package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.MemoriaVistaPartenza
import it.ferrariconsulenze.sierradeck.nucleo.VistaPartenza
import org.junit.Assert.assertEquals
import org.junit.Test

class VistaPartenzaTest {
    @Test fun unPcSoloRestaQuestoPc() {
        assertEquals(VistaPartenza.QUESTO_PC, MemoriaVistaPartenza().conPc(1).vista())
        assertEquals(VistaPartenza.QUESTO_PC, MemoriaVistaPartenza.vistaDiPartenza(1, VistaPartenza.TUTTI_I_PC))
    }

    @Test fun piuPcPartonoDaTutti() {
        assertEquals(VistaPartenza.TUTTI_I_PC, MemoriaVistaPartenza().conPc(2).vista())
    }

    @Test fun laSceltaQuestoPcSiRicorda() {
        val m = MemoriaVistaPartenza().conPc(2).scegli(VistaPartenza.QUESTO_PC)
        assertEquals(VistaPartenza.QUESTO_PC, m.conPc(2).vista())
    }

    @Test fun unSecondoPcCollegatoRiportaATutti() {
        val m = MemoriaVistaPartenza().conPc(2).scegli(VistaPartenza.QUESTO_PC).conPc(3)
        assertEquals(VistaPartenza.TUTTI_I_PC, m.vista())
        assertEquals(VistaPartenza.TUTTI_I_PC, MemoriaVistaPartenza().conPc(1).conPc(2).vista())
    }
}
