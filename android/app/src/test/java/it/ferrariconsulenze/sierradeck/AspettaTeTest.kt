package it.ferrariconsulenze.sierradeck

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** PC 0.70: «Aspettano te» di partenza; le chat che hanno finito il turno in «Tutte». */
class AspettaTeTest {
    @Test
    fun `il tipo del PC decide, e senza tipo si guarda chiede`() {
        assertFalse(aspettaTe(Conversazione(chiave = "a", vista = StatoVistaDrive("finito", "ha finito", "quieto"))))
        assertTrue(aspettaTe(Conversazione(chiave = "b", vista = StatoVistaDrive("permesso", "permesso", "rosso"))))
        assertTrue(aspettaTe(Conversazione(chiave = "c", chiede = true)))
        assertFalse(aspettaTe(Conversazione(chiave = "d")))
        assertTrue(aspettaTe(Conversazione(chiave = "e", tipo = "autopilota")))
    }
}
