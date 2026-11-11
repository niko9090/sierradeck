package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.nucleo.RigheChat
import it.ferrariconsulenze.sierradeck.nucleo.Storia
import org.junit.Assert.assertEquals
import org.junit.Test

class RigheChatTest {
    @Test fun leRigheNuoveSostituisconoDaDaInPoi() {
        var r = RigheChat().unisci(Storia(da = 0, righe = listOf("a", "b", "c")))
        assertEquals(-1, RigheChat().dopo())
        assertEquals(2, r.ultima)
        // Il terminale ha riscritto la riga 2 e aggiunto la 3.
        r = r.unisci(Storia(da = 2, righe = listOf("C", "d")))
        assertEquals(listOf("a", "b", "C", "d"), r.righe.map { it.second })
        // Niente di nuovo: resta uguale.
        assertEquals(r, r.unisci(Storia(da = 4, righe = emptyList())))
    }

    @Test fun unBucoSvuotaLeVecchie() {
        val r = RigheChat().unisci(Storia(da = 0, righe = listOf("a"))).unisci(Storia(da = 100, righe = listOf("x", "y")))
        assertEquals(listOf(100, 101), r.righe.map { it.first })
        assertEquals(21, r.dopo())
    }
}
